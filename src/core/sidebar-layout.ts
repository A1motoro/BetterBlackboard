export type SidebarLayout = 'rail' | 'floating';

const SIDEBAR_LAYOUT_STORAGE_KEY = 'bb_sidebar_layout';
const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = 'rail';

export async function getSidebarLayout(): Promise<SidebarLayout> {
  const result = await browser.storage.local.get(SIDEBAR_LAYOUT_STORAGE_KEY);
  const value = result[SIDEBAR_LAYOUT_STORAGE_KEY];
  return value === 'rail' || value === 'floating'
    ? value
    : DEFAULT_SIDEBAR_LAYOUT;
}

export async function setSidebarLayout(layout: SidebarLayout): Promise<void> {
  await browser.storage.local.set({ [SIDEBAR_LAYOUT_STORAGE_KEY]: layout });
}

export function getSidebarStyles(layout: SidebarLayout): {
  asideClassName: string;
  pageInset: string;
} {
  if (layout === 'floating') {
    return {
      asideClassName:
        'fixed top-4 right-4 flex h-[calc(100vh-2rem)] w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl',
      pageInset: '412px',
    };
  }
  return {
    asideClassName:
      'fixed inset-y-0 right-0 flex h-full w-[380px] flex-col overflow-hidden rounded-none border-l border-slate-200 bg-white text-slate-900 shadow-[-8px_0_24px_rgba(0,0,0,0.08)]',
    pageInset: '380px',
  };
}
