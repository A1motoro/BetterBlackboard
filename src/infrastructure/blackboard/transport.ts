import { BbError, type SerializedBbError } from '../../core/types';
import {
  requestId,
  type ApiRequestMessage,
  type ExtensionResponse,
} from '../messages';

const API_PREFIX = '/learn/api/public/v1/';
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface ApiTransport {
  request<T>(path: string, signal?: AbortSignal): Promise<T>;
}

function errorForStatus(status: number, retryAfter?: string | null): BbError {
  if (status === 401)
    return new BbError('auth_required', 'Blackboard 登录已失效', status);
  if (status === 403)
    return new BbError('access_denied', '没有权限访问此内容', status);
  if (status === 429) {
    const suffix = retryAfter ? `，请在 ${retryAfter} 后重试` : '';
    return new BbError(
      'rate_limited',
      `Blackboard 请求过于频繁${suffix}`,
      status,
    );
  }
  return new BbError(
    'api_incompatible',
    `Blackboard API 返回 HTTP ${status}`,
    status,
  );
}

function safeApiUrl(origin: string, path: string): URL {
  const originUrl = new URL(origin);
  const url = new URL(path, originUrl);
  if (url.origin !== originUrl.origin || !url.pathname.startsWith(API_PREFIX)) {
    throw new BbError('access_denied', '已阻止非 Blackboard API 请求');
  }
  return url;
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date))
      return Math.max(0, Math.min(date - Date.now(), 30_000));
  }
  const base = Math.min(500 * 2 ** attempt, 8_000);
  return base * (0.75 + Math.random() * 0.5);
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException('请求已取消', 'AbortError'),
        );
      },
      { once: true },
    );
  });
}

export async function fetchApiJson<T>(
  origin: string,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const url = safeApiUrl(origin, path);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        redirect: 'follow',
        ...(signal ? { signal } : {}),
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        if (RETRYABLE_STATUS.has(response.status) && attempt < 2) {
          await wait(
            retryDelay(attempt, response.headers.get('retry-after')),
            signal,
          );
          continue;
        }
        throw errorForStatus(
          response.status,
          response.headers.get('retry-after'),
        );
      }

      if (!contentType.toLowerCase().includes('json')) {
        if (
          response.url.includes('/webapps/login') ||
          response.url.includes('/auth-saml/')
        ) {
          throw new BbError('auth_required', '请先重新登录 Blackboard');
        }
        throw new BbError('api_incompatible', 'Blackboard API 未返回 JSON');
      }

      return (await response.json()) as T;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof BbError) throw error;
      if (attempt < 2) {
        await wait(retryDelay(attempt, null), signal);
        continue;
      }
      throw new BbError(
        'network_unreachable',
        '无法连接 Blackboard，请检查网络或 VPN',
      );
    }
  }

  throw new BbError('unknown', '请求失败');
}

export class FetchApiTransport implements ApiTransport {
  constructor(private readonly origin: string) {}

  request<T>(path: string, signal?: AbortSignal): Promise<T> {
    return fetchApiJson<T>(this.origin, path, signal);
  }
}

export class BackgroundApiTransport implements ApiTransport {
  constructor(private readonly origin: string) {}

  async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const message: ApiRequestMessage = {
      v: 1,
      type: 'api.request',
      requestId: requestId(),
      origin: this.origin,
      path,
    };
    const response: ExtensionResponse<T> =
      await browser.runtime.sendMessage(message);
    signal?.throwIfAborted();
    if (!response) {
      throw new BbError('api_incompatible', '扩展后台没有响应');
    }
    if (response.ok) return response.data;
    const error: SerializedBbError = response.error;
    throw new BbError(error.code, error.message, error.status);
  }
}

export class FallbackApiTransport implements ApiTransport {
  constructor(
    private readonly primary: ApiTransport,
    private readonly fallback: ApiTransport,
  ) {}

  async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    try {
      return await this.primary.request<T>(path, signal);
    } catch (error) {
      // Only retry when the page context could not reach the network at all.
      // Retrying a real API error would just double the load for the same result.
      if (error instanceof BbError && error.code === 'network_unreachable') {
        return this.fallback.request<T>(path, signal);
      }
      throw error;
    }
  }
}
