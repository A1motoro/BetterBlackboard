import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryHistoryStore,
  type HistoryStore,
} from '../src/infrastructure/history-store';
import {
  createEmptyHistory,
  addDownloadRecord,
  type DownloadHistoryRecord,
} from '../src/core/download-history';

describe('history-store', () => {
  let store: HistoryStore;
  const coursePk1 = '_course_123_1';
  const rootContentPk1 = '_root_456_1';

  beforeEach(() => {
    store = new MemoryHistoryStore();
  });

  describe('get', () => {
    it('should return empty history if not found', async () => {
      const history = await store.get(coursePk1, rootContentPk1);

      expect(history.coursePk1).toBe(coursePk1);
      expect(history.rootContentPk1).toBe(rootContentPk1);
      expect(history.records).toEqual([]);
    });

    it('should return saved history', async () => {
      let history = createEmptyHistory(coursePk1, rootContentPk1);
      const record: DownloadHistoryRecord = {
        fingerprint: {
          attachmentPk1: '_att_1_1',
          contentPk1: '_content_1_1',
          fileName: 'test.pdf',
          timestamp: Date.now(),
        },
        targetPath: 'BB/Course/test.pdf',
        completedAt: Date.now(),
        success: true,
      };
      history = addDownloadRecord(history, record);

      await store.save(history);
      const retrieved = await store.get(coursePk1, rootContentPk1);

      expect(retrieved.records).toHaveLength(1);
      expect(retrieved.records[0]?.fingerprint.fileName).toBe('test.pdf');
    });
  });

  describe('save', () => {
    it('should persist history', async () => {
      const history = createEmptyHistory(coursePk1, rootContentPk1);
      await store.save(history);

      const retrieved = await store.get(coursePk1, rootContentPk1);
      expect(retrieved.coursePk1).toBe(coursePk1);
    });

    it('should overwrite existing history', async () => {
      let history = createEmptyHistory(coursePk1, rootContentPk1);

      const record1: DownloadHistoryRecord = {
        fingerprint: {
          attachmentPk1: '_att_1_1',
          contentPk1: '_content_1_1',
          fileName: 'first.pdf',
          timestamp: Date.now(),
        },
        targetPath: 'BB/Course/first.pdf',
        completedAt: Date.now(),
        success: true,
      };

      history = addDownloadRecord(history, record1);
      await store.save(history);

      const record2: DownloadHistoryRecord = {
        fingerprint: {
          attachmentPk1: '_att_2_1',
          contentPk1: '_content_2_1',
          fileName: 'second.pdf',
          timestamp: Date.now(),
        },
        targetPath: 'BB/Course/second.pdf',
        completedAt: Date.now(),
        success: true,
      };

      history = addDownloadRecord(history, record2);
      await store.save(history);

      const retrieved = await store.get(coursePk1, rootContentPk1);
      expect(retrieved.records).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should remove history', async () => {
      const history = createEmptyHistory(coursePk1, rootContentPk1);
      await store.save(history);
      await store.delete(coursePk1, rootContentPk1);

      const retrieved = await store.get(coursePk1, rootContentPk1);
      expect(retrieved.records).toEqual([]);
    });

    it('should not throw if history does not exist', async () => {
      await expect(
        store.delete('_nonexistent_1', '_nonexistent_1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('listKeys', () => {
    it('should return empty array initially', async () => {
      const keys = await store.listKeys();
      expect(keys).toEqual([]);
    });

    it('should list all stored history keys', async () => {
      await store.save(createEmptyHistory('_course_1_1', '_root_1_1'));
      await store.save(createEmptyHistory('_course_2_1', '_root_2_1'));
      await store.save(createEmptyHistory('_course_1_1', '_root_3_1'));

      const keys = await store.listKeys();
      expect(keys).toHaveLength(3);
    });
  });

  describe('clear', () => {
    it('should remove all histories', async () => {
      await store.save(createEmptyHistory('_course_1_1', '_root_1_1'));
      await store.save(createEmptyHistory('_course_2_1', '_root_2_1'));

      await store.clear();

      const keys = await store.listKeys();
      expect(keys).toEqual([]);
    });
  });

  describe('multiple courses and roots', () => {
    it('should isolate histories by course and root', async () => {
      const history1 = createEmptyHistory('_course_1_1', '_root_1_1');
      const history2 = createEmptyHistory('_course_1_1', '_root_2_1');
      const history3 = createEmptyHistory('_course_2_1', '_root_1_1');

      await store.save(history1);
      await store.save(history2);
      await store.save(history3);

      const retrieved1 = await store.get('_course_1_1', '_root_1_1');
      const retrieved2 = await store.get('_course_1_1', '_root_2_1');
      const retrieved3 = await store.get('_course_2_1', '_root_1_1');

      expect(retrieved1.coursePk1).toBe('_course_1_1');
      expect(retrieved1.rootContentPk1).toBe('_root_1_1');
      expect(retrieved2.rootContentPk1).toBe('_root_2_1');
      expect(retrieved3.coursePk1).toBe('_course_2_1');
    });
  });
});
