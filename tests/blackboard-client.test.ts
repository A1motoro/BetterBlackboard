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
    const path =
      '/learn/api/public/v1/courses/_17458_1?fields=id,courseId,name,ultraStatus,termId,availability';
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

  it('直接加载单个内容项的附件', async () => {
    const attachments =
      '/learn/api/public/v1/courses/_1_1/contents/_doc_1/attachments';
    const transport = new FixtureTransport({
      [attachments]: {
        results: [
          { id: '_att_1', fileName: 'glossary.pdf' },
          { id: '_att_2', fileName: 'syllabus.pdf' },
        ],
      },
    });

    const files = await new BlackboardClient(transport).loadAttachments(
      '_1_1',
      '_doc_1',
    );
    expect(files.map((item) => item.fileName)).toEqual([
      'glossary.pdf',
      'syllabus.pdf',
    ]);
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

  it('列出当前用户的课程', async () => {
    const path =
      '/learn/api/public/v1/users/me/courses?expand=course&limit=100';
    const transport = new FixtureTransport({
      [path]: {
        results: [
          {
            courseId: '_2_1',
            course: {
              id: '_2_1',
              courseId: 'PHY1001',
              name: 'PHY1001:Mechanics_L01',
              ultraStatus: 'Classic',
            },
          },
          {
            courseId: '_1_1',
            course: {
              id: '_1_1',
              courseId: 'AIE2001',
              name: 'AIE2001:Rationality',
              ultraStatus: 'Classic',
            },
          },
        ],
      },
    });

    const courses = await new BlackboardClient(transport).listMyCourses();
    expect(courses.map((course) => course.name)).toEqual([
      'PHY1001:Mechanics_L01',
      'AIE2001:Rationality',
    ]);
  });

  it('过滤可用课程', async () => {
    const path =
      '/learn/api/public/v1/users/me/courses?expand=course&limit=100&availability.available=Yes';
    const transport = new FixtureTransport({
      [path]: {
        results: [
          {
            courseId: '_1_1',
            course: {
              id: '_1_1',
              courseId: 'AIE2001',
              name: 'AIE2001:Rationality',
              ultraStatus: 'Classic',
              availability: { available: 'Yes' },
            },
          },
        ],
      },
    });

    const courses = await new BlackboardClient(transport).listMyCourses({
      availabilityFilter: 'Yes',
    });
    expect(courses).toHaveLength(1);
    expect(courses[0]?.availability?.available).toBe('Yes');
  });

  it('映射课程的 term 和 availability 字段', async () => {
    const path =
      '/learn/api/public/v1/courses/_1_1?fields=id,courseId,name,ultraStatus,termId,availability';
    const transport = new FixtureTransport({
      [path]: {
        id: '_1_1',
        courseId: 'AIE2001',
        name: 'AIE2001:Rationality',
        ultraStatus: 'Classic',
        termId: '_2026_T1',
        availability: {
          available: 'Yes',
          duration: {
            type: 'Term',
            start: '2026-09-01T00:00:00.000Z',
            end: '2026-12-31T23:59:59.999Z',
          },
        },
      },
    });

    const course = await new BlackboardClient(transport).getCourse('_1_1');
    expect(course.termId).toBe('_2026_T1');
    expect(course.availability?.available).toBe('Yes');
    expect(course.availability?.duration?.type).toBe('Term');
  });

  it('从课程根节点加载整课内容', async () => {
    const roots =
      '/learn/api/public/v1/courses/_1_1/contents?fields=id,title,contentHandler,hasChildren';
    const children =
      '/learn/api/public/v1/courses/_1_1/contents/_folder_1/children?fields=id,title,contentHandler,hasChildren';
    const attachments =
      '/learn/api/public/v1/courses/_1_1/contents/_file_1/attachments';
    const transport = new FixtureTransport({
      [roots]: {
        results: [
          {
            id: '_folder_1',
            title: 'Content',
            hasChildren: true,
            contentHandler: { id: 'resource/x-bb-folder' },
          },
        ],
      },
      [children]: {
        results: [
          {
            id: '_file_1',
            title: 'Outline',
            contentHandler: { id: 'resource/x-bb-document' },
          },
        ],
      },
      [attachments]: {
        results: [{ id: '_att_1', fileName: 'outline.pdf' }],
      },
    });

    const nodes = await new BlackboardClient(transport).loadCourseContent(
      '_1_1',
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.children[0]?.attachments[0]?.fileName).toBe('outline.pdf');
  });
});
