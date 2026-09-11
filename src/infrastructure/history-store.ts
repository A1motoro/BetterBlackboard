import type { CourseDownloadHistory } from '../core/download-history';
import { createEmptyHistory } from '../core/download-history';

/**
 * Phase 4: 下载历史持久化存储
 *
 * 使用 chrome.storage.local 保存下载历史
 * 按课程 + 根内容项组织存储键,支持:
 * - 课程整体下载历史
 * - 特定内容区下载历史
 */

const HISTORY_KEY_PREFIX = 'bb_download_history:';

/**
 * 构建存储键
 */
function buildHistoryKey(coursePk1: string, rootContentPk1: string): string {
  return `${HISTORY_KEY_PREFIX}${coursePk1}:${rootContentPk1}`;
}

/**
 * 下载历史存储接口
 */
export interface HistoryStore {
  /**
   * 获取指定课程和内容区的下载历史
   * 如果不存在,返回空历史
   */
  get(
    coursePk1: string,
    rootContentPk1: string,
  ): Promise<CourseDownloadHistory>;

  /**
   * 保存下载历史
   */
  save(history: CourseDownloadHistory): Promise<void>;

  /**
   * 删除指定课程和内容区的历史
   */
  delete(coursePk1: string, rootContentPk1: string): Promise<void>;

  /**
   * 列出所有存储的历史键
   */
  listKeys(): Promise<string[]>;

  /**
   * 清空所有历史
   */
  clear(): Promise<void>;
}

/**
 * Chrome Storage 实现
 */
export class ChromeHistoryStore implements HistoryStore {
  async get(
    coursePk1: string,
    rootContentPk1: string,
  ): Promise<CourseDownloadHistory> {
    const key = buildHistoryKey(coursePk1, rootContentPk1);
    const result = await chrome.storage.local.get(key);
    const stored = result[key] as CourseDownloadHistory | undefined;

    if (!stored) {
      return createEmptyHistory(coursePk1, rootContentPk1);
    }

    return stored;
  }

  async save(history: CourseDownloadHistory): Promise<void> {
    const key = buildHistoryKey(history.coursePk1, history.rootContentPk1);
    await chrome.storage.local.set({ [key]: history });
  }

  async delete(coursePk1: string, rootContentPk1: string): Promise<void> {
    const key = buildHistoryKey(coursePk1, rootContentPk1);
    await chrome.storage.local.remove(key);
  }

  async listKeys(): Promise<string[]> {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all).filter((k) => k.startsWith(HISTORY_KEY_PREFIX));
  }

  async clear(): Promise<void> {
    const keys = await this.listKeys();
    await chrome.storage.local.remove(keys);
  }
}

/**
 * 内存实现 (用于测试)
 */
export class MemoryHistoryStore implements HistoryStore {
  private storage = new Map<string, CourseDownloadHistory>();

  get(
    coursePk1: string,
    rootContentPk1: string,
  ): Promise<CourseDownloadHistory> {
    const key = buildHistoryKey(coursePk1, rootContentPk1);
    const stored = this.storage.get(key);
    return Promise.resolve(
      stored ?? createEmptyHistory(coursePk1, rootContentPk1),
    );
  }

  save(history: CourseDownloadHistory): Promise<void> {
    const key = buildHistoryKey(history.coursePk1, history.rootContentPk1);
    this.storage.set(key, history);
    return Promise.resolve();
  }

  delete(coursePk1: string, rootContentPk1: string): Promise<void> {
    const key = buildHistoryKey(coursePk1, rootContentPk1);
    this.storage.delete(key);
    return Promise.resolve();
  }

  listKeys(): Promise<string[]> {
    return Promise.resolve(Array.from(this.storage.keys()));
  }

  clear(): Promise<void> {
    this.storage.clear();
    return Promise.resolve();
  }
}
