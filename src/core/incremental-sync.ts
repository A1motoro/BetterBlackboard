import type {
  ContentNode,
  Course,
  CourseContext,
  DownloadTaskInput,
} from './types';
import type { HistoryStore } from '../infrastructure/history-store';
import {
  createContentSnapshot,
  type AttachmentFingerprint,
  type ContentSnapshot,
} from './fingerprint';
import {
  detectDownloadDiff,
  needsIncrementalSync,
  getDownloadableFingerprints,
  addDownloadRecords,
  pruneHistory,
  type CourseDownloadHistory,
  type DownloadDiff,
  type DownloadHistoryRecord,
} from './download-history';
import { createDiffPreview, type DiffPreview } from './diff-preview';
import { createDownloadPlan } from './download-plan';
import { fingerprintKey } from './fingerprint';

/**
 * Phase 4: 增量同步协调器
 *
 * 协调指纹计算、历史存储、差异检测和下载计划生成
 */

export interface IncrementalSyncOptions {
  /** 历史存储 */
  store: HistoryStore;
  /** 是否强制全量下载 (忽略历史) */
  forceFullSync?: boolean;
}

export interface IncrementalSyncResult {
  /** 内容快照 */
  snapshot: ContentSnapshot;
  /** 下载历史 */
  history: CourseDownloadHistory;
  /** 差异检测结果 */
  diff: DownloadDiff;
  /** 差异预览 */
  preview: DiffPreview;
  /** 是否需要下载 */
  needsDownload: boolean;
  /** 需要下载的指纹列表 */
  downloadableFingerprints: AttachmentFingerprint[];
}

/**
 * 执行增量同步分析
 */
export async function analyzeIncrementalSync(
  context: CourseContext,
  course: Course,
  nodes: ContentNode[],
  options: IncrementalSyncOptions,
): Promise<IncrementalSyncResult> {
  const { store, forceFullSync = false } = options;

  // 1. 创建当前内容快照
  const snapshot = createContentSnapshot(
    context.coursePk1,
    context.contentPk1,
    nodes,
  );

  // 2. 加载历史记录
  const history = await store.get(context.coursePk1, context.contentPk1);

  // 3. 检测差异
  const diff = forceFullSync
    ? {
        added: snapshot.attachments,
        modified: [],
        removed: [],
        unchanged: [],
      }
    : detectDownloadDiff(snapshot, history);

  // 4. 生成预览
  const preview = createDiffPreview(diff, nodes);

  // 5. 确定是否需要下载
  const needsDownload = forceFullSync || needsIncrementalSync(diff);

  // 6. 获取需要下载的指纹
  const downloadableFingerprints = getDownloadableFingerprints(diff);

  return {
    snapshot,
    history,
    diff,
    preview,
    needsDownload,
    downloadableFingerprints,
  };
}

/**
 * 创建增量下载计划
 * 只为需要下载的文件生成任务
 */
export function createIncrementalDownloadPlan(
  context: CourseContext,
  course: Course,
  nodes: ContentNode[],
  downloadableFingerprints: AttachmentFingerprint[],
  rootFolders: readonly string[] = [],
): DownloadTaskInput[] {
  // 构建需要下载的附件键集合
  const downloadableKeys = new Set(
    downloadableFingerprints.map((fp) => fingerprintKey(fp)),
  );

  // 生成下载计划,只包含需要下载的附件
  return createDownloadPlan(
    context,
    course,
    nodes,
    downloadableKeys,
    rootFolders,
  );
}

/**
 * 记录下载完成
 * 更新历史记录
 */
export async function recordDownloadCompletion(
  context: CourseContext,
  tasks: readonly DownloadTaskInput[],
  options: IncrementalSyncOptions,
): Promise<void> {
  const { store } = options;

  // 加载当前历史
  let history = await store.get(context.coursePk1, context.contentPk1);

  // 创建下载记录
  const now = Date.now();
  const records: DownloadHistoryRecord[] = [];

  for (const task of tasks) {
    const fp: AttachmentFingerprint = {
      attachmentPk1: String(task.attachmentPk1),
      contentPk1: String(task.contentPk1),
      fileName: String(task.sourceFileName),
      timestamp: now,
    };
    records.push({
      fingerprint: fp,
      targetPath: String(task.targetPath),
      completedAt: now,
      success: true,
    });
  }

  // 添加记录并清理旧记录
  history = addDownloadRecords(history, records);
  history = pruneHistory(history);

  // 保存更新后的历史
  await store.save(history);
}

/**
 * 清除指定课程和内容区的历史
 * 用于重置或强制全量下载
 */
export async function clearDownloadHistory(
  coursePk1: string,
  contentPk1: string,
  store: HistoryStore,
): Promise<void> {
  await store.delete(coursePk1, contentPk1);
}
