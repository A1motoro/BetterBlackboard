import type {
  DownloadTask,
  DownloadTaskInput,
  SerializedBbError,
} from '../core/types';

export interface ApiRequestMessage {
  v: 1;
  type: 'api.request';
  requestId: string;
  origin: string;
  path: string;
}

export interface DownloadsEnqueueMessage {
  v: 1;
  type: 'downloads.enqueue';
  requestId: string;
  tasks: DownloadTaskInput[];
}

export interface DownloadsCancelMessage {
  v: 1;
  type: 'downloads.cancel';
  requestId: string;
  taskId: string;
}

export interface DownloadsSnapshotRequest {
  v: 1;
  type: 'downloads.snapshot.get';
  requestId: string;
}

export interface SiteInjectMessage {
  v: 1;
  type: 'site.inject';
  requestId: string;
  tabId: number;
  origin: string;
}

export type ExtensionRequest =
  | ApiRequestMessage
  | DownloadsEnqueueMessage
  | DownloadsCancelMessage
  | DownloadsSnapshotRequest
  | SiteInjectMessage;

export type ExtensionResponse<T = unknown> =
  { ok: true; data: T } | { ok: false; error: SerializedBbError };

export interface DownloadSnapshotEvent {
  v: 1;
  type: 'downloads.snapshot';
  tasks: DownloadTask[];
}

export function requestId(): string {
  return crypto.randomUUID();
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExtensionRequest>;
  return candidate.v === 1 && typeof candidate.type === 'string';
}
