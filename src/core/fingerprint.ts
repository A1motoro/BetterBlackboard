import type { Attachment, ContentNode } from './types';

/**
 * Phase 4: 增量同步的可靠指纹计算
 *
 * 根据 spec.md §12 要求,不能仅依赖未验证的 `modified` 字段。
 * 使用多因素组合生成防御性指纹:
 * - ID (pk1) - 内容项和附件的主键
 * - fileName - 文件名变化表示内容可能不同
 * - mimeType - MIME 类型变化表示文件类型改变
 * - 结构位置 - 父内容项变化可能需要重新下载
 *
 * 指纹设计原则:
 * 1. 防御性 - 宁可多下载也不漏下载
 * 2. 可比较 - 相同内容产生相同指纹
 * 3. 可序列化 - 可存储到 chrome.storage.local
 * 4. 稳定性 - 只有真实变化才改变指纹
 */

/**
 * 附件的内容指纹
 * 包含足够信息来判断是否需要重新下载
 */
export interface AttachmentFingerprint {
  /** 附件的 pk1 ID */
  attachmentPk1: string;
  /** 所属内容项的 pk1 ID */
  contentPk1: string;
  /** 文件名 */
  fileName: string;
  /** MIME 类型 (可选) */
  mimeType?: string;
  /** 指纹计算时间戳 */
  timestamp: number;
}

/**
 * 课程内容的完整指纹快照
 * 记录某个时间点的完整内容树状态
 */
export interface ContentSnapshot {
  /** 课程 pk1 */
  coursePk1: string;
  /** 根内容项 pk1 (当前内容区或整门课程) */
  rootContentPk1: string;
  /** 快照时间戳 */
  timestamp: number;
  /** 所有附件的指纹 */
  attachments: AttachmentFingerprint[];
}

/**
 * 为单个附件计算指纹
 */
export function computeAttachmentFingerprint(
  attachment: Attachment,
): AttachmentFingerprint {
  return {
    attachmentPk1: attachment.pk1,
    contentPk1: attachment.contentPk1,
    fileName: attachment.fileName,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    timestamp: Date.now(),
  };
}

/**
 * 为内容树中的所有附件计算指纹
 */
export function collectAttachmentFingerprints(
  nodes: ContentNode[],
): AttachmentFingerprint[] {
  const fingerprints: AttachmentFingerprint[] = [];

  const walk = (items: ContentNode[]): void => {
    for (const node of items) {
      for (const attachment of node.attachments) {
        fingerprints.push(computeAttachmentFingerprint(attachment));
      }
      walk(node.children);
    }
  };

  walk(nodes);
  return fingerprints;
}

/**
 * 创建内容快照
 */
export function createContentSnapshot(
  coursePk1: string,
  rootContentPk1: string,
  nodes: ContentNode[],
): ContentSnapshot {
  return {
    coursePk1,
    rootContentPk1,
    timestamp: Date.now(),
    attachments: collectAttachmentFingerprints(nodes),
  };
}

/**
 * 比较两个附件指纹是否相同
 * 只比较关键字段,不比较 timestamp
 */
export function fingerprintsEqual(
  a: AttachmentFingerprint,
  b: AttachmentFingerprint,
): boolean {
  return (
    a.attachmentPk1 === b.attachmentPk1 &&
    a.contentPk1 === b.contentPk1 &&
    a.fileName === b.fileName &&
    a.mimeType === b.mimeType
  );
}

/**
 * 构建指纹的唯一键
 * 用于快速查找和比较
 */
export function fingerprintKey(fp: AttachmentFingerprint): string {
  return `${fp.contentPk1}:${fp.attachmentPk1}`;
}

/**
 * 将指纹数组转换为 Map 以便快速查找
 */
export function buildFingerprintIndex(
  fingerprints: AttachmentFingerprint[],
): Map<string, AttachmentFingerprint> {
  return new Map(fingerprints.map((fp) => [fingerprintKey(fp), fp]));
}
