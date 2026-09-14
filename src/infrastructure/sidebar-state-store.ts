const SIDEBAR_COLLAPSED_KEY = 'bb_sidebar_collapsed';

export interface SidebarStateStore {
  getCollapsed(): Promise<boolean>;
  setCollapsed(collapsed: boolean): Promise<void>;
}

export class ChromeSidebarStateStore implements SidebarStateStore {
  async getCollapsed(): Promise<boolean> {
    const result = await chrome.storage.local.get(SIDEBAR_COLLAPSED_KEY);
    const value = result[SIDEBAR_COLLAPSED_KEY];
    if (typeof value === 'boolean') {
      return value;
    }
    return false;
  }

  async setCollapsed(collapsed: boolean): Promise<void> {
    await chrome.storage.local.set({ [SIDEBAR_COLLAPSED_KEY]: collapsed });
  }
}

export class MemorySidebarStateStore implements SidebarStateStore {
  private collapsed: boolean = false;

  getCollapsed(): Promise<boolean> {
    return Promise.resolve(this.collapsed);
  }

  setCollapsed(collapsed: boolean): Promise<void> {
    this.collapsed = collapsed;
    return Promise.resolve();
  }
}
