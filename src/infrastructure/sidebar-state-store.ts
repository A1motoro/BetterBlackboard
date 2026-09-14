const SIDEBAR_COLLAPSED_KEY = 'bb_sidebar_collapsed';

export interface SidebarStateStore {
  getCollapsed(): Promise<boolean>;
  setCollapsed(collapsed: boolean): Promise<void>;
  onChanged(callback: (collapsed: boolean) => void): () => void;
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

  onChanged(callback: (collapsed: boolean) => void): () => void {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (!(SIDEBAR_COLLAPSED_KEY in changes)) return;
      const change = changes[SIDEBAR_COLLAPSED_KEY];
      if (typeof change.newValue === 'boolean') {
        callback(change.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
}

export class MemorySidebarStateStore implements SidebarStateStore {
  private collapsed: boolean = false;
  private listeners = new Set<(collapsed: boolean) => void>();

  getCollapsed(): Promise<boolean> {
    return Promise.resolve(this.collapsed);
  }

  setCollapsed(collapsed: boolean): Promise<void> {
    this.collapsed = collapsed;
    this.listeners.forEach((listener) => listener(collapsed));
    return Promise.resolve();
  }

  onChanged(callback: (collapsed: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}
