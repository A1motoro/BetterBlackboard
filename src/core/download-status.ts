import type { DownloadStatus, DownloadTask } from './types';

export type ChromeDownloadState = 'in_progress' | 'interrupted' | 'complete';

const USER_CANCEL_ERRORS = new Set(['USER_CANCELED', 'USER_SHUTDOWN']);

export function isUserCancelError(error: string | undefined): boolean {
  return error !== undefined && USER_CANCEL_ERRORS.has(error);
}

export function chromeDownloadToStatus(
  state: ChromeDownloadState,
  error?: string,
): DownloadStatus {
  if (state === 'complete') return 'complete';
  if (state === 'interrupted') {
    return isUserCancelError(error) ? 'canceled' : 'interrupted';
  }
  return 'in_progress';
}

export interface ChromeDownloadUpdate {
  state?: ChromeDownloadState;
  error?: string;
  bytesReceived?: number;
  totalBytes?: number;
}

export interface AppliedDownloadUpdate {
  patch: Partial<DownloadTask>;
  clearError: boolean;
  releaseSlot: boolean;
  pump: boolean;
}

function occupiesDownloadSlot(status: DownloadStatus): boolean {
  return status === 'starting' || status === 'in_progress';
}

export function applyChromeDownloadUpdate(
  task: DownloadTask,
  update: ChromeDownloadUpdate,
): AppliedDownloadUpdate {
  const patch: Partial<DownloadTask> = {};
  if (update.bytesReceived !== undefined) {
    patch.bytesReceived = update.bytesReceived;
  }
  if (update.totalBytes !== undefined) {
    patch.totalBytes = update.totalBytes;
  }

  const incoming =
    update.state === undefined
      ? isUserCancelError(update.error)
        ? 'canceled'
        : undefined
      : chromeDownloadToStatus(update.state, update.error);
  const occupying = occupiesDownloadSlot(task.status);

  if (task.status === 'complete') {
    return { patch, clearError: false, releaseSlot: false, pump: false };
  }

  if (task.status === 'canceled') {
    if (incoming === 'complete') {
      patch.status = 'complete';
      return { patch, clearError: true, releaseSlot: false, pump: false };
    }
    return { patch, clearError: false, releaseSlot: false, pump: false };
  }

  if (incoming === undefined) {
    if (update.error !== undefined && !isUserCancelError(update.error)) {
      patch.error = update.error;
    }
    return { patch, clearError: false, releaseSlot: false, pump: false };
  }

  if (incoming === 'canceled') {
    patch.status = 'canceled';
    return {
      patch,
      clearError: true,
      releaseSlot: occupying,
      pump: occupying,
    };
  }

  if (incoming === 'complete') {
    patch.status = 'complete';
    return {
      patch,
      clearError: true,
      releaseSlot: occupying,
      pump: occupying,
    };
  }

  if (incoming === 'interrupted') {
    patch.status = 'interrupted';
    if (update.error !== undefined) patch.error = update.error;
    return {
      patch,
      clearError: false,
      releaseSlot: occupying,
      pump: occupying,
    };
  }

  patch.status = 'in_progress';
  return { patch, clearError: false, releaseSlot: false, pump: false };
}

export function visibleDownloadError(task: DownloadTask): string | undefined {
  if (task.status !== 'interrupted' || !task.error) return undefined;
  if (isUserCancelError(task.error)) return undefined;
  return task.error;
}

export function isChromeDownloadState(
  value: string | undefined,
): value is ChromeDownloadState {
  return (
    value === 'in_progress' || value === 'interrupted' || value === 'complete'
  );
}
