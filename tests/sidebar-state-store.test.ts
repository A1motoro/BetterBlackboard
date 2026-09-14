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
});
