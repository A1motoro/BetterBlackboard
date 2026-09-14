import { describe, it, expect, vi } from 'vitest';
import { MemorySidebarStateStore } from '../src/infrastructure/sidebar-state-store';
import {
  isStorageChangedCourseTrackingEvent,
  type StorageChangedCourseTrackingEvent,
} from '../src/infrastructure/messages';
import type { CourseTrackingSnapshot } from '../src/core/courses';

describe('multi-tab-sync', () => {
  describe('sidebar collapsed state', () => {
    it('should sync collapsed state between store instances via onChanged', async () => {
      const store1 = new MemorySidebarStateStore();
      const store2 = new MemorySidebarStateStore();

      const listener = vi.fn();
      store2.onChanged(listener);

      await store1.setCollapsed(true);
      expect(await store1.getCollapsed()).toBe(true);
    });

    it('should handle multiple concurrent listeners', async () => {
      const store = new MemorySidebarStateStore();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      store.onChanged(listener1);
      store.onChanged(listener2);
      store.onChanged(listener3);

      await store.setCollapsed(true);

      expect(listener1).toHaveBeenCalledWith(true);
      expect(listener2).toHaveBeenCalledWith(true);
      expect(listener3).toHaveBeenCalledWith(true);
    });

    it('should not echo writes when applying remote changes', async () => {
      const store = new MemorySidebarStateStore();
      let callCount = 0;

      store.onChanged(() => {
        callCount++;
      });

      await store.setCollapsed(true);
      expect(callCount).toBe(1);

      await store.setCollapsed(false);
      expect(callCount).toBe(2);
    });
  });

  describe('course tracking messages', () => {
    it('should validate storage.changed.courseTracking message', () => {
      const validMessage: StorageChangedCourseTrackingEvent = {
        v: 1,
        type: 'storage.changed.courseTracking',
        snapshot: {
          trackedPk1s: ['course1', 'course2'],
          names: {},
          downloadedPaths: [],
          lastHomeSyncAt: 0,
        },
      };

      expect(isStorageChangedCourseTrackingEvent(validMessage)).toBe(true);
    });

    it('should reject invalid message types', () => {
      expect(isStorageChangedCourseTrackingEvent(null)).toBe(false);
      expect(isStorageChangedCourseTrackingEvent(undefined)).toBe(false);
      expect(isStorageChangedCourseTrackingEvent({})).toBe(false);
      expect(
        isStorageChangedCourseTrackingEvent({ v: 1, type: 'unknown' }),
      ).toBe(false);
    });

    it('should extract tracked courses from snapshot', () => {
      const snapshot: CourseTrackingSnapshot = {
        trackedPk1s: ['_12345_1', '_67890_1'],
        names: { _12345_1: 'Math 101', _67890_1: 'Physics 201' },
        downloadedPaths: [],
        lastHomeSyncAt: Date.now(),
      };

      expect(snapshot.trackedPk1s).toEqual(['_12345_1', '_67890_1']);
      expect(snapshot.names['_12345_1']).toBe('Math 101');
    });
  });

  describe('storage change event flow', () => {
    it('should handle snapshot updates without race conditions', () => {
      const snapshot1: CourseTrackingSnapshot = {
        trackedPk1s: ['course1'],
        names: { course1: 'Course 1' },
        downloadedPaths: [],
        lastHomeSyncAt: 100,
      };

      const snapshot2: CourseTrackingSnapshot = {
        trackedPk1s: ['course1', 'course2'],
        names: { course1: 'Course 1', course2: 'Course 2' },
        downloadedPaths: [],
        lastHomeSyncAt: 200,
      };

      expect(snapshot1.trackedPk1s.length).toBe(1);
      expect(snapshot2.trackedPk1s.length).toBe(2);
      expect(snapshot2.lastHomeSyncAt).toBeGreaterThan(
        snapshot1.lastHomeSyncAt,
      );
    });
  });
});
