import { describe, it, expect, beforeEach } from 'vitest';
import type { ContentNode, Course, CourseContext } from '../src/core/types';
import { MemoryHistoryStore } from '../src/infrastructure/history-store';
import {
  analyzeIncrementalSync,
  createIncrementalDownloadPlan,
  recordDownloadCompletion,
  clearDownloadHistory,
} from '../src/core/incremental-sync';
import { addDownloadRecords } from '../src/core/download-history';

describe('incremental-sync', () => {
  let store: MemoryHistoryStore;

  const context: CourseContext = {
    origin: 'https://bb.cuhk.edu.cn',
    coursePk1: '_course_123_1',
    contentPk1: '_root_456_1',
  };

  const course: Course = {
    pk1: '_course_123_1',
    batchUid: 'CSC1001',
    name: 'Introduction to CS',
    ultraStatus: 'Classic',
  };

  const nodes: ContentNode[] = [
    {
      pk1: '_node_1_1',
      title: 'Week 1',
      handlerId: 'resource/x-bb-folder',
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
  ];

  beforeEach(() => {
    store = new MemoryHistoryStore();
  });

  describe('analyzeIncrementalSync', () => {
    it('should detect all files as new on first sync', async () => {
      const result = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });

      expect(result.needsDownload).toBe(true);
      expect(result.diff.added).toHaveLength(1);
      expect(result.diff.modified).toHaveLength(0);
      expect(result.diff.unchanged).toHaveLength(0);
      expect(result.downloadableFingerprints).toHaveLength(1);
    });

    it('should detect no changes on second sync', async () => {
      // First sync
      const firstResult = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });
      await recordDownloadCompletion(
        context,
        createIncrementalDownloadPlan(
          context,
          course,
          nodes,
          firstResult.downloadableFingerprints,
        ),
        { store },
      );

      // Second sync
      const secondResult = await analyzeIncrementalSync(
        context,
        course,
        nodes,
        { store },
      );

      expect(secondResult.needsDownload).toBe(false);
      expect(secondResult.diff.added).toHaveLength(0);
      expect(secondResult.diff.unchanged).toHaveLength(1);
    });

    it('should detect new files added after initial sync', async () => {
      // First sync with one file
      const firstResult = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });
      await recordDownloadCompletion(
        context,
        createIncrementalDownloadPlan(
          context,
          course,
          nodes,
          firstResult.downloadableFingerprints,
        ),
        { store },
      );

      // Add new file
      const updatedNodes: ContentNode[] = [
        ...nodes,
        {
          pk1: '_node_2_1',
          title: 'Week 2',
          handlerId: 'resource/x-bb-folder',
          hasChildren: false,
          children: [],
          attachments: [
            {
              pk1: '_att_2_1',
              contentPk1: '_content_2_1',
              fileName: 'lecture2.pdf',
            },
          ],
          unsupported: false,
        },
      ];

      // Second sync
      const secondResult = await analyzeIncrementalSync(
        context,
        course,
        updatedNodes,
        { store },
      );

      expect(secondResult.needsDownload).toBe(true);
      expect(secondResult.diff.added).toHaveLength(1);
      expect(secondResult.diff.unchanged).toHaveLength(1);
      expect(secondResult.downloadableFingerprints).toHaveLength(1);
    });

    it('should detect modified files', async () => {
      // First sync
      const firstResult = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });
      await recordDownloadCompletion(
        context,
        createIncrementalDownloadPlan(
          context,
          course,
          nodes,
          firstResult.downloadableFingerprints,
        ),
        { store },
      );

      // Modify file name
      const modifiedNodes: ContentNode[] = [
        {
          ...nodes[0]!,
          attachments: [
            {
              pk1: '_att_1_1',
              contentPk1: '_content_1_1',
              fileName: 'lecture1-updated.pdf',
            },
          ],
        },
      ];

      // Second sync
      const secondResult = await analyzeIncrementalSync(
        context,
        course,
        modifiedNodes,
        { store },
      );

      expect(secondResult.needsDownload).toBe(true);
      expect(secondResult.diff.modified).toHaveLength(1);
      expect(secondResult.downloadableFingerprints).toHaveLength(1);
    });

    it('should force full sync when requested', async () => {
      // First sync
      const firstResult = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });
      await recordDownloadCompletion(
        context,
        createIncrementalDownloadPlan(
          context,
          course,
          nodes,
          firstResult.downloadableFingerprints,
        ),
        { store },
      );

      // Force full sync
      const secondResult = await analyzeIncrementalSync(
        context,
        course,
        nodes,
        { store, forceFullSync: true },
      );

      expect(secondResult.needsDownload).toBe(true);
      expect(secondResult.diff.added).toHaveLength(1);
      expect(secondResult.diff.unchanged).toHaveLength(0);
    });
  });

  describe('createIncrementalDownloadPlan', () => {
    it('should create plan only for downloadable files', async () => {
      const result = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });

      const plan = createIncrementalDownloadPlan(
        context,
        course,
        nodes,
        result.downloadableFingerprints,
      );

      expect(plan).toHaveLength(1);
      expect(plan[0]?.sourceFileName).toBe('lecture1.pdf');
    });

    it('should create empty plan when no files need download', async () => {
      // First sync and record
      const firstResult = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });
      await recordDownloadCompletion(
        context,
        createIncrementalDownloadPlan(
          context,
          course,
          nodes,
          firstResult.downloadableFingerprints,
        ),
        { store },
      );

      // Second sync
      const secondResult = await analyzeIncrementalSync(
        context,
        course,
        nodes,
        { store },
      );

      const plan = createIncrementalDownloadPlan(
        context,
        course,
        nodes,
        secondResult.downloadableFingerprints,
      );

      expect(plan).toHaveLength(0);
    });
  });

  describe('recordDownloadCompletion', () => {
    it('should update history with completed downloads', async () => {
      const result = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });

      const plan = createIncrementalDownloadPlan(
        context,
        course,
        nodes,
        result.downloadableFingerprints,
      );

      await recordDownloadCompletion(context, plan, { store });

      const history = await store.get(context.coursePk1, context.contentPk1);
      expect(history.records).toHaveLength(1);
      expect(history.records[0]?.success).toBe(true);
    });

    it('should handle multiple completions', async () => {
      const result = await analyzeIncrementalSync(context, course, nodes, {
        store,
      });

      const plan = createIncrementalDownloadPlan(
        context,
        course,
        nodes,
        result.downloadableFingerprints,
      );

      await recordDownloadCompletion(context, plan, { store });
      await recordDownloadCompletion(context, plan, { store });

      const history = await store.get(context.coursePk1, context.contentPk1);
      expect(history.records).toHaveLength(1);
    });
  });

  describe('clearDownloadHistory', () => {
    it('should remove history for course and content', async () => {
      let history = await store.get(context.coursePk1, context.contentPk1);
      history = addDownloadRecords(history, [
        {
          fingerprint: {
            attachmentPk1: '_att_1_1',
            contentPk1: '_content_1_1',
            fileName: 'test.pdf',
            timestamp: Date.now(),
          },
          targetPath: 'BB/Course/test.pdf',
          completedAt: Date.now(),
          success: true,
        },
      ]);
      await store.save(history);

      await clearDownloadHistory(context.coursePk1, context.contentPk1, store);

      const cleared = await store.get(context.coursePk1, context.contentPk1);
      expect(cleared.records).toHaveLength(0);
    });
  });
});
