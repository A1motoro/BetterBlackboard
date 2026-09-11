import type { ContentNode } from './types';
import type { AttachmentFingerprint } from './fingerprint';
import type { DownloadDiff } from './download-history';
import { fingerprintKey } from './fingerprint';

/**
 * Phase 4: 增量同步差异预览
 *
 * 为用户提供清晰的变化预览:
 * - 哪些文件是新的
 * - 哪些文件被修改了
 * - 哪些文件已删除
 * - 预计下载大小和文件数量
 */

/**
 * 差异预览条目
 * 包含足够的信息用于 UI 显示
 */
export interface DiffPreviewItem {
  /** 附件指纹 */
  fingerprint: AttachmentFingerprint;
  /** 变化类型 */
  changeType: 'added' | 'modified' | 'removed';
  /** 所属内容节点的标题路径 (面包屑) */
  path: string[];
  /** 文件名 */
  fileName: string;
}

/**
 * 完整的差异预览
 */
export interface DiffPreview {
  /** 新增的文件 */
  added: DiffPreviewItem[];
  /** 修改的文件 */
  modified: DiffPreviewItem[];
  /** 删除的文件 */
  removed: DiffPreviewItem[];
  /** 总计 */
  summary: {
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
    unchangedCount: number;
    totalDownloadable: number;
  };
}

/**
 * 构建内容树的路径索引
 * 用于快速查找附件所在的路径
 */
function buildPathIndex(
  nodes: ContentNode[],
  parentPath: string[] = [],
): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const node of nodes) {
    const currentPath = [...parentPath, node.title];

    // 为当前节点的所有附件记录路径
    for (const attachment of node.attachments) {
      const key = `${attachment.contentPk1}:${attachment.pk1}`;
      index.set(key, currentPath);
    }

    // 递归处理子节点
    const childIndex = buildPathIndex(node.children, currentPath);
    for (const [key, path] of childIndex) {
      index.set(key, path);
    }
  }

  return index;
}

/**
 * 创建差异预览项
 */
function createPreviewItem(
  fingerprint: AttachmentFingerprint,
  changeType: 'added' | 'modified' | 'removed',
  pathIndex: Map<string, string[]>,
): DiffPreviewItem {
  const key = fingerprintKey(fingerprint);
  const path = pathIndex.get(key) ?? ['未知位置'];

  return {
    fingerprint,
    changeType,
    path,
    fileName: fingerprint.fileName,
  };
}

/**
 * 从下载差异和内容树生成用户友好的预览
 */
export function createDiffPreview(
  diff: DownloadDiff,
  contentNodes: ContentNode[],
): DiffPreview {
  const pathIndex = buildPathIndex(contentNodes);

  const added = diff.added.map((fp) =>
    createPreviewItem(fp, 'added', pathIndex),
  );

  const modified = diff.modified.map((fp) =>
    createPreviewItem(fp, 'modified', pathIndex),
  );

  const removed = diff.removed.map((fp) =>
    createPreviewItem(fp, 'removed', pathIndex),
  );

  return {
    added,
    modified,
    removed,
    summary: {
      addedCount: diff.added.length,
      modifiedCount: diff.modified.length,
      removedCount: diff.removed.length,
      unchangedCount: diff.unchanged.length,
      totalDownloadable: diff.added.length + diff.modified.length,
    },
  };
}

/**
 * 格式化路径为可读字符串
 */
export function formatPath(path: string[]): string {
  return path.join(' / ');
}

/**
 * 获取变化类型的显示标签
 */
export function getChangeTypeLabel(
  changeType: 'added' | 'modified' | 'removed',
): string {
  switch (changeType) {
    case 'added':
      return '新增';
    case 'modified':
      return '已修改';
    case 'removed':
      return '已删除';
  }
}

/**
 * 过滤预览项 - 只保留需要下载的
 */
export function filterDownloadableItems(
  preview: DiffPreview,
): DiffPreviewItem[] {
  return [...preview.added, ...preview.modified];
}

/**
 * 按路径分组预览项
 * 用于在 UI 中按目录展示变化
 */
export function groupByPath(
  items: DiffPreviewItem[],
): Map<string, DiffPreviewItem[]> {
  const groups = new Map<string, DiffPreviewItem[]>();

  for (const item of items) {
    const pathKey = formatPath(item.path);
    const existing = groups.get(pathKey) ?? [];
    groups.set(pathKey, [...existing, item]);
  }

  return groups;
}
