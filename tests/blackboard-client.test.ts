import { describe, expect, it } from 'vitest';
import { BlackboardClient } from '../src/infrastructure/blackboard/client';
import type { ApiTransport } from '../src/infrastructure/blackboard/transport';

class FixtureTransport implements ApiTransport {
  readonly calls: string[] = [];

  constructor(private readonly responses: Record<string, unknown>) {}

  request<T>(path: string): Promise<T> {
    this.calls.push(path);
    if (!(path in this.responses)) {
      return Promise.reject(new Error(`缺少 fixture: ${path}`));
    }
    return Promise.resolve(this.responses[path] as T);
  }
}

describe('BlackboardClient', () => {
  it('映射课程 ID 字段', async () => {
    const path = '/learn/api/public/v1/courses/_17458_1';
    const transport = new FixtureTransport({
      [path]: {
        id: '_17458_1',
        courseId: 'PHY100126103015',
        name: 'PHY1001:Mechanics_L01',
        ultraStatus: 'Classic',
      },
    });

    await expect(
      new BlackboardClient(transport).getCourse('_17458_1'),
    ).resolves.toEqual({
      pk1: '_17458_1',
      batchUid: 'PHY100126103015',
      name: 'PHY1001:Mechanics_L01',
      ultraStatus: 'Classic',
    });
  });

  it('消费 children 与 attachments 的全部分页', async () => {
    const root =
      '/learn/api/public/v1/courses/_1_1/contents/_root_1/children?fields=id,title,contentHandler,hasChildren';
    const secondPage = `${root}&offset=1`;
    const attachments =
      '/learn/api/public/v1/courses/_1_1/contents/_file_1/attachments';
    const attachmentSecondPage = `${attachments}?offset=1`;
    const folderChildren =
      '/learn/api/public/v1/courses/_1_1/contents/_folder_1/children?fields=id,title,contentHandler,hasChildren';

    const transport = new FixtureTransport({
      [root]: {
        results: [
          {
            id: '_folder_1',
            title: 'Week 1',
            hasChildren: true,
            contentHandler: { id: 'resource/x-bb-folder' },
          },
        ],
        paging: { nextPage: secondPage },
      },
      [secondPage]: {
        results: [
          {
            id: '_file_1',
            title: 'Slides',
            hasChildren: false,
            contentHandler: { id: 'resource/x-bb-file' },
          },
        ],
      },
      [folderChildren]: { results: [] },
      [attachments]: {
        results: [
          { id: '_att_1', fileName: 'one.pdf', mimeType: 'application/pdf' },
        ],
        paging: { nextPage: attachmentSecondPage },
      },
      [attachmentSecondPage]: {
        results: [{ id: '_att_2', fileName: 'two.pdf' }],
      },
    });

    const nodes = await new BlackboardClient(transport).loadCurrentContent(
      '_1_1',
      '_root_1',
    );

    expect(nodes).toHaveLength(2);
    expect(nodes[1]?.attachments.map((item) => item.fileName)).toEqual([
      'one.pdf',
      'two.pdf',
    ]);
    expect(transport.calls).toContain(secondPage);
    expect(transport.calls).toContain(attachmentSecondPage);
  });

  it('保留未知 handler 而不静默丢弃', async () => {
    const root =
      '/learn/api/public/v1/courses/_1_1/contents/_root_1/children?fields=id,title,contentHandler,hasChildren';
    const transport = new FixtureTransport({
      [root]: {
        results: [
          {
            id: '_unknown_1',
            title: 'Mystery',
            contentHandler: { id: 'resource/custom' },
          },
        ],
      },
    });

    const [node] = await new BlackboardClient(transport).loadCurrentContent(
      '_1_1',
      '_root_1',
    );
    expect(node?.unsupported).toBe(true);
    expect(node?.title).toBe('Mystery');
  });
});
