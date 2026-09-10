import { CUHKSZ_ORIGIN } from '../adapters/cuhksz';
import {
  applyChromeDownloadUpdate,
  isChromeDownloadState,
  type ChromeDownloadUpdate,
} from '../core/download-status';
import type {
  DownloadStatus,
  DownloadTask,
  DownloadTaskInput,
} from '../core/types';
import type { CourseTrackingStore } from './course-tracking';
import type { DownloadSnapshotEvent, EnqueueResult } from './messages';

const STORAGE_KEY = 'downloadTasks';
const MAX_ACTIVE_DOWNLOADS = 2;
const MAX_STORED_TASKS = 200;
const PROGRESS_PERSIST_INTERVAL = 5_000;

const ACTIVE_STATUSES = new Set<DownloadTask['status']>([
  'starting',
  'in_progress',
]);
const TERMINAL_STATUSES = new Set<DownloadTask['status']>([
  'complete',
  'canceled',
]);
const LOGIN_REDIRECT_MARKERS = ['/webapps/login', '/auth-saml/'];

function isSafeTargetPath(path: string): boolean {
  return (
    path.startsWith('BB/') &&
    !path.startsWith('/') &&
    !path.split('/').some((segment) => segment === '..' || segment === '.')
  );
}

function downloadUrl(task: DownloadTask): string {
  const course = encodeURIComponent(task.coursePk1);
  const content = encodeURIComponent(task.contentPk1);
  const attachment = encodeURIComponent(task.attachmentPk1);
  return `${task.origin}/learn/api/public/v1/courses/${course}/contents/${content}/attachments/${attachment}/download`;
}

function dedupKey(input: DownloadTaskInput): string {
  return `${input.origin}|${input.contentPk1}|${input.attachmentPk1}|${input.targetPath}`;
}

function updateFromItem(
  item: chrome.downloads.DownloadItem,
): ChromeDownloadUpdate {
  return {
    ...(isChromeDownloadState(item.state) ? { state: item.state } : {}),
    ...(item.error ? { error: item.error } : {}),
    bytesReceived: item.bytesReceived,
    totalBytes: item.totalBytes,
  };
}

/**
 * Blackboard answers unauthenticated download requests with a 200 login page,
 * so a "complete" download can still be a worthless HTML file.
 */
function isLoginRedirect(item: chrome.downloads.DownloadItem): boolean {
  const target = item.finalUrl || item.url;
  return LOGIN_REDIRECT_MARKERS.some((marker) => target.includes(marker));
}

export class PersistentDownloadQueue {
  private readonly tasks = new Map<string, DownloadTask>();
  private readonly taskByDownloadId = new Map<number, string>();
  private initPromise?: Promise<void>;
  private lastPersistAt = 0;

  constructor(private readonly tracking: CourseTrackingStore) {}

  init(): Promise<void> {
    this.initPromise ??= this.tracking.init().then(() => this.bootstrap());
    return this.initPromise;
  }

  snapshot(): DownloadTask[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async refreshProgress(): Promise<DownloadTask[]> {
    await this.init();

    const pending = [...this.tasks.values()].filter(
      (task) =>
        ACTIVE_STATUSES.has(task.status) && task.chromeDownloadId !== undefined,
    );
    if (pending.length === 0) return this.snapshot();

    const statuses = await Promise.all(
      pending.map((task) => this.resync(task.taskId)),
    );

    if (statuses.every((status) => status === undefined)) {
      await this.persist(false);
      return this.snapshot();
    }

    this.pump();
    await this.publish();
    return this.snapshot();
  }

  async enqueue(inputs: DownloadTaskInput[]): Promise<EnqueueResult> {
    await this.init();

    const now = Date.now();
    const known = new Set<string>();
    for (const task of this.tasks.values()) {
      if (task.status === 'canceled' || task.status === 'interrupted') continue;
      known.add(dedupKey(task));
    }

    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const input of inputs) {
      if (
        input.origin !== CUHKSZ_ORIGIN ||
        !isSafeTargetPath(input.targetPath)
      ) {
        rejected += 1;
        continue;
      }

      const key = dedupKey(input);
      if (known.has(key) || this.tracking.has(input.targetPath)) {
        duplicates += 1;
        continue;
      }
      known.add(key);

      const task: DownloadTask = {
        ...input,
        taskId: crypto.randomUUID(),
        status: 'queued',
        createdAt: now,
        updatedAt: now,
      };
      this.tasks.set(task.taskId, task);
      accepted += 1;
    }

    this.prune();
    this.pump();
    await this.publish();
    return { tasks: this.snapshot(), accepted, duplicates, rejected };
  }

  async cancel(taskId: string): Promise<DownloadTask[]> {
    await this.init();

    const task = this.tasks.get(taskId);
    if (!task || TERMINAL_STATUSES.has(task.status)) return this.snapshot();

    // Mark first: a late onChanged event must not resurrect the task, and the
    // derived active count frees the slot straight away.
    this.update(taskId, { status: 'canceled', updatedAt: Date.now() });
    if (task.chromeDownloadId !== undefined) {
      await browser.downloads
        .cancel(task.chromeDownloadId)
        .catch(() => undefined);
    }

    this.pump();
    await this.publish();
    return this.snapshot();
  }

  async handleDownloadChanged(
    delta: chrome.downloads.DownloadDelta,
  ): Promise<void> {
    await this.init();

    const taskId = this.taskByDownloadId.get(delta.id);
    if (taskId === undefined) return;

    const state = delta.state?.current;
    const status = this.applyUpdate(taskId, {
      ...(isChromeDownloadState(state) ? { state } : {}),
      ...(delta.error?.current ? { error: delta.error.current } : {}),
      ...(delta.totalBytes?.current === undefined
        ? {}
        : { totalBytes: delta.totalBytes.current }),
    });

    if (status === undefined) {
      await this.persist(false);
      return;
    }

    if (status === 'complete') {
      await this.rejectLoginRedirect(taskId);
      await this.rememberIfComplete(taskId);
    }
    this.pump();
    await this.publish();
  }

  private get activeCount(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (ACTIVE_STATUSES.has(task.status)) count += 1;
    }
    return count;
  }

  private async bootstrap(): Promise<void> {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const tasks = Array.isArray(stored[STORAGE_KEY])
      ? (stored[STORAGE_KEY] as DownloadTask[])
      : [];
    for (const task of tasks) this.tasks.set(task.taskId, task);
    for (const task of this.tasks.values()) {
      if (task.status === 'complete')
        await this.tracking.remember(task.targetPath);
    }

    await this.reconcile();
    this.pump();
    await this.publish();
  }

  private async reconcile(): Promise<void> {
    for (const task of this.tasks.values()) {
      if (task.chromeDownloadId === undefined) {
        if (task.status === 'starting') {
          this.update(task.taskId, {
            status: 'interrupted',
            error: '扩展在创建下载时被中断，请手动重试',
            updatedAt: Date.now(),
          });
        }
        continue;
      }

      if (task.status === 'canceled') continue;
      this.taskByDownloadId.set(task.chromeDownloadId, task.taskId);
      if (ACTIVE_STATUSES.has(task.status)) await this.resync(task.taskId);
    }
  }

  /**
   * Routes every Chrome-driven change through the shared reducer, which owns
   * the terminal-state rules (a canceled or complete task is never rewritten).
   * Returns the new status, or `undefined` when only progress moved.
   */
  private applyUpdate(
    taskId: string,
    update: ChromeDownloadUpdate,
  ): DownloadStatus | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const { patch, clearError } = applyChromeDownloadUpdate(task, update);
    const next: DownloadTask = { ...task, ...patch, updatedAt: Date.now() };
    if (clearError) delete next.error;
    this.tasks.set(taskId, next);
    return patch.status;
  }

  /** Re-derives a task's state from Chrome, which is the source of truth. */
  private async resync(taskId: string): Promise<DownloadStatus | undefined> {
    const task = this.tasks.get(taskId);
    if (!task || task.chromeDownloadId === undefined) return undefined;

    const [item] = await browser.downloads.search({
      id: task.chromeDownloadId,
    });
    if (!item) {
      this.update(taskId, {
        status: 'interrupted',
        error: 'Chrome 下载记录已不存在',
        updatedAt: Date.now(),
      });
      return 'interrupted';
    }

    const status = this.applyUpdate(taskId, updateFromItem(item));
    if (status === 'complete') {
      await this.rejectLoginRedirect(taskId);
      await this.rememberIfComplete(taskId);
    }
    return status;
  }

  /**
   * A download that "completed" into the SSO login page is a failure, so drop
   * the file and surface it instead of leaving an HTML stub named `*.pdf`.
   */
  private async rejectLoginRedirect(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task?.status !== 'complete' || task.chromeDownloadId === undefined) {
      return;
    }

    const [item] = await browser.downloads.search({
      id: task.chromeDownloadId,
    });
    if (!item || !isLoginRedirect(item)) return;

    await browser.downloads.removeFile(item.id).catch(() => undefined);
    this.update(taskId, {
      status: 'interrupted',
      error: 'Blackboard 登录已失效，保存到的是登录页，请重新登录后重试',
      updatedAt: Date.now(),
    });
  }

  private async rememberIfComplete(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task?.status !== 'complete') return;
    await this.tracking.remember(task.targetPath);
  }

  private pump(): void {
    while (this.activeCount < MAX_ACTIVE_DOWNLOADS) {
      const next = [...this.tasks.values()].find(
        (candidate) => candidate.status === 'queued',
      );
      if (!next) return;
      // Synchronous, so the derived active count covers this task immediately.
      this.update(next.taskId, { status: 'starting', updatedAt: Date.now() });
      void this.start(next.taskId);
    }
  }

  private async start(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    try {
      const chromeDownloadId = await browser.downloads.download({
        url: downloadUrl(task),
        filename: task.targetPath,
        conflictAction: 'uniquify',
        saveAs: false,
      });

      if (this.tasks.get(taskId)?.status === 'canceled') {
        await browser.downloads.cancel(chromeDownloadId).catch(() => undefined);
      } else {
        this.taskByDownloadId.set(chromeDownloadId, taskId);
        this.update(taskId, {
          status: 'in_progress',
          chromeDownloadId,
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      this.update(taskId, {
        status: 'interrupted',
        error: error instanceof Error ? error.message : '无法创建下载',
        updatedAt: Date.now(),
      });
    }

    this.pump();
    await this.publish();
  }

  private update(taskId: string, patch: Partial<DownloadTask>): void {
    const current = this.tasks.get(taskId);
    if (current) this.tasks.set(taskId, { ...current, ...patch });
  }

  /** Drops the oldest finished tasks so the map cannot grow without bound. */
  private prune(): void {
    if (this.tasks.size <= MAX_STORED_TASKS) return;
    for (const task of this.snapshot().slice(MAX_STORED_TASKS)) {
      if (task.status === 'queued' || ACTIVE_STATUSES.has(task.status))
        continue;
      this.tasks.delete(task.taskId);
      if (task.chromeDownloadId !== undefined) {
        this.taskByDownloadId.delete(task.chromeDownloadId);
      }
    }
  }

  private async publish(): Promise<void> {
    await this.persist(true);
    await this.broadcast();
  }

  private async persist(force: boolean): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastPersistAt < PROGRESS_PERSIST_INTERVAL) return;
    this.lastPersistAt = now;
    await browser.storage.local.set({
      [STORAGE_KEY]: this.snapshot().slice(0, MAX_STORED_TASKS),
    });
  }

  /**
   * `runtime.sendMessage` never reaches content scripts, so the sidebar has to
   * be addressed per tab.
   */
  private async broadcast(): Promise<void> {
    const event: DownloadSnapshotEvent = {
      v: 1,
      type: 'downloads.snapshot',
      tasks: this.snapshot().slice(0, MAX_STORED_TASKS),
    };
    const tabs = await browser.tabs
      .query({ url: `${CUHKSZ_ORIGIN}/*` })
      .catch(() => []);
    await Promise.all(
      tabs
        .flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))
        .map((tabId) =>
          browser.tabs.sendMessage(tabId, event).catch(() => undefined),
        ),
    );
  }
}
