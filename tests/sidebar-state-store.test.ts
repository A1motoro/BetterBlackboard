import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemorySidebarStateStore,
  type SidebarStateStore,
} from '../src/infrastructure/sidebar-state-store';

describe('sidebar-state-store', () => {
  let store: SidebarStateStore;

  beforeEach(() => {
    store = new MemorySidebarStateStore();
  });

  describe('getCollapsed', () => {
    it('should return false by default', async () => {
      const collapsed = await store.getCollapsed();
      expect(collapsed).toBe(false);
    });

    it('should return saved collapsed state', async () => {
      await store.setCollapsed(true);
      const collapsed = await store.getCollapsed();
      expect(collapsed).toBe(true);
    });
  });

  describe('setCollapsed', () => {
    it('should persist collapsed state as true', async () => {
      await store.setCollapsed(true);
      const collapsed = await store.getCollapsed();
      expect(collapsed).toBe(true);
    });

    it('should persist collapsed state as false', async () => {
      await store.setCollapsed(true);
      await store.setCollapsed(false);
      const collapsed = await store.getCollapsed();
      expect(collapsed).toBe(false);
    });

    it('should allow toggling multiple times', async () => {
      await store.setCollapsed(true);
      expect(await store.getCollapsed()).toBe(true);

      await store.setCollapsed(false);
      expect(await store.getCollapsed()).toBe(false);

      await store.setCollapsed(true);
      expect(await store.getCollapsed()).toBe(true);
    });
  });

  describe('restore race conditions', () => {
    it('should not clobber restored true with premature save of default false', async () => {
      await store.setCollapsed(true);
      expect(await store.getCollapsed()).toBe(true);

      const restoredValue = await store.getCollapsed();
      expect(restoredValue).toBe(true);
    });

    it('should preserve restored state across multiple reads', async () => {
      await store.setCollapsed(true);

      const read1 = await store.getCollapsed();
      const read2 = await store.getCollapsed();
      const read3 = await store.getCollapsed();

      expect(read1).toBe(true);
      expect(read2).toBe(true);
      expect(read3).toBe(true);
    });
  });

  describe('store identity', () => {
    it('should return consistent values when called multiple times', async () => {
      await store.setCollapsed(true);

      const results = await Promise.all([
        store.getCollapsed(),
        store.getCollapsed(),
        store.getCollapsed(),
      ]);

      expect(results).toEqual([true, true, true]);
    });

    it('should not lose state between sequential operations', async () => {
      await store.setCollapsed(true);
      expect(await store.getCollapsed()).toBe(true);

      await store.setCollapsed(false);
      expect(await store.getCollapsed()).toBe(false);

      await store.setCollapsed(true);
      expect(await store.getCollapsed()).toBe(true);
    });
  });
});
