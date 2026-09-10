import {
  collectAttachmentKeys,
  createDownloadPlan,
} from '../core/download-plan';
import type {
  ContentNode,
  Course,
  CourseContext,
  DownloadTaskInput,
} from '../core/types';
import type { BlackboardClient } from '../infrastructure/blackboard/client';
import {
  requestId,
  type EnqueueResult,
  type ExtensionResponse,
} from '../infrastructure/messages';

const ACTION_ATTRIBUTE = 'data-better-blackboard-action';
const ITEM_ID_PREFIX = 'contentListItem:';
const ATTACHMENT_LINK_SELECTOR = 'a[href*="bbcswebdav"], a[href*="xid-"]';

type ButtonVariant = 'toolbar' | 'row';

async function enqueue(tasks: DownloadTaskInput[]): Promise<EnqueueResult> {
  const response: ExtensionResponse<EnqueueResult> =
    await browser.runtime.sendMessage({
      v: 1,
      type: 'downloads.enqueue',
      requestId: requestId(),
      tasks,
    });
  if (!response.ok) throw new Error(response.error.message);
  return response.data;
}

function resultLabel(result: EnqueueResult): string {
  if (result.accepted > 0) return `已加入 ${result.accepted} 个文件`;
  if (result.duplicates > 0) return `${result.duplicates} 个文件已在队列`;
  if (result.rejected > 0) return `${result.rejected} 个文件被拦截`;
  return '没有可下载文件';
}

function downloadIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M8 1.25a.75.75 0 0 1 .75.75v6.19l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 1.06-1.06l1.97 1.97V2a.75.75 0 0 1 .75-.75Zm-4.5 11.5a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5h-9Z',
  );
  svg.append(path);
  return svg;
}

function createButton(
  label: string,
  onClick: () => Promise<EnqueueResult>,
  variant: ButtonVariant,
): HTMLElement {
  const host = document.createElement('span');
  host.setAttribute(ACTION_ATTRIBUTE, 'true');

  const shadow = host.attachShadow({ mode: 'open' });
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.dataset.variant = variant;

  const text = document.createElement('span');
  text.className = 'label';
  text.textContent = label;

  const style = document.createElement('style');
  style.textContent = `
    :host {
      display: inline-flex;
      margin-inline-start: 8px;
      vertical-align: middle;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      appearance: none;
      border: 0;
      border-radius: 999px;
      cursor: pointer;
      font: 600 12px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      white-space: nowrap;
      color: #fff;
      background: #4f46e5;
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 12%);
    }
    button[data-variant="toolbar"] { padding: 7px 12px 7px 10px; }
    button[data-variant="row"] { padding: 4px 10px 4px 8px; }
    button svg {
      width: 13px;
      height: 13px;
      flex: none;
      fill: currentColor;
    }
    button:hover { background: #4338ca; }
    button:focus-visible { outline: 2px solid #818cf8; outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: .7; }
  `;

  let restoreTimer: number | undefined;
  const setLabel = (value: string): void => {
    text.textContent = value;
  };
  const restoreAfter = (delay: number): void => {
    restoreTimer = window.setTimeout(() => {
      restoreTimer = undefined;
      setLabel(label);
    }, delay);
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
    restoreTimer = undefined;

    button.disabled = true;
    setLabel('正在准备…');
    void onClick()
      .then((result) => {
        setLabel(resultLabel(result));
        restoreAfter(2_500);
      })
      .catch((error: unknown) => {
        setLabel(error instanceof Error ? error.message : '下载准备失败');
        restoreAfter(3_500);
      })
      .finally(() => {
        button.disabled = false;
      });
  });

  button.append(downloadIcon(), text);
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

function itemPk1FromRow(row: HTMLElement): string | null {
  const host =
    row.closest<HTMLElement>(`[id^="${ITEM_ID_PREFIX}"]`) ??
    (row.id.startsWith(ITEM_ID_PREFIX) ? row : null);
  if (!host) return null;
  const pk1 = host.id.slice(ITEM_ID_PREFIX.length).trim();
  return pk1.length > 0 ? pk1 : null;
}

function attachmentLinkCount(row: HTMLElement): number {
  return row.querySelectorAll(ATTACHMENT_LINK_SELECTOR).length;
}

function itemTitle(row: HTMLElement): string {
  const heading = row.querySelector('h3, .item h3, .itemName');
  const text = heading?.textContent?.replace(/\s+/g, ' ').trim();
  return text && text.length > 0 ? text : '未命名内容';
}

function insertRowAction(row: HTMLElement, action: HTMLElement): void {
  const headingLink = row.querySelector<HTMLElement>(
    'h3 a, .item h3 a, .itemName a',
  );
  if (headingLink) {
    headingLink.insertAdjacentElement('afterend', action);
    return;
  }
  const heading = row.querySelector('h3, .item h3, .itemName');
  if (heading) {
    heading.append(action);
    return;
  }
  row.prepend(action);
}

export function mountEmbeddedDownloadActions(
  context: CourseContext,
  client: BlackboardClient,
  coursePromise: Promise<Course>,
): () => void {
  const mounted = new Set<HTMLElement>();

  const downloadContent = async (
    contentPk1: string,
    rootFolder?: string,
  ): Promise<EnqueueResult> => {
    const [course, nodes] = await Promise.all([
      coursePromise,
      client.loadCurrentContent(context.coursePk1, contentPk1),
    ]);
    const keys = new Set(collectAttachmentKeys(nodes));
    const tasks = createDownloadPlan(
      context,
      course,
      nodes,
      keys,
      rootFolder ? [rootFolder] : [],
    );
    return enqueue(tasks);
  };

  const downloadItemAttachments = async (
    contentPk1: string,
    title: string,
  ): Promise<EnqueueResult> => {
    const [course, attachments] = await Promise.all([
      coursePromise,
      client.loadAttachments(context.coursePk1, contentPk1),
    ]);
    const node: ContentNode = {
      pk1: contentPk1,
      title,
      handlerId: 'resource/x-bb-document',
      hasChildren: false,
      children: [],
      attachments,
      unsupported: false,
    };
    const keys = new Set(collectAttachmentKeys([node]));
    return enqueue(createDownloadPlan(context, course, [node], keys, [title]));
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
        'display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:0 2px 10px;margin:0;';
      toolbar.append(
        createButton(
          '下载当前目录全部',
          () => downloadContent(context.contentPk1),
          'toolbar',
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

      const folderName = anchor.textContent?.trim();
      const action = createButton(
        '下载文件夹',
        () => downloadContent(contentPk1, folderName || undefined),
        'row',
      );
      action.setAttribute(ACTION_ATTRIBUTE, 'folder');
      anchor.insertAdjacentElement('afterend', action);
      mounted.add(action);
    }

    const items = list.querySelectorAll<HTMLElement>(
      `[id^="${ITEM_ID_PREFIX}"]`,
    );
    for (const row of items) {
      if (row.querySelector(`[${ACTION_ATTRIBUTE}="folder"]`)) continue;
      if (row.querySelector(`[${ACTION_ATTRIBUTE}="attachments"]`)) continue;
      if (attachmentLinkCount(row) < 2) continue;
      const contentPk1 = itemPk1FromRow(row);
      if (!contentPk1) continue;

      const title = itemTitle(row);
      const action = createButton(
        '下载全部附件',
        () => downloadItemAttachments(contentPk1, title),
        'row',
      );
      action.setAttribute(ACTION_ATTRIBUTE, 'attachments');
      insertRowAction(row, action);
      mounted.add(action);
    }
  };

  scan();

  // `scan` mutates the DOM it observes, so batch callbacks into one frame and
  // stay disconnected while re-scanning to avoid a feedback loop.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      observer.disconnect();
      try {
        scan();
      } finally {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    for (const element of mounted) element.remove();
    mounted.clear();
  };
}
