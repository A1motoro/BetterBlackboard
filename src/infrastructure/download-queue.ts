import { CUHKSZ_ORIGIN } from '../adapters/cuhksz';
import type { DownloadTask, DownloadTaskInput } from '../core/types';
import type { DownloadSnapshotEvent } from './messages';

const STORAGE_KEY = 'downloadTasks';
const MAX_ACTIVE_DOWNLOADS = 2;
const MAX_STORED_TASKS = 200;

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

function chromeStateToTask(
  state: chrome.downloads.DownloadItem['state'],
): DownloadTask['status'] {
  if (state === 'complete') return 'complete';
  if (state === 'interrupted') return 'interrupted';
  return 'in_progress';
}

export class PersistentDownloadQueue {
  private readonly tasks = new Map<string, DownloadTask>();
  private readonly taskByDownloadId = new Map<number, string>();
  private activeDownloads = 0;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const stored = await browser.storage.local.get(STORAGE_KEY);
    const tasks = Array.isArray(stored[STORAGE_KEY])
      ? (stored[STORAGE_KEY] as DownloadTask[])
      : [];
    for (const task of tasks) this.tasks.set(task.taskId, task);

    await this.reconcile();
    browser.downloads.onChanged.addListener((delta) => {
      void this.handleChanged(delta);
    });
    void this.pump();
  }

  snapshot(): DownloadTask[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async refreshProgress(): Promise<DownloadTask[]> {
    let releasedSlots = 0;
    let inspected = false;
    for (const task of this.tasks.values()) {
      if (task.status !== 'in_progress' || task.chromeDownloadId === undefined)
        continue;
      inspected = true;
      const [item] = await browser.downloads.search({
        id: task.chromeDownloadId,
      });
      if (!item) continue;
      const status = chromeStateToTask(item.state);
      if (status !== 'in_progress') releasedSlots += 1;
      this.update(task.taskId, {
        status,
        bytesReceived: item.bytesReceived,
        totalBytes: item.totalBytes,
        updatedAt: Date.now(),
        ...(item.error ? { error: item.error } : {}),
      });
    }
    if (releasedSlots > 0) {
      this.activeDownloads = Math.max(0, this.activeDownloads - releasedSlots);
      void this.pump();
    }
    if (inspected) await this.persistAndBroadcast();
    return this.snapshot();
  }

  async enqueue(inputs: DownloadTaskInput[]): Promise<DownloadTask[]> {
    const now = Date.now();
    for (const input of inputs) {
      if (input.origin !== CUHKSZ_ORIGIN || !isSafeTargetPath(input.targetPath))
        continue;
      const duplicate = [...this.tasks.values()].some(
        (task) =>
          task.status !== 'canceled' &&
          task.status !== 'interrupted' &&
          task.origin === input.origin &&
          task.contentPk1 === input.contentPk1 &&
          task.attachmentPk1 === input.attachmentPk1 &&
          task.targetPath === input.targetPath,
      );
      if (duplicate) continue;

      const task: DownloadTask = {
        ...input,
        taskId: crypto.randomUUID(),
        status: 'queued',
        createdAt: now,
        updatedAt: now,
      };
      this.tasks.set(task.taskId, task);
    }

    await this.persistAndBroadcast();
    void this.pump();
    return this.snapshot();
  }

  async cancel(taskId: string): Promise<DownloadTask[]> {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'complete' || task.status === 'canceled') {
      return this.snapshot();
    }

    if (task.chromeDownloadId !== undefined) {
      await browser.downloads
        .cancel(task.chromeDownloadId)
        .catch(() => undefined);
    }
    this.update(taskId, { status: 'canceled', updatedAt: Date.now() });
    await this.persistAndBroadcast();
    return this.snapshot();
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

      const [item] = await browser.downloads.search({
        id: task.chromeDownloadId,
      });
      if (!item) {
        this.update(task.taskId, {
          status: 'interrupted',
          error: 'Chrome 下载记录已不存在',
          updatedAt: Date.now(),
        });
        continue;
      }

      this.taskByDownloadId.set(item.id, task.taskId);
      const status = chromeStateToTask(item.state);
      this.update(task.taskId, {
        status,
        bytesReceived: item.bytesReceived,
        totalBytes: item.totalBytes,
        updatedAt: Date.now(),
        ...(item.error ? { error: item.error } : {}),
      });
      if (status === 'in_progress') this.activeDownloads += 1;
    }
    await this.persistAndBroadcast();
  }

  private pump(): void {
    while (this.activeDownloads < MAX_ACTIVE_DOWNLOADS) {
      const task = [...this.tasks.values()].find(
        (candidate) => candidate.status === 'queued',
      );
      if (!task) return;
      this.activeDownloads += 1;
      void this.start(task);
    }
  }

  private async start(task: DownloadTask): Promise<void> {
    this.update(task.taskId, { status: 'starting', updatedAt: Date.now() });
    await this.persistAndBroadcast();

    try {
      const chromeDownloadId = await browser.downloads.download({
        url: downloadUrl(task),
        filename: task.targetPath,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      this.taskByDownloadId.set(chromeDownloadId, task.taskId);
      this.update(task.taskId, {
        status: 'in_progress',
        chromeDownloadId,
        updatedAt: Date.now(),
      });
    } catch (error) {
      this.activeDownloads = Math.max(0, this.activeDownloads - 1);
      this.update(task.taskId, {
        status: 'interrupted',
        error: error instanceof Error ? error.message : '无法创建下载',
        updatedAt: Date.now(),
      });
      void this.pump();
    }
    await this.persistAndBroadcast();
  }

  private async handleChanged(
    delta: chrome.downloads.DownloadDelta,
  ): Promise<void> {
    const taskId = this.taskByDownloadId.get(delta.id);
    if (!taskId) return;
    const task = this.tasks.get(taskId);
    if (!task) return;

    const patch: Partial<DownloadTask> = { updatedAt: Date.now() };
    if (delta.totalBytes?.current !== undefined) {
      patch.totalBytes = delta.totalBytes.current;
    }
    if (delta.error?.current) patch.error = delta.error.current;
    const nextState = delta.state?.current;
    if (
      nextState === 'in_progress' ||
      nextState === 'complete' ||
      nextState === 'interrupted'
    ) {
      patch.status = chromeStateToTask(nextState);
      if (
        (nextState === 'complete' || nextState === 'interrupted') &&
        (task.status === 'in_progress' || task.status === 'starting')
      ) {
        this.activeDownloads = Math.max(0, this.activeDownloads - 1);
      }
    }

    this.update(taskId, patch);
    await this.persistAndBroadcast();
    if (nextState === 'complete' || nextState === 'interrupted') {
      void this.pump();
    }
  }

  private update(taskId: string, patch: Partial<DownloadTask>): void {
    const current = this.tasks.get(taskId);
    if (current) this.tasks.set(taskId, { ...current, ...patch });
  }

  private async persistAndBroadcast(): Promise<void> {
    const snapshot = this.snapshot().slice(0, MAX_STORED_TASKS);
    await browser.storage.local.set({ [STORAGE_KEY]: snapshot });
    const event: DownloadSnapshotEvent = {
      v: 1,
      type: 'downloads.snapshot',
      tasks: snapshot,
    };
    await browser.runtime.sendMessage(event).catch(() => undefined);
  }
}
