import type { Attachment, ContentNode, Course } from '../../core/types';
import type { ApiTransport } from './transport';

interface ApiPage<T> {
  results?: T[];
  paging?: {
    nextPage?: string;
  };
}

interface RawCourse {
  id: string;
  courseId?: string;
  name?: string;
  ultraStatus?: string;
}

interface RawContent {
  id: string;
  title?: string;
  hasChildren?: boolean;
  contentHandler?: {
    id?: string;
  };
}

interface RawAttachment {
  id: string;
  fileName?: string;
  mimeType?: string;
}

class RequestLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

const FOLDER_HANDLER = 'resource/x-bb-folder';
const ATTACHMENT_HANDLERS = new Set([
  'resource/x-bb-file',
  'resource/x-bb-document',
]);
const KNOWN_HANDLERS = new Set([
  ...ATTACHMENT_HANDLERS,
  FOLDER_HANDLER,
  'resource/x-bb-externallink',
  'resource/x-bb-blti-link',
]);

export class BlackboardClient {
  private readonly limiter = new RequestLimiter(4);

  constructor(private readonly transport: ApiTransport) {}

  async getCourse(coursePk1: string, signal?: AbortSignal): Promise<Course> {
    const raw = await this.request<RawCourse>(
      `/learn/api/public/v1/courses/${encodeURIComponent(coursePk1)}`,
      signal,
    );
    return {
      pk1: raw.id,
      batchUid: raw.courseId ?? '',
      name: raw.name ?? raw.courseId ?? raw.id,
      ultraStatus: raw.ultraStatus ?? 'Unknown',
    };
  }

  async loadCurrentContent(
    coursePk1: string,
    contentPk1: string,
    signal?: AbortSignal,
  ): Promise<ContentNode[]> {
    const visited = new Set<string>();
    let nodeCount = 0;

    const walk = async (parentPk1: string): Promise<ContentNode[]> => {
      if (visited.has(parentPk1)) return [];
      visited.add(parentPk1);

      const children = await this.getAll<RawContent>(
        `/learn/api/public/v1/courses/${encodeURIComponent(coursePk1)}/contents/${encodeURIComponent(parentPk1)}/children?fields=id,title,contentHandler,hasChildren`,
        signal,
      );

      return Promise.all(
        children.map(async (raw): Promise<ContentNode> => {
          nodeCount += 1;
          if (nodeCount > 2_000)
            throw new Error('内容节点超过 2000 个，请缩小下载范围');

          const handlerId = raw.contentHandler?.id ?? 'unknown';
          const shouldLoadAttachments = ATTACHMENT_HANDLERS.has(handlerId);
          const shouldLoadChildren =
            handlerId === FOLDER_HANDLER || Boolean(raw.hasChildren);

          const [attachments, nestedChildren] = await Promise.all([
            shouldLoadAttachments
              ? this.getAttachments(coursePk1, raw.id, signal)
              : Promise.resolve([]),
            shouldLoadChildren ? walk(raw.id) : Promise.resolve([]),
          ]);

          return {
            pk1: raw.id,
            title: raw.title?.trim() || '未命名内容',
            handlerId,
            hasChildren: shouldLoadChildren,
            children: nestedChildren,
            attachments,
            unsupported: !KNOWN_HANDLERS.has(handlerId),
          };
        }),
      );
    };

    return walk(contentPk1);
  }

  private async getAttachments(
    coursePk1: string,
    contentPk1: string,
    signal?: AbortSignal,
  ): Promise<Attachment[]> {
    const raw = await this.getAll<RawAttachment>(
      `/learn/api/public/v1/courses/${encodeURIComponent(coursePk1)}/contents/${encodeURIComponent(contentPk1)}/attachments`,
      signal,
    );
    return raw.map((attachment) => ({
      pk1: attachment.id,
      contentPk1,
      fileName: attachment.fileName?.trim() || `attachment-${attachment.id}`,
      ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    }));
  }

  private async getAll<T>(path: string, signal?: AbortSignal): Promise<T[]> {
    const results: T[] = [];
    const seenPages = new Set<string>();
    let nextPage: string | undefined = path;

    while (nextPage) {
      if (seenPages.has(nextPage))
        throw new Error('Blackboard API 返回了循环分页链接');
      seenPages.add(nextPage);
      const page: ApiPage<T> = await this.request<ApiPage<T>>(nextPage, signal);
      results.push(...(page.results ?? []));
      nextPage = page.paging?.nextPage;
    }

    return results;
  }

  private request<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.limiter.run(() => this.transport.request<T>(path, signal));
  }
}
