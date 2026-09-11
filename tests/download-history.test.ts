import { describe, it, expect, beforeEach } from 'vitest';
import type { ContentNode } from '../src/core/types';
import {
  createContentSnapshot,
  type AttachmentFingerprint,
} from '../src/core/fingerprint';
import {
  createEmptyHistory,
  addDownloadRecord,
  addDownloadRecords,
  detectDownloadDiff,
  needsIncrementalSync,
  getDownloadableFingerprints,
  findPreviousTargetPath,
  pruneHistory,
  type DownloadHistoryRecord,
  type CourseDownloadHistory,
} from '../src/core/download-history';

describe('download-history', () => {
  const coursePk1 = '_course_123_1';
  const rootContentPk1 = '_root_456_1';

  let history: CourseDownloadHistory;

  beforeEach(() => {
    history = createEmptyHistory(coursePk1, rootContentPk1);
  });

  describe('createEmptyHistory', () => {
    it('should create empty history with metadata', () => {
      expect(history.coursePk1).toBe(coursePk1);
      expect(history.rootContentPk1).toBe(rootContentPk1);
      expect(history.records).toEqual([]);
      expect(history.lastUpdated).toBeGreaterThan(0);
    });
  });

  describe('addDownloadRecord', () => {
    it('should add new record to history', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'test.pdf',
        timestamp: Date.now(),
      };

      const record: DownloadHistoryRecord = {
        fingerprint: fp,
        targetPath: 'BB/Course/test.pdf',
        completedAt: Date.now(),
        success: true,
      };

      const updated = addDownloadRecord(history, record);

      expect(updated.records).toHaveLength(1);
      expect(updated.records[0]).toEqual(record);
      expect(updated.lastUpdated).toBeGreaterThanOrEqual(history.lastUpdated);
    });

    it('should replace existing record with same key', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'test.pdf',
        timestamp: Date.now(),
      };

      const record1: DownloadHistoryRecord = {
        fingerprint: fp,
        targetPath: 'BB/Course/test.pdf',
        completedAt: Date.now(),
        success: false,
      };

      const record2: DownloadHistoryRecord = {
        fingerprint: { ...fp, fileName: 'test-updated.pdf' },
        targetPath: 'BB/Course/test-updated.pdf',
        completedAt: Date.now() + 1000,
        success: true,
      };

      let updated = addDownloadRecord(history, record1);
      updated = addDownloadRecord(updated, record2);

      expect(updated.records).toHaveLength(1);
      expect(updated.records[0]?.fingerprint.fileName).toBe('test-updated.pdf');
      expect(updated.records[0]?.success).toBe(true);
    });
  });

  describe('addDownloadRecords', () => {
    it('should add multiple records', () => {
      const records: DownloadHistoryRecord[] = [
        {
          fingerprint: {
            attachmentPk1: '_att_1_1',
            contentPk1: '_content_1_1',
            fileName: 'file1.pdf',
            timestamp: Date.now(),
          },
          targetPath: 'BB/Course/file1.pdf',
          completedAt: Date.now(),
          success: true,
        },
        {
          fingerprint: {
            attachmentPk1: '_att_2_1',
            contentPk1: '_content_2_1',
            fileName: 'file2.pdf',
            timestamp: Date.now(),
          },
          targetPath: 'BB/Course/file2.pdf',
          completedAt: Date.now(),
          success: true,
        },
      ];

      const updated = addDownloadRecords(history, records);

      expect(updated.records).toHaveLength(2);
    });
  });

  describe('detectDownloadDiff', () => {
    it('should detect all new attachments as added', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_node_1_1',
          title: 'Node 1',
          handlerId: 'resource/x-bb-file',
          hasChildren: false,
          children: [],
          attachments: [
            {
              pk1: '_att_1_1',
              contentPk1: '_content_1_1',
              fileName: 'new.pdf',
            },
          ],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const diff = detectDownloadDiff(snapshot, history);

      expect(diff.added).toHaveLength(1);
      expect(diff.modified).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);
    });

    it('should detect unchanged attachments', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        timestamp: Date.now(),
      };

      history = addDownloadRecord(history, {
        fingerprint: fp,
        targetPath: 'BB/Course/test.pdf',
        completedAt: Date.now(),
        success: true,
      });

      const nodes: ContentNode[] = [
        {
          pk1: '_node_1_1',
          title: 'Node 1',
          handlerId: 'resource/x-bb-file',
          hasChildren: false,
          children: [],
          attachments: [
            {
              pk1: '_att_1_1',
              contentPk1: '_content_1_1',
              fileName: 'test.pdf',
              mimeType: 'application/pdf',
            },
          ],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const diff = detectDownloadDiff(snapshot, history);

      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(1);
    });

    it('should detect modified attachments (fileName changed)', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'old.pdf',
        timestamp: Date.now(),
      };

      history = addDownloadRecord(history, {
        fingerprint: fp,
        targetPath: 'BB/Course/old.pdf',
        completedAt: Date.now(),
        success: true,
      });

      const nodes: ContentNode[] = [
        {
          pk1: '_node_1_1',
          title: 'Node 1',
          handlerId: 'resource/x-bb-file',
          hasChildren: false,
          children: [],
          attachments: [
            {
              pk1: '_att_1_1',
              contentPk1: '_content_1_1',
              fileName: 'updated.pdf',
            },
          ],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const diff = detectDownloadDiff(snapshot, history);

      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(1);
      expect(diff.unchanged).toHaveLength(0);
    });

    it('should detect removed attachments', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'removed.pdf',
        timestamp: Date.now(),
      };

      history = addDownloadRecord(history, {
        fingerprint: fp,
        targetPath: 'BB/Course/removed.pdf',
        completedAt: Date.now(),
        success: true,
      });

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, []);
      const diff = detectDownloadDiff(snapshot, history);

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0]?.fileName).toBe('removed.pdf');
    });

    it('should handle complex scenario with all types of changes', () => {
      // History: file1 (unchanged), file2 (will be modified), file3 (will be removed)
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
        {
          fingerprint: {
            attachmentPk1: '_att_3_1',
            contentPk1: '_content_3_1',
            fileName: 'removed.pdf',
            timestamp: Date.now(),
          },
          targetPath: 'BB/Course/removed.pdf',
          completedAt: Date.now(),
          success: true,
        },
      ]);

      // Current state: file1 (unchanged), file2 (modified), file4 (new)
      const nodes: ContentNode[] = [
        {
          pk1: '_node_1_1',
          title: 'Node 1',
          handlerId: 'resource/x-bb-file',
          hasChildren: false,
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
              pk1: '_att_4_1',
              contentPk1: '_content_4_1',
              fileName: 'added.pdf',
            },
          ],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(coursePk1, rootContentPk1, nodes);
      const diff = detectDownloadDiff(snapshot, history);

      expect(diff.added).toHaveLength(1);
      expect(diff.modified).toHaveLength(1);
      expect(diff.removed).toHaveLength(1);
      expect(diff.unchanged).toHaveLength(1);
    });
  });

  describe('needsIncrementalSync', () => {
    it('should return true if there are added items', () => {
      const diff = {
        added: [
          {
            attachmentPk1: '_att_1_1',
            contentPk1: '_content_1_1',
            fileName: 'new.pdf',
            timestamp: Date.now(),
          },
        ],
        modified: [],
        removed: [],
        unchanged: [],
      };

      expect(needsIncrementalSync(diff)).toBe(true);
    });

    it('should return true if there are modified items', () => {
      const diff = {
        added: [],
        modified: [
          {
            attachmentPk1: '_att_1_1',
            contentPk1: '_content_1_1',
            fileName: 'modified.pdf',
            timestamp: Date.now(),
          },
        ],
        removed: [],
        unchanged: [],
      };

      expect(needsIncrementalSync(diff)).toBe(true);
    });

    it('should return false if only unchanged items exist', () => {
      const diff = {
        added: [],
        modified: [],
        removed: [],
        unchanged: [
          {
            attachmentPk1: '_att_1_1',
            contentPk1: '_content_1_1',
            fileName: 'unchanged.pdf',
            timestamp: Date.now(),
          },
        ],
      };

      expect(needsIncrementalSync(diff)).toBe(false);
    });
  });

  describe('getDownloadableFingerprints', () => {
    it('should return added and modified items', () => {
      const diff = {
        added: [
          {
            attachmentPk1: '_att_1_1',
            contentPk1: '_content_1_1',
            fileName: 'added.pdf',
            timestamp: Date.now(),
          },
        ],
        modified: [
          {
            attachmentPk1: '_att_2_1',
            contentPk1: '_content_2_1',
            fileName: 'modified.pdf',
            timestamp: Date.now(),
          },
        ],
        removed: [],
        unchanged: [],
      };

      const downloadable = getDownloadableFingerprints(diff);

      expect(downloadable).toHaveLength(2);
    });
  });

  describe('findPreviousTargetPath', () => {
    it('should find target path from history', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'test.pdf',
        timestamp: Date.now(),
      };

      history = addDownloadRecord(history, {
        fingerprint: fp,
        targetPath: 'BB/Course/Week1/test.pdf',
        completedAt: Date.now(),
        success: true,
      });

      const path = findPreviousTargetPath(history, fp);

      expect(path).toBe('BB/Course/Week1/test.pdf');
    });

    it('should return undefined if not found', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_999_1',
        contentPk1: '_content_999_1',
        fileName: 'notfound.pdf',
        timestamp: Date.now(),
      };

      const path = findPreviousTargetPath(history, fp);

      expect(path).toBeUndefined();
    });
  });

  describe('pruneHistory', () => {
    it('should limit number of records', () => {
      const records: DownloadHistoryRecord[] = Array.from(
        { length: 100 },
        (_, i) => ({
          fingerprint: {
            attachmentPk1: `_att_${i}_1`,
            contentPk1: `_content_${i}_1`,
            fileName: `file${i}.pdf`,
            timestamp: Date.now(),
          },
          targetPath: `BB/Course/file${i}.pdf`,
          completedAt: Date.now() + i * 1000,
          success: true,
        }),
      );

      history = addDownloadRecords(history, records);
      const pruned = pruneHistory(history, { maxRecords: 50 });

      expect(pruned.records.length).toBeLessThanOrEqual(50);
    });

    it('should remove old failed records', () => {
      const oldTime = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days ago
      const recentTime = Date.now();

      history = addDownloadRecords(history, [
        {
          fingerprint: {
            attachmentPk1: '_att_old_1',
            contentPk1: '_content_old_1',
            fileName: 'old.pdf',
            timestamp: oldTime,
          },
          targetPath: 'BB/Course/old.pdf',
          completedAt: oldTime,
          success: false, // Failed download
        },
        {
          fingerprint: {
            attachmentPk1: '_att_recent_1',
            contentPk1: '_content_recent_1',
            fileName: 'recent.pdf',
            timestamp: recentTime,
          },
          targetPath: 'BB/Course/recent.pdf',
          completedAt: recentTime,
          success: true,
        },
      ]);

      const pruned = pruneHistory(history, { maxAgeDays: 90 });

      expect(pruned.records).toHaveLength(1);
      expect(pruned.records[0]?.fingerprint.fileName).toBe('recent.pdf');
    });

    it('should keep only latest record per unique key', () => {
      const fp: AttachmentFingerprint = {
        attachmentPk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'test.pdf',
        timestamp: Date.now(),
      };

      history = addDownloadRecords(history, [
        {
          fingerprint: fp,
          targetPath: 'BB/Course/old-path/test.pdf',
          completedAt: Date.now() - 1000,
          success: true,
        },
        {
          fingerprint: { ...fp, timestamp: Date.now() },
          targetPath: 'BB/Course/new-path/test.pdf',
          completedAt: Date.now(),
          success: true,
        },
      ]);

      const pruned = pruneHistory(history);

      expect(pruned.records).toHaveLength(1);
      expect(pruned.records[0]?.targetPath).toBe('BB/Course/new-path/test.pdf');
    });
  });
});
