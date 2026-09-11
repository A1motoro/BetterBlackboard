import { describe, it, expect } from 'vitest';
import { createContentSnapshot } from '../src/core/fingerprint';
import {
  detectDownloadDiff,
  addDownloadRecords,
  createEmptyHistory,
  type DownloadHistoryRecord,
} from '../src/core/download-history';
import {
  createDiffPreview,
  filterDownloadableItems,
} from '../src/core/diff-preview';
import { createDownloadPlan } from '../src/core/download-plan';
import type { ContentNode, Course, CourseContext } from '../src/core/types';

describe('增量同步集成测试', () => {
  const context: CourseContext = {
    origin: 'https://bb.cuhk.edu.cn',
    coursePk1: '_17458_1',
    contentPk1: '_656083_1',
  };

  const course: Course = {
    pk1: '_17458_1',
    batchUid: 'PHY100126103015',
    name: 'PHY1001',
    ultraStatus: 'Classic',
  };

  const nodes: ContentNode[] = [
    {
      pk1: '_1_1',
      title: 'Lecture Notes',
      handlerId: 'resource/x-bb-folder',
      hasChildren: true,
      unsupported: false,
      children: [],
      attachments: [
        {
          pk1: '_att1_1',
          contentPk1: '_1_1',
          fileName: 'lecture1.pdf',
          mimeType: 'application/pdf',
        },
        {
          pk1: '_att2_1',
          contentPk1: '_1_1',
          fileName: 'lecture2.pdf',
          mimeType: 'application/pdf',
        },
      ],
    },
  ];

  it('首次下载 - 所有文件标记为新增', () => {
    const history = createEmptyHistory(context.coursePk1, context.contentPk1);
    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      nodes,
    );
    const diff = detectDownloadDiff(snapshot, history);

    expect(diff.added.length).toBe(2);
    expect(diff.modified.length).toBe(0);
    expect(diff.unchanged.length).toBe(0);
    expect(diff.removed.length).toBe(0);

    const preview = createDiffPreview(diff, nodes);
    expect(preview.summary.addedCount).toBe(2);
    expect(preview.summary.totalDownloadable).toBe(2);
  });

  it('无变化 - 所有文件标记为未变化', () => {
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

    const diff = detectDownloadDiff(snapshot, history);

    expect(diff.added.length).toBe(0);
    expect(diff.modified.length).toBe(0);
    expect(diff.unchanged.length).toBe(2);
    expect(diff.removed.length).toBe(0);

    const preview = createDiffPreview(diff, nodes);
    expect(preview.summary.totalDownloadable).toBe(0);
  });

  it('文件名变化 - 标记为修改', () => {
    const oldNodes: ContentNode[] = [
      {
        ...nodes[0],
        attachments: [
          {
            pk1: '_att1_1',
            contentPk1: '_1_1',
            fileName: 'lecture1_old.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    ];

    const oldSnapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      oldNodes,
    );

    let history = createEmptyHistory(context.coursePk1, context.contentPk1);
    const records: DownloadHistoryRecord[] = oldSnapshot.attachments.map(
      (fp) => ({
        fingerprint: fp,
        targetPath: `BB/${course.name}/${fp.fileName}`,
        completedAt: Date.now(),
        success: true,
      }),
    );
    history = addDownloadRecords(history, records);

    const newNodes: ContentNode[] = [
      {
        ...nodes[0],
        attachments: [
          {
            pk1: '_att1_1',
            contentPk1: '_1_1',
            fileName: 'lecture1_new.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    ];

    const newSnapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      newNodes,
    );

    const diff = detectDownloadDiff(newSnapshot, history);

    expect(diff.added.length).toBe(0);
    expect(diff.modified.length).toBe(1);
    expect(diff.unchanged.length).toBe(0);

    const preview = createDiffPreview(diff, newNodes);
    expect(preview.summary.modifiedCount).toBe(1);
    expect(preview.summary.totalDownloadable).toBe(1);
  });

  it('新增和已存在文件混合', () => {
    const oldNodes: ContentNode[] = [
      {
        ...nodes[0],
        attachments: [nodes[0]!.attachments[0]!],
      },
    ];

    const oldSnapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      oldNodes,
    );

    let history = createEmptyHistory(context.coursePk1, context.contentPk1);
    const records: DownloadHistoryRecord[] = oldSnapshot.attachments.map(
      (fp) => ({
        fingerprint: fp,
        targetPath: `BB/${course.name}/${fp.fileName}`,
        completedAt: Date.now(),
        success: true,
      }),
    );
    history = addDownloadRecords(history, records);

    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      nodes,
    );

    const diff = detectDownloadDiff(snapshot, history);

    expect(diff.added.length).toBe(1);
    expect(diff.modified.length).toBe(0);
    expect(diff.unchanged.length).toBe(1);

    const preview = createDiffPreview(diff, nodes);
    expect(preview.summary.addedCount).toBe(1);
    expect(preview.summary.unchangedCount).toBe(1);
    expect(preview.summary.totalDownloadable).toBe(1);
  });

  it('diff预览可转换为下载计划', () => {
    const history = createEmptyHistory(context.coursePk1, context.contentPk1);
    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      nodes,
    );
    const diff = detectDownloadDiff(snapshot, history);
    const preview = createDiffPreview(diff, nodes);

    const downloadableItems = filterDownloadableItems(preview);
    const downloadableKeys = new Set(
      downloadableItems.map(
        (item) =>
          `${item.fingerprint.contentPk1}:${item.fingerprint.attachmentPk1}`,
      ),
    );

    const plan = createDownloadPlan(context, course, nodes, downloadableKeys);

    expect(plan.length).toBe(2);
    expect(plan[0]).toMatchObject({
      origin: context.origin,
      coursePk1: context.coursePk1,
      contentPk1: '_1_1',
      attachmentPk1: '_att1_1',
      sourceFileName: 'lecture1.pdf',
    });
  });

  it('路径信息正确显示在预览中', () => {
    const history = createEmptyHistory(context.coursePk1, context.contentPk1);
    const snapshot = createContentSnapshot(
      context.coursePk1,
      context.contentPk1,
      nodes,
    );
    const diff = detectDownloadDiff(snapshot, history);
    const preview = createDiffPreview(diff, nodes);

    expect(preview.added.length).toBe(2);
    expect(preview.added[0]!.path).toEqual(['Lecture Notes']);
    expect(preview.added[0]!.fileName).toBe('lecture1.pdf');
    expect(preview.added[0]!.changeType).toBe('added');
  });
});
