import { CUHKSZ_ORIGIN, CUHKSZ_PERMISSION } from '../adapters/cuhksz';
import { BbError, type SerializedBbError } from '../core/types';
import { fetchApiJson } from '../infrastructure/blackboard/transport';
import { PersistentDownloadQueue } from '../infrastructure/download-queue';
import {
  isExtensionRequest,
  type ExtensionRequest,
  type ExtensionResponse,
} from '../infrastructure/messages';

const CONTENT_SCRIPT_ID = 'better-blackboard-cuhksz';
const CONTENT_SCRIPT_FILE = '/content-scripts/content.js' as const;

function serializeError(error: unknown): SerializedBbError {
  if (error instanceof BbError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.status === undefined ? {} : { status: error.status }),
    };
  }
  return {
    code: 'unknown',
    message: error instanceof Error ? error.message : '未知扩展错误',
  };
}

async function requireAuthorizedOrigin(origin: string): Promise<void> {
  if (origin !== CUHKSZ_ORIGIN)
    throw new BbError('access_denied', '不支持此站点');
  const allowed = await browser.permissions.contains({
    origins: [CUHKSZ_PERMISSION],
  });
  if (!allowed)
    throw new BbError('access_denied', '尚未授权此 Blackboard 站点');
}

async function injectContentScript(
  tabId: number,
  origin: string,
): Promise<void> {
  await requireAuthorizedOrigin(origin);
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || new URL(tab.url).origin !== origin) {
    throw new BbError('access_denied', '当前标签页与授权站点不匹配');
  }

  const registered = await browser.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID],
  });
  if (registered.length === 0) {
    await browser.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        matches: [`${origin}/*`],
        js: [CONTENT_SCRIPT_FILE],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  }

  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE],
  });
}

export default defineBackground(() => {
  const queue = new PersistentDownloadQueue();
  const ready = queue.init();

  // WebExtension listeners may resolve asynchronously with a response.
  browser.runtime.onMessage.addListener(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (
      rawMessage: unknown,
      sender: chrome.runtime.MessageSender,
    ): Promise<ExtensionResponse> => {
      if (!isExtensionRequest(rawMessage)) {
        return {
          ok: false,
          error: { code: 'api_incompatible', message: '消息格式无效' },
        };
      }

      const message: ExtensionRequest = rawMessage;
      try {
        await ready;
        switch (message.type) {
          case 'api.request': {
            await requireAuthorizedOrigin(message.origin);
            if (
              !sender.tab?.url ||
              new URL(sender.tab.url).origin !== message.origin
            ) {
              throw new BbError('access_denied', '请求来源与目标站点不匹配');
            }
            const data = await fetchApiJson<unknown>(
              message.origin,
              message.path,
            );
            return { ok: true, data };
          }
          case 'downloads.enqueue':
            return { ok: true, data: await queue.enqueue(message.tasks) };
          case 'downloads.cancel':
            return { ok: true, data: await queue.cancel(message.taskId) };
          case 'downloads.snapshot.get':
            return { ok: true, data: await queue.refreshProgress() };
          case 'site.inject':
            await injectContentScript(message.tabId, message.origin);
            return { ok: true, data: null };
        }
      } catch (error) {
        return { ok: false, error: serializeError(error) };
      }
    },
  );
});
