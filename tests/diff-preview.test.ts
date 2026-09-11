import { describe, it, expect } from 'vitest';
import type { ContentNode } from '../src/core/types';
import {
  createContentSnapshot,
  type AttachmentFingerprint,
} from '../src/core/fingerprint';
import {
  createEmptyHistory,
  addDownloadRecords,
  detectDownloadDiff,
} from '../src/core/download-history';
import {
  createDiffPreview,
  formatPath,
  getChangeTypeLabel,
  filterDownloadableItems,
  groupByPath,
} from '../src/core/diff-preview';

describe('diff-preview', () => {
  const coursePk1 = '_course_123_1';
  const rootContentPk1 = '_root_456_1';

  describe('createDiffPreview', () => {
    it('should create preview with path information', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_folder_1_1',
          title: 'Week 1',
          handlerId: 'resource/x-bb-folder',
          hasChildren: true,
          children: [
            {
              pk1: '_file_1_1',
              title: 'Lecture',
              handlerId: 'resource/x-bb-file',
              hasChildren: false,
              children: [],
              attachments: [
                {
                  pk1: '_att_1_1',
                  contentPk1: '_content_1_1',
                  fileName: 'lecture1.pdf',
                },
              ],
              unsupported: false,
            },
          ],
          attachments: [],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const history = createEmptyHistory(coursePk1, rootContentPk1);
      const diff = detectDownloadDiff(snapshot, history);
      const preview = createDiffPreview(diff, nodes);

      expect(preview.added).toHaveLength(1);
      expect(preview.added[0]?.path).toEqual(['Week 1', 'Lecture']);
      expect(preview.added[0]?.fileName).toBe('lecture1.pdf');
      expect(preview.added[0]?.changeType).toBe('added');
    });

    it('should generate correct summary', () => {
      let history = createEmptyHistory(coursePk1, rootContentPk1);

      // Add one file to history
      history = addDownloadRecords(history, [
        {
          fingerprint: {
            attachmentPk1: '_att_1_1',
            contentPk1: '_content_1_1',
            fileName: 'unchanged.pdf',
            timestamp: Date.now(),
          },
          targetPath: 'BB/Course/unchanged.pdf',
          completedAt: Date.now(),
          success: true,
        },
        {
          fingerprint: {
            attachmentPk1: '_att_2_1',
            contentPk1: '_content_2_1',
            fileName: 'old-name.pdf',
            timestamp: Date.now(),
          },
          targetPath: 'BB/Course/old-name.pdf',
          completedAt: Date.now(),
          success: true,
        },
      ]);

      const nodes: ContentNode[] = [
        {
          pk1: '_node_1_1',
          title: 'Files',
          handlerId: 'resource/x-bb-folder',
          hasChildren: true,
          children: [],
          attachments: [
            {
              pk1: '_att_1_1',
              contentPk1: '_content_1_1',
              fileName: 'unchanged.pdf',
            },
            {
              pk1: '_att_2_1',
              contentPk1: '_content_2_1',
              fileName: 'new-name.pdf',
            },
            {
              pk1: '_att_3_1',
              contentPk1: '_content_3_1',
              fileName: 'added.pdf',
            },
          ],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const diff = detectDownloadDiff(snapshot, history);
      const preview = createDiffPreview(diff, nodes);

      expect(preview.summary.addedCount).toBe(1);
      expect(preview.summary.modifiedCount).toBe(1);
      expect(preview.summary.unchangedCount).toBe(1);
      expect(preview.summary.totalDownloadable).toBe(2);
    });

    it('should handle multiple levels of nesting', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_folder_1_1',
          title: 'Lectures',
          handlerId: 'resource/x-bb-folder',
          hasChildren: true,
          children: [
            {
              pk1: '_folder_2_1',
              title: 'Week 1',
              handlerId: 'resource/x-bb-folder',
              hasChildren: true,
              children: [
                {
                  pk1: '_file_1_1',
                  title: 'Day 1',
                  handlerId: 'resource/x-bb-file',
                  hasChildren: false,
                  children: [],
                  attachments: [
                    {
                      pk1: '_att_1_1',
                      contentPk1: '_content_1_1',
                      fileName: 'day1.pdf',
                    },
                  ],
                  unsupported: false,
                },
              ],
              attachments: [],
              unsupported: false,
            },
          ],
          attachments: [],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const history = createEmptyHistory(coursePk1, rootContentPk1);
      const diff = detectDownloadDiff(snapshot, history);
      const preview = createDiffPreview(diff, nodes);

      expect(preview.added[0]?.path).toEqual(['Lectures', 'Week 1', 'Day 1']);
    });

    it('should handle removed files not in current tree', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_removed_1',
        contentPk1: '_content_removed_1',
        fileName: 'removed.pdf',
        timestamp: Date.now(),
      };

      let history = createEmptyHistory(coursePk1, rootContentPk1);
      history = addDownloadRecords(history, [
        {
          fingerprint: fp,
          targetPath: 'BB/Course/removed.pdf',
          completedAt: Date.now(),
          success: true,
        },
      ]);

      const nodes: ContentNode[] = [];
      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const diff = detectDownloadDiff(snapshot, history);
      const preview = createDiffPreview(diff, nodes);

      expect(preview.removed).toHaveLength(1);
      expect(preview.removed[0]?.path).toEqual(['未知位置']);
      expect(preview.removed[0]?.changeType).toBe('removed');
    });
  });

  describe('formatPath', () => {
    it('should join path segments with separator', () => {
      expect(formatPath(['Week 1', 'Lecture', 'Slides'])).toBe(
        'Week 1 / Lecture / Slides',
      );
    });

    it('should handle single segment', () => {
      expect(formatPath(['Root'])).toBe('Root');
    });

    it('should handle empty path', () => {
      expect(formatPath([])).toBe('');
    });
  });

  describe('getChangeTypeLabel', () => {
    it('should return correct labels', () => {
      expect(getChangeTypeLabel('added')).toBe('新增');
      expect(getChangeTypeLabel('modified')).toBe('已修改');
      expect(getChangeTypeLabel('removed')).toBe('已删除');
    });
  });

  describe('filterDownloadableItems', () => {
    it('should return only added and modified items', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_node_1_1',
          title: 'Files',
          handlerId: 'resource/x-bb-folder',
          hasChildren: false,
          children: [],
          attachments: [
            {
              pk1: '_att_1_1',
              contentPk1: '_content_1_1',
              fileName: 'new.pdf',
            },
            {
              pk1: '_att_2_1',
              contentPk1: '_content_2_1',
              fileName: 'unchanged.pdf',
            },
          ],
          unsupported: false,
        },
      ];

      let history = createEmptyHistory(coursePk1, rootContentPk1);
      history = addDownloadRecords(history, [
        {
          fingerprint: {
            attachmentPk1: '_att_2_1',
            contentPk1: '_content_2_1',
            fileName: 'unchanged.pdf',
            timestamp: Date.now(),
          },
          targetPath: 'BB/Course/unchanged.pdf',
          completedAt: Date.now(),
          success: true,
        },
      ]);

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const diff = detectDownloadDiff(snapshot, history);
      const preview = createDiffPreview(diff, nodes);

      const downloadable = filterDownloadableItems(preview);

      expect(downloadable).toHaveLength(1);
      expect(downloadable[0]?.changeType).toBe('added');
    });
  });

  describe('groupByPath', () => {
    it('should group items by path', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_folder_1_1',
          title: 'Week 1',
          handlerId: 'resource/x-bb-folder',
          hasChildren: true,
          children: [
            {
              pk1: '_file_1_1',
              title: 'Lecture',
              handlerId: 'resource/x-bb-file',
              hasChildren: false,
              children: [],
              attachments: [
                {
                  pk1: '_att_1_1',
                  contentPk1: '_content_1_1',
                  fileName: 'lecture1.pdf',
                },
                {
                  pk1: '_att_2_1',
                  contentPk1: '_content_2_1',
                  fileName: 'lecture2.pdf',
                },
              ],
              unsupported: false,
            },
          ],
          attachments: [],
          unsupported: false,
        },
        {
          pk1: '_folder_2_1',
          title: 'Week 2',
          handlerId: 'resource/x-bb-folder',
          hasChildren: true,
          children: [
            {
              pk1: '_file_2_1',
              title: 'Lecture',
              handlerId: 'resource/x-bb-file',
              hasChildren: false,
              children: [],
              attachments: [
                {
                  pk1: '_att_3_1',
                  contentPk1: '_content_3_1',
                  fileName: 'lecture3.pdf',
                },
              ],
              unsupported: false,
            },
          ],
          attachments: [],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const history = createEmptyHistory(coursePk1, rootContentPk1);
      const diff = detectDownloadDiff(snapshot, history);
      const preview = createDiffPreview(diff, nodes);

      const groups = groupByPath(preview.added);

      expect(groups.size).toBe(2);
      expect(groups.get('Week 1 / Lecture')).toHaveLength(2);
      expect(groups.get('Week 2 / Lecture')).toHaveLength(1);
    });

    it('should handle empty items', () => {
      const groups = groupByPath([]);
      expect(groups.size).toBe(0);
    });
  });
});
