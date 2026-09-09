import {
  collectAttachmentKeys,
  createDownloadPlan,
} from '../core/download-plan';
import type {
  Course,
  CourseContext,
  DownloadTask,
  DownloadTaskInput,
} from '../core/types';
import type { BlackboardClient } from '../infrastructure/blackboard/client';
import { requestId, type ExtensionResponse } from '../infrastructure/messages';

const ACTION_ATTRIBUTE = 'data-better-blackboard-action';

async function enqueue(tasks: DownloadTaskInput[]): Promise<void> {
  const response: ExtensionResponse<DownloadTask[]> =
    await browser.runtime.sendMessage({
      v: 1,
      type: 'downloads.enqueue',
      requestId: requestId(),
      tasks,
    });
  if (!response.ok) throw new Error(response.error.message);
}

function createButton(
  label: string,
  onClick: () => Promise<number>,
): HTMLElement {
  const host = document.createElement('span');
  host.setAttribute(ACTION_ATTRIBUTE, 'true');
  host.style.display = 'inline-block';
  host.style.marginInlineStart = '10px';
  host.style.verticalAlign = 'middle';

  const shadow = host.attachShadow({ mode: 'open' });
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', label);

  const style = document.createElement('style');
  style.textContent = `
    button {
      appearance: none;
      border: 1px solid #4f46e5;
      border-radius: 6px;
      background: #ffffff;
      color: #4338ca;
      cursor: pointer;
      font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 4px 8px;
      white-space: nowrap;
    }
    button:hover { background: #eef2ff; }
    button:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: .65; }
  `;

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const original = button.textContent ?? label;
    button.disabled = true;
    button.textContent = '正在准备…';
    void onClick()
      .then((count) => {
        button.textContent =
          count > 0 ? `已加入 ${count} 个文件` : '没有可下载文件';
        window.setTimeout(() => {
          button.textContent = original;
        }, 2_500);
      })
      .catch((error: unknown) => {
        button.textContent =
          error instanceof Error ? error.message : '下载准备失败';
        window.setTimeout(() => {
          button.textContent = original;
        }, 3_500);
      })
      .finally(() => {
        button.disabled = false;
      });
  });

  shadow.append(style, button);
  return host;
}

function folderPk1FromLink(anchor: HTMLAnchorElement): string | null {
  try {
    const url = new URL(anchor.href, window.location.href);
    if (!url.pathname.endsWith('/content/listContent.jsp')) return null;
    return url.searchParams.get('content_id');
  } catch {
    return null;
  }
}

export function mountEmbeddedDownloadActions(
  context: CourseContext,
  client: BlackboardClient,
  coursePromise: Promise<Course>,
): () => void {
  const mounted = new Set<HTMLElement>();

  const downloadContent = async (contentPk1: string): Promise<number> => {
    const [course, nodes] = await Promise.all([
      coursePromise,
      client.loadCurrentContent(context.coursePk1, contentPk1),
    ]);
    const keys = new Set(collectAttachmentKeys(nodes));
    const tasks = createDownloadPlan(
      { ...context, contentPk1 },
      course,
      nodes,
      keys,
    );
    await enqueue(tasks);
    return tasks.length;
  };

  const scan = (): void => {
    const list = document.querySelector<HTMLElement>(
      '#content_listContainer, ul.contentList, .contentList',
    );
    if (!list) return;

    if (!list.previousElementSibling?.hasAttribute(ACTION_ATTRIBUTE)) {
      const toolbar = document.createElement('div');
      toolbar.setAttribute(ACTION_ATTRIBUTE, 'true');
      toolbar.style.cssText =
        'display:flex;justify-content:flex-end;align-items:center;padding:8px 10px;margin:0 0 8px;border:1px solid #dbe3f0;border-radius:7px;background:#f8fafc;';
      toolbar.append(
        createButton('下载当前目录全部', () =>
          downloadContent(context.contentPk1),
        ),
      );
      list.parentElement?.insertBefore(toolbar, list);
      mounted.add(toolbar);
    }

    const anchors = list.querySelectorAll<HTMLAnchorElement>(
      'a[href*="content_id="]',
    );
    for (const anchor of anchors) {
      const contentPk1 = folderPk1FromLink(anchor);
      if (!contentPk1) continue;
      const row = anchor.closest<HTMLElement>('li, .item, tr');
      if (!row || row.querySelector(`[${ACTION_ATTRIBUTE}="folder"]`)) continue;

      const action = createButton('下载文件夹', () =>
        downloadContent(contentPk1),
      );
      action.setAttribute(ACTION_ATTRIBUTE, 'folder');
      anchor.insertAdjacentElement('afterend', action);
      mounted.add(action);
    }
  };

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    for (const element of mounted) element.remove();
  };
}
