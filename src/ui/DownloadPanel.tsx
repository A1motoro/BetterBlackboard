import { visibleDownloadError } from '../core/download-status';
import type { DownloadTask } from '../core/types';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

const STATUS_LABEL: Record<DownloadTask['status'], string> = {
  queued: '排队中',
  starting: '正在启动',
  in_progress: '下载中',
  complete: '已完成',
  interrupted: '下载失败',
  canceled: '已取消',
};

interface DownloadPanelProps {
  tasks: DownloadTask[];
  onCancel: (taskId: string) => void;
  onCancelAll: () => void;
  onRetry: (task: DownloadTask) => void;
  downloadRoot: string;
  onDownloadRootChange: (root: string) => void;
  onOpenChromeSettings: () => void;
}

export function DownloadPanel({
  tasks,
  onCancel,
  onCancelAll,
  onRetry,
  downloadRoot,
  onDownloadRootChange,
  onOpenChromeSettings,
}: DownloadPanelProps) {
  const hasCancellableTasks = tasks.some((task) =>
    ['queued', 'starting', 'in_progress'].includes(task.status),
  );

  return (
    <section className="shrink-0 border-t border-slate-200">
      <div className="space-y-3 px-4 py-3">
        {tasks.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                下载任务
              </h2>
              {hasCancellableTasks && (
                <button
                  type="button"
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  onClick={onCancelAll}
                >
                  停止全部下载
                </button>
              )}
            </div>
            <div className="max-h-48 space-y-2 overflow-auto">
              {tasks.map((task) => {
                const total = task.totalBytes ?? -1;
                const received = task.bytesReceived ?? 0;
                const progress =
                  total > 0 ? Math.min(100, (received / total) * 100) : null;
                const canCancel = [
                  'queued',
                  'starting',
                  'in_progress',
                ].includes(task.status);
                const error = visibleDownloadError(task);

                return (
                  <article
                    key={task.taskId}
                    className="rounded-lg bg-slate-50 p-2.5"
                  >
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-800">
                          {task.sourceFileName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {STATUS_LABEL[task.status]}
                          {total > 0 &&
                            ` · ${formatBytes(received)} / ${formatBytes(total)}`}
                        </p>
                      </div>
                      {canCancel && (
                        <button
                          type="button"
                          className="text-[11px] text-slate-500 hover:text-red-600"
                          onClick={() => onCancel(task.taskId)}
                        >
                          取消
                        </button>
                      )}
                      {task.status === 'interrupted' && (
                        <button
                          type="button"
                          className="text-[11px] text-indigo-600 hover:text-indigo-800"
                          onClick={() => onRetry(task)}
                        >
                          重试
                        </button>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full bg-indigo-600 ${
                          progress === null && task.status === 'in_progress'
                            ? 'animate-pulse'
                            : ''
                        }`}
                        style={{
                          width: `${progress ?? (task.status === 'complete' ? 100 : 35)}%`,
                        }}
                      />
                    </div>
                    {error && (
                      <p className="mt-1.5 break-words text-[11px] text-red-600">
                        {error}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-xs font-semibold text-slate-700">下载设置</h3>
          <p className="text-[11px] text-slate-600">
            文件保存在 Chrome 默认下载目录下的相对路径
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={downloadRoot}
              onChange={(e) => onDownloadRootChange(e.target.value)}
              placeholder="BB"
              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              onClick={onOpenChromeSettings}
            >
              更改 Chrome 下载目录
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            修改相对文件夹根目录（仅对新下载生效）
          </p>
        </div>
      </div>
    </section>
  );
}
