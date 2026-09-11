import type { DiffPreview } from '../core/diff-preview';
import { formatPath, getChangeTypeLabel } from '../core/diff-preview';

interface DiffPreviewProps {
  preview: DiffPreview;
  onDownload: () => void;
  onCancel: () => void;
  onForceFullSync: () => void;
}

export function DiffPreviewComponent({
  preview,
  onDownload,
  onCancel,
  onForceFullSync,
}: DiffPreviewProps) {
  const { summary } = preview;

  if (summary.totalDownloadable === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">
          所有文件已是最新
        </h3>
        <p className="text-xs text-slate-600">
          与上次下载相比没有新增或修改的文件。
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="text-xs text-indigo-600 hover:text-indigo-800"
            onClick={onForceFullSync}
          >
            强制重新下载全部
          </button>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">
        发现 {summary.totalDownloadable} 个需要下载的文件
      </h3>

      <div className="mb-3 flex gap-4 text-xs text-slate-600">
        {summary.addedCount > 0 && (
          <span className="text-green-700">✓ 新增 {summary.addedCount} 个</span>
        )}
        {summary.modifiedCount > 0 && (
          <span className="text-amber-700">
            ⚠ 修改 {summary.modifiedCount} 个
          </span>
        )}
        {summary.unchangedCount > 0 && (
          <span className="text-slate-500">
            已同步 {summary.unchangedCount} 个
          </span>
        )}
      </div>

      <div className="max-h-48 space-y-1 overflow-auto rounded border border-slate-100 bg-slate-50 p-2">
        {preview.added.map((item, idx) => (
          <div
            key={`add-${idx}`}
            className="flex items-start gap-2 text-xs text-slate-700"
          >
            <span className="shrink-0 font-semibold text-green-700">
              {getChangeTypeLabel('added')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {item.fileName}
              </span>
              <span className="block truncate text-slate-500">
                {formatPath(item.path)}
              </span>
            </span>
          </div>
        ))}
        {preview.modified.map((item, idx) => (
          <div
            key={`mod-${idx}`}
            className="flex items-start gap-2 text-xs text-slate-700"
          >
            <span className="shrink-0 font-semibold text-amber-700">
              {getChangeTypeLabel('modified')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {item.fileName}
              </span>
              <span className="block truncate text-slate-500">
                {formatPath(item.path)}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-between gap-2">
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-700"
          onClick={onForceFullSync}
        >
          强制全量同步
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            onClick={onDownload}
          >
            下载变化的文件
          </button>
        </div>
      </div>
    </div>
  );
}
