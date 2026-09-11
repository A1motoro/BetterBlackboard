import { describe, expect, it } from 'vitest';
import { BbError } from '../src/core/types';
import { fetchApiJson } from '../src/infrastructure/blackboard/transport';

class MockFetch {
  constructor(private readonly responses: Map<string, Response>) {}

  install(): () => void {
    const original = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const response = this.responses.get(url);
      if (!response) {
        throw new Error(`Mock fetch: 未配置 ${url}`);
      }
      return Promise.resolve(response);
    };
    return () => {
      globalThis.fetch = original;
    };
  }
}

describe('错误分类', () => {
  it('401 触发 auth_required', async () => {
    const restore = new MockFetch(
      new Map([
        [
          'https://bb.cuhk.edu.cn/learn/api/public/v1/test',
          new Response('Unauthorized', {
            status: 401,
            headers: { 'content-type': 'text/plain' },
          }),
        ],
      ]),
    ).install();

    try {
      await expect(
        fetchApiJson('https://bb.cuhk.edu.cn', '/learn/api/public/v1/test'),
      ).rejects.toThrow(BbError);

      await fetchApiJson(
        'https://bb.cuhk.edu.cn',
        '/learn/api/public/v1/test',
      ).catch((error: unknown) => {
        expect(error).toBeInstanceOf(BbError);
        if (error instanceof BbError) {
          expect(error.code).toBe('auth_required');
          expect(error.status).toBe(401);
        }
      });
    } finally {
      restore();
    }
  });

  it('403 触发 access_denied', async () => {
    const restore = new MockFetch(
      new Map([
        [
          'https://bb.cuhk.edu.cn/learn/api/public/v1/test',
          new Response('Forbidden', {
            status: 403,
            headers: { 'content-type': 'text/plain' },
          }),
        ],
      ]),
    ).install();

    try {
      await fetchApiJson(
        'https://bb.cuhk.edu.cn',
        '/learn/api/public/v1/test',
      ).catch((error: unknown) => {
        expect(error).toBeInstanceOf(BbError);
        if (error instanceof BbError) {
          expect(error.code).toBe('access_denied');
          expect(error.status).toBe(403);
        }
      });
    } finally {
      restore();
    }
  });

  it('429 解析 Retry-After 并触发 rate_limited', async () => {
    let attempts = 0;
    const restore = new MockFetch(new Map()).install();
    globalThis.fetch = (): Promise<Response> => {
      attempts += 1;
      // 使用较短的 Retry-After (1秒) 以避免测试超时
      return Promise.resolve(
        new Response('Too Many Requests', {
          status: 429,
          headers: {
            'content-type': 'text/plain',
            'retry-after': '1',
          },
        }),
      );
    };

    try {
      await fetchApiJson(
        'https://bb.cuhk.edu.cn',
        '/learn/api/public/v1/test',
      ).catch((error: unknown) => {
        expect(error).toBeInstanceOf(BbError);
        if (error instanceof BbError) {
          expect(error.code).toBe('rate_limited');
          expect(error.message).toContain('1');
        }
      });
      // 429 会重试,但最终仍然失败
      expect(attempts).toBe(3);
    } finally {
      restore();
    }
  }, 10_000);

  it('登录跳转视为 auth_required', async () => {
    const restore = new MockFetch(
      new Map([
        [
          'https://bb.cuhk.edu.cn/learn/api/public/v1/test',
          new Response('<html><body>Login</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
            // 模拟重定向后的 URL
          }),
        ],
      ]),
    ).install();

    // 需要模拟 Response 的 url 属性
    const mockResponse = new Response('<html><body>Login</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    Object.defineProperty(mockResponse, 'url', {
      value: 'https://bb.cuhk.edu.cn/webapps/login/',
    });

    const restore2 = new MockFetch(
      new Map([
        ['https://bb.cuhk.edu.cn/learn/api/public/v1/test', mockResponse],
      ]),
    ).install();

    try {
      await fetchApiJson(
        'https://bb.cuhk.edu.cn',
        '/learn/api/public/v1/test',
      ).catch((error: unknown) => {
        expect(error).toBeInstanceOf(BbError);
        if (error instanceof BbError) {
          expect(error.code).toBe('auth_required');
          expect(error.message).toContain('登录');
        }
      });
    } finally {
      restore2();
      restore();
    }
  });

  it('网络故障触发 network_unreachable', async () => {
    const restore = new MockFetch(new Map()).install();
    globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    try {
      await fetchApiJson(
        'https://bb.cuhk.edu.cn',
        '/learn/api/public/v1/test',
      ).catch((error: unknown) => {
        expect(error).toBeInstanceOf(BbError);
        if (error instanceof BbError) {
          expect(error.code).toBe('network_unreachable');
          expect(error.message).toContain('网络');
        }
      });
    } finally {
      restore();
    }
  });

  it('非 JSON 响应触发 api_incompatible', async () => {
    const restore = new MockFetch(
      new Map([
        [
          'https://bb.cuhk.edu.cn/learn/api/public/v1/test',
          new Response('<html>Not JSON</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        ],
      ]),
    ).install();

    try {
      await fetchApiJson(
        'https://bb.cuhk.edu.cn',
        '/learn/api/public/v1/test',
      ).catch((error: unknown) => {
        expect(error).toBeInstanceOf(BbError);
        if (error instanceof BbError) {
          expect(error.code).toBe('api_incompatible');
        }
      });
    } finally {
      restore();
    }
  });
});

describe('重试逻辑', () => {
  it('5xx 错误会重试最多3次', async () => {
    let attempts = 0;
    globalThis.fetch = (): Promise<Response> => {
      attempts += 1;
      return Promise.resolve(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
      );
    };

    try {
      await fetchApiJson(
        'https://bb.cuhk.edu.cn',
        '/learn/api/public/v1/test',
      ).catch(() => undefined);
      expect(attempts).toBe(3);
    } finally {
      // 恢复在其他测试中完成
    }
  });

  it('400 错误不重试', async () => {
    let attempts = 0;
    globalThis.fetch = (): Promise<Response> => {
      attempts += 1;
      return Promise.resolve(
        new Response('Bad Request', {
          status: 400,
          headers: { 'content-type': 'text/plain' },
        }),
      );
    };

    try {
      await fetchApiJson(
        'https://bb.cuhk.edu.cn',
        '/learn/api/public/v1/test',
      ).catch(() => undefined);
      expect(attempts).toBe(1);
    } finally {
      // 恢复在其他测试中完成
    }
  });
});
