import { useEffect, useState } from 'react';
import { findAdapter } from '../../adapters/registry';
import type { SchoolAdapter } from '../../adapters/types';
import type { SerializedBbError } from '../../core/types';
import {
  requestId,
  type ExtensionResponse,
} from '../../infrastructure/messages';

interface ActiveTab {
  id: number;
  url: string;
  origin: string;
  adapter: SchoolAdapter;
}

export function Popup() {
  const [tab, setTab] = useState<ActiveTab | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('正在检查当前页面…');

  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(async ([active]) => {
        if (active?.id === undefined || !active.url) {
          setMessage('无法读取当前标签页');
          return;
        }

        let url: URL;
        try {
          url = new URL(active.url);
        } catch {
          setMessage('当前标签页不是网页');
          return;
        }

        const adapter = findAdapter(url);
        if (!adapter) {
          setMessage('此页面不是支持的 Blackboard 站点');
          return;
        }

        setTab({ id: active.id, url: active.url, origin: url.origin, adapter });
        const hasPermission = await browser.permissions.contains({
          origins: [`${adapter.origin}/*`],
        });
        setAuthorized(hasPermission);
        setMessage(
          hasPermission
            ? '站点已授权,课程内容页会自动打开侧栏'
            : `需要授权访问 ${adapter.displayName} Blackboard 站点`,
        );
      });
  }, []);

  const enable = async (): Promise<void> => {
    if (!tab) return;
    setBusy(true);
    try {
      const granted =
        authorized ||
        (await browser.permissions.request({
          origins: [`${tab.adapter.origin}/*`],
        }));
      if (!granted) {
        setMessage('未授予站点权限');
        return;
      }

      const response: ExtensionResponse<null> =
        await browser.runtime.sendMessage({
          v: 1,
          type: 'site.inject',
          requestId: requestId(),
          tabId: tab.id,
          origin: tab.origin,
        });
      if (!response.ok) throw new Error(response.error.message);

      setAuthorized(true);
      setMessage('侧栏已打开');
      window.setTimeout(() => window.close(), 350);
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : (error as SerializedBbError).message ?? '启用失败';
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="w-80 bg-white p-4 text-slate-900">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
          BB
        </div>
        <div>
          <h1 className="text-base font-semibold">Better Blackboard</h1>
          <p className="text-xs text-slate-500">批量下载课程附件</p>
        </div>
      </div>

      <p className="mb-4 rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-600">
        {message}
      </p>

      <button
        type="button"
        disabled={!tab || busy}
        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        onClick={enable}
      >
        {busy ? '正在打开…' : authorized ? '重新打开侧栏' : '授权并启用'}
      </button>

      <p className="mt-3 text-center text-[11px] leading-4 text-slate-400">
        文件和课程信息只在本机处理
      </p>
    </main>
  );
}
