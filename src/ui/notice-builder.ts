import type { EnqueueResult } from '../infrastructure/messages';

export interface Notice {
  tone: 'info' | 'error';
  message: string;
}

/**
 * 为下载/同步结果生成通知对象
 *
 * 分级规则:
 * - rejected > 0 → error (安全策略拦截)
 * - 否则 → info (包括成功、重复、空结果等良性情况)
 */
export function buildEnqueueNotice(result: EnqueueResult): Notice {
  const parts: string[] = [];
  if (result.accepted > 0) parts.push(`已加入 ${result.accepted} 个文件`);
  if (result.duplicates > 0) parts.push(`${result.duplicates} 个已在队列中`);
  if (result.rejected > 0) parts.push(`${result.rejected} 个被安全策略拦截`);

  const hasError = result.rejected > 0;
  const message = parts.length > 0 ? parts.join('，') : '没有新的文件需要下载';

  return {
    tone: hasError ? 'error' : 'info',
    message,
  };
}
