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

export interface CoursesTrackingGetMessage {
  v: 1;
  type: 'courses.tracking.get';
  requestId: string;
}

export interface CoursesTrackingSetMessage {
  v: 1;
  type: 'courses.tracking.set';
  requestId: string;
  coursePk1: string;
  tracked: boolean;
  name?: string;
}

export interface CoursesTrackingHomeSyncedMessage {
  v: 1;
  type: 'courses.tracking.homeSynced';
  requestId: string;
}

export type ExtensionRequest =
  | ApiRequestMessage
  | DownloadsEnqueueMessage
  | DownloadsCancelMessage
  | DownloadsSnapshotRequest
  | SiteInjectMessage
  | CoursesTrackingGetMessage
  | CoursesTrackingSetMessage
  | CoursesTrackingHomeSyncedMessage;

export type ExtensionResponse<T = unknown> =
  { ok: true; data: T } | { ok: false; error: SerializedBbError };

export interface EnqueueResult {
  tasks: DownloadTask[];
  accepted: number;
  duplicates: number;
  rejected: number;
}

export interface DownloadSnapshotEvent {
  v: 1;
  type: 'downloads.snapshot';
  tasks: DownloadTask[];
}

const REQUEST_TYPES = new Set<string>([
  'api.request',
  'downloads.enqueue',
  'downloads.cancel',
  'downloads.snapshot.get',
  'site.inject',
  'courses.tracking.get',
  'courses.tracking.set',
  'courses.tracking.homeSynced',
] satisfies ExtensionRequest['type'][]);

export function requestId(): string {
  return crypto.randomUUID();
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExtensionRequest>;
  return (
    candidate.v === 1 &&
    typeof candidate.type === 'string' &&
    REQUEST_TYPES.has(candidate.type)
  );
}

export function isDownloadSnapshotEvent(
  value: unknown,
): value is DownloadSnapshotEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DownloadSnapshotEvent>;
  return (
    candidate.v === 1 &&
    candidate.type === 'downloads.snapshot' &&
    Array.isArray(candidate.tasks)
  );
}
