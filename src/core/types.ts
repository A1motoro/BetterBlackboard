export interface CourseAvailability {
  available: 'Yes' | 'No' | 'Disabled';
  duration?: {
    type?: string;
    start?: string;
    end?: string;
    daysOfUse?: number;
  };
}

export interface Course {
  pk1: string;
  batchUid: string;
  name: string;
  ultraStatus: string;
  termId?: string;
  availability?: CourseAvailability;
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

export type CalendarItemType =
  'GradebookColumn' | 'Course' | 'OfficeHours' | 'Institution';

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  calendarId: string;
  calendarName?: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  modified?: string | null;
  color?: string;
  disableResizing?: boolean;
  createdByUserId?: string | null;
  dynamicCalendarItemProps?: {
    attemptable?: boolean;
    categoryId?: string;
    dateRangeLimited?: boolean;
    eventType?: string;
    gradable?: boolean;
  };
}

export interface Assignment {
  id: string;
  coursePk1: string;
  courseName: string;
  title: string;
  dueDate: string;
  eventType?: string;
  categoryId?: string;
  attemptable: boolean;
  gradable: boolean;
}

export interface AggregatedDDL {
  assignments: Assignment[];
  totalCount: number;
  timeRange: {
    since: string;
    until: string;
  };
  filterCounts?: {
    GradebookColumn: number;
    Course: number;
    OfficeHours: number;
    Institution: number;
    unknown: number;
  };
}
