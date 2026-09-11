import type { AttachmentFingerprint, ContentSnapshot } from './fingerprint';
import {
  buildFingerprintIndex,
  fingerprintKey,
  fingerprintsEqual,
} from './fingerprint';

/**
 * Phase 4: 下载历史追踪
 *
 * 记录已下载的文件及其指纹,用于增量同步判断。
 * 每个下载记录包含:
 * - 文件指纹 (用于变化检测)
 * - 目标路径 (用于重新下载时保持一致)
 * - 下载时间 (用于历史追溯)
 * - 状态 (成功/失败)
 */

/**
 * 单个文件的下载历史记录
 */
export interface DownloadHistoryRecord {
  /** 附件指纹 */
  fingerprint: AttachmentFingerprint;
  /** 下载到的目标路径 */
  targetPath: string;
  /** 下载完成时间 */
  completedAt: number;
  /** 是否成功 */
  success: boolean;
}

/**
 * 课程的完整下载历史
 * 按课程和内容区组织
 */
export interface CourseDownloadHistory {
  /** 课程 pk1 */
  coursePk1: string;
  /** 根内容项 pk1 */
  rootContentPk1: string;
  /** 下载记录列表 */
  records: DownloadHistoryRecord[];
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 下载历史的变化检测结果
 */
export interface DownloadDiff {
  /** 新增的附件 (从未下载过) */
  added: AttachmentFingerprint[];
  /** 修改的附件 (指纹变化) */
  modified: AttachmentFingerprint[];
  /** 删除的附件 (历史中有但当前快照中没有) */
  removed: AttachmentFingerprint[];
  /** 未变化的附件 */
  unchanged: AttachmentFingerprint[];
}

/**
 * 创建空的下载历史
 */
export function createEmptyHistory(
  coursePk1: string,
  rootContentPk1: string,
): CourseDownloadHistory {
  return {
    coursePk1,
    rootContentPk1,
    records: [],
    lastUpdated: Date.now(),
  };
}

/**
 * 添加下载记录到历史
 */
export function addDownloadRecord(
  history: CourseDownloadHistory,
  record: DownloadHistoryRecord,
): CourseDownloadHistory {
  // 使用新记录替换相同键的旧记录
  const key = fingerprintKey(record.fingerprint);
  const filtered = history.records.filter(
    (r) => fingerprintKey(r.fingerprint) !== key,
  );

  return {
    ...history,
    records: [...filtered, record],
    lastUpdated: Date.now(),
  };
}

/**
 * 批量添加下载记录
 */
export function addDownloadRecords(
  history: CourseDownloadHistory,
  records: DownloadHistoryRecord[],
): CourseDownloadHistory {
  let result = history;
  for (const record of records) {
    result = addDownloadRecord(result, record);
  }
  return result;
}

/**
 * 比较当前快照与历史,检测变化
 */
export function detectDownloadDiff(
  snapshot: ContentSnapshot,
  history: CourseDownloadHistory,
): DownloadDiff {
  const currentIndex = buildFingerprintIndex(snapshot.attachments);
  const historyIndex = buildFingerprintIndex(
    history.records.map((r) => r.fingerprint),
  );

  const added: AttachmentFingerprint[] = [];
  const modified: AttachmentFingerprint[] = [];
  const unchanged: AttachmentFingerprint[] = [];
  const removed: AttachmentFingerprint[] = [];

  // 检查当前快照中的每个附件
  for (const current of snapshot.attachments) {
    const key = fingerprintKey(current);
    const historical = historyIndex.get(key);

    if (!historical) {
      // 历史中不存在 -> 新增
      added.push(current);
    } else if (fingerprintsEqual(current, historical)) {
      // 指纹相同 -> 未变化
      unchanged.push(current);
    } else {
      // 指纹不同 -> 修改
      modified.push(current);
    }
  }

  // 检查历史中但当前快照中不存在的附件
  for (const historical of history.records.map((r) => r.fingerprint)) {
    const key = fingerprintKey(historical);
    if (!currentIndex.has(key)) {
      removed.push(historical);
    }
  }

  return { added, modified, removed, unchanged };
}

/**
 * 检查是否需要增量同步
 * 如果有新增或修改的内容,返回 true
 */
export function needsIncrementalSync(diff: DownloadDiff): boolean {
  return diff.added.length > 0 || diff.modified.length > 0;
}

/**
 * 获取需要下载的附件指纹列表
 * 包括新增和修改的附件
 */
export function getDownloadableFingerprints(
  diff: DownloadDiff,
): AttachmentFingerprint[] {
  return [...diff.added, ...diff.modified];
}

/**
 * 从历史记录中查找附件的上次下载路径
 */
export function findPreviousTargetPath(
  history: CourseDownloadHistory,
  fingerprint: AttachmentFingerprint,
): string | undefined {
  const key = fingerprintKey(fingerprint);
  const record = history.records.find(
    (r) => fingerprintKey(r.fingerprint) === key,
  );
  return record?.targetPath;
}

/**
 * 清理旧的下载记录
 * 保留最近 N 天或最近 M 条记录
 */
export function pruneHistory(
  history: CourseDownloadHistory,
  options: {
    maxRecords?: number;
    maxAgeDays?: number;
  } = {},
): CourseDownloadHistory {
  const { maxRecords = 1000, maxAgeDays = 90 } = options;
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  let records = history.records
    // 按时间倒序排列
    .sort((a, b) => b.completedAt - a.completedAt)
    // 只保留成功的记录或最近的失败记录
    .filter((r) => r.success || r.completedAt > cutoffTime)
    // 限制总数
    .slice(0, maxRecords);

  // 保持每个唯一键只有最新的一条记录
  const seenKeys = new Set<string>();
  records = records.filter((r) => {
    const key = fingerprintKey(r.fingerprint);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  return {
    ...history,
    records,
    lastUpdated: Date.now(),
  };
}
