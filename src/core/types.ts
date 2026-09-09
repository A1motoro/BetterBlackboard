export interface Course {
  pk1: string;
  batchUid: string;
  name: string;
  ultraStatus: string;
}

export interface CourseContext {
  origin: string;
  coursePk1: string;
  contentPk1: string;
}

export interface Attachment {
  pk1: string;
  contentPk1: string;
  fileName: string;
  mimeType?: string;
}

export interface ContentNode {
  pk1: string;
  title: string;
  handlerId: string;
  hasChildren: boolean;
  children: ContentNode[];
  attachments: Attachment[];
  unsupported: boolean;
}

export type DownloadStatus =
  | 'queued'
  | 'starting'
  | 'in_progress'
  | 'complete'
  | 'interrupted'
  | 'canceled';

export interface DownloadTaskInput {
  origin: string;
  coursePk1: string;
  contentPk1: string;
  attachmentPk1: string;
  sourceFileName: string;
  targetPath: string;
}

export interface DownloadTask extends DownloadTaskInput {
  taskId: string;
  status: DownloadStatus;
  chromeDownloadId?: number;
  bytesReceived?: number;
  totalBytes?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type ConnectionState =
  | 'ready'
  | 'auth_required'
  | 'network_unreachable'
  | 'access_denied'
  | 'api_incompatible';

export type BbErrorCode =
  Exclude<ConnectionState, 'ready'> | 'rate_limited' | 'unknown';

export interface SerializedBbError {
  code: BbErrorCode;
  message: string;
  status?: number;
}

export class BbError extends Error {
  constructor(
    public readonly code: BbErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BbError';
  }
}
