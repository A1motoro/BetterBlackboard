import { describe, it, expect } from 'vitest';
import { createContentSnapshot } from '../src/core/fingerprint';
import {
  detectDownloadDiff,
  addDownloadRecords,
  createEmptyHistory,
  type CourseDownloadHistory,
  type DownloadHistoryRecord,
} from '../src/core/download-history';
import {
  createDiffPreview,
  filterDownloadableItems,
} from '../src/core/diff-preview';
import { createDownloadPlan } from '../src/core/download-plan';
import type { ContentNode, Course, CourseContext } from '../src/core/types';

describe('CourseTracker 增量同步', () => {
  const course: Course = {
    pk1: '_17458_1',
    batchUid: 'PHY100126103015',
    name: 'PHY1001',
    ultraStatus: 'Classic',
  };

  const context: CourseContext = {
    origin: 'https://bb.cuhk.edu.cn',
    coursePk1: course.pk1,
    contentPk1: course.pk1,
  };

  const createTestNodes = (fileCount: number): ContentNode[] => [
    {
      pk1: '_folder1_1',
      title: 'Lecture Notes',
      handlerId: 'resource/x-bb-folder',
      hasChildren: true,
      unsupported: false,
      children: [],
      attachments: Array.from({ length: fileCount }, (_, i) => ({
        pk1: `_att${i + 1}_1`,
        contentPk1: '_folder1_1',
        fileName: `lecture${i + 1}.pdf`,
        mimeType: 'application/pdf',
      })),
    },
  ];

  const simulateDownloadHistory = (
    nodes: ContentNode[],
  ): CourseDownloadHistory => {
    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      nodes,
    );
    const history = createEmptyHistory(context.coursePk1, context.contentPk1);
    const records: DownloadHistoryRecord[] = snapshot.attachments.map((fp) => ({
      fingerprint: fp,
      targetPath: `BB/${course.name}/${fp.fileName}`,
      completedAt: Date.now() - 1000,
      success: true,
    }));
    return addDownloadRecords(history, records);
  };

  it('首次同步课程 - 所有文件标记为新增', () => {
    const nodes = createTestNodes(5);
    const history = createEmptyHistory(context.coursePk1, context.contentPk1);
    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      nodes,
    );
    const diff = detectDownloadDiff(snapshot, history);

    expect(diff.added.length).toBe(5);
    expect(diff.modified.length).toBe(0);
    expect(diff.unchanged.length).toBe(0);

    const preview = createDiffPreview(diff, nodes);
    expect(preview.summary.addedCount).toBe(5);
    expect(preview.summary.totalDownloadable).toBe(5);
  });

  it('课程无变化 - 跳过下载', () => {
    const nodes = createTestNodes(3);
    const history = simulateDownloadHistory(nodes);
    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      nodes,
    );
    const diff = detectDownloadDiff(snapshot, history);

    expect(diff.added.length).toBe(0);
    expect(diff.modified.length).toBe(0);
    expect(diff.unchanged.length).toBe(3);

    const preview = createDiffPreview(diff, nodes);
    expect(preview.summary.totalDownloadable).toBe(0);
  });

  it('课程新增文件 - 只下载新文件', () => {
    const oldNodes = createTestNodes(3);
    const history = simulateDownloadHistory(oldNodes);

    const newNodes = createTestNodes(5);
    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      newNodes,
    );
    const diff = detectDownloadDiff(snapshot, history);

    expect(diff.added.length).toBe(2);
    expect(diff.modified.length).toBe(0);
    expect(diff.unchanged.length).toBe(3);

    const preview = createDiffPreview(diff, newNodes);
    expect(preview.summary.addedCount).toBe(2);
    expect(preview.summary.unchangedCount).toBe(3);
    expect(preview.summary.totalDownloadable).toBe(2);

    const downloadableItems = filterDownloadableItems(preview);
    const downloadableKeys = new Set(
      downloadableItems.map(
        (item) =>
          `${item.fingerprint.contentPk1}:${item.fingerprint.attachmentPk1}`,
      ),
    );

    const plan = createDownloadPlan(context, course, newNodes, downloadableKeys);
    expect(plan.length).toBe(2);
    expect(plan.every((task) => task.coursePk1 === course.pk1)).toBe(true);
  });

  it('文件重命名 - 标记为修改并重新下载', () => {
    const oldNodes: ContentNode[] = [
      {
        pk1: '_folder1_1',
        title: 'Lecture Notes',
        handlerId: 'resource/x-bb-folder',
        hasChildren: false,
        unsupported: false,
        children: [],
        attachments: [
          {
            pk1: '_att1_1',
            contentPk1: '_folder1_1',
            fileName: 'lecture_old.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    ];
    const history = simulateDownloadHistory(oldNodes);

    const newNodes: ContentNode[] = [
      {
        pk1: '_folder1_1',
        title: 'Lecture Notes',
        handlerId: 'resource/x-bb-folder',
        hasChildren: false,
        unsupported: false,
        children: [],
        attachments: [
          {
            pk1: '_att1_1',
            contentPk1: '_folder1_1',
            fileName: 'lecture_new.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    ];

    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      newNodes,
    );
    const diff = detectDownloadDiff(snapshot, history);

    expect(diff.added.length).toBe(0);
    expect(diff.modified.length).toBe(1);
    expect(diff.unchanged.length).toBe(0);

    const preview = createDiffPreview(diff, newNodes);
    expect(preview.summary.modifiedCount).toBe(1);
    expect(preview.summary.totalDownloadable).toBe(1);
  });

  it('批量同步多个课程 - 每个课程独立检测增量', () => {
    const courses = [
      { ...course, pk1: '_course1_1', name: 'Course1' },
      { ...course, pk1: '_course2_1', name: 'Course2' },
    ];

    const results = courses.map((c) => {
      const ctx: CourseContext = {
        origin: 'https://bb.cuhk.edu.cn',
        coursePk1: c.pk1,
        contentPk1: c.pk1,
      };
      const nodes = createTestNodes(3);
      const history = createEmptyHistory(ctx.coursePk1, ctx.contentPk1);
      const snapshot = createContentSnapshot(
        ctx.coursePk1,
        ctx.contentPk1,
        nodes,
      );
      const diff = detectDownloadDiff(snapshot, history);
      return {
        coursePk1: c.pk1,
        addedCount: diff.added.length,
      };
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.addedCount).toBe(3);
    expect(results[1]!.addedCount).toBe(3);
  });

  it('历史记录正确关联到课程和内容区', () => {
    const nodes = createTestNodes(2);
    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      nodes,
    );

    let history = createEmptyHistory(context.coursePk1, context.contentPk1);
    const records: DownloadHistoryRecord[] = snapshot.attachments.map((fp) => ({
      fingerprint: fp,
      targetPath: `BB/${course.name}/${fp.fileName}`,
      completedAt: Date.now(),
      success: true,
    }));
    history = addDownloadRecords(history, records);

    expect(history.coursePk1).toBe(context.coursePk1);
    expect(history.rootContentPk1).toBe(context.contentPk1);
    expect(history.records.length).toBe(2);
    expect(
      history.records.every((r) => r.fingerprint.contentPk1 === '_folder1_1'),
    ).toBe(true);
  });
});
