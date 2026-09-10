import { describe, expect, it } from 'vitest';
import {
  applyChromeDownloadUpdate,
  chromeDownloadToStatus,
  visibleDownloadError,
} from '../src/core/download-status';
import type { DownloadTask } from '../src/core/types';

function task(status: DownloadTask['status'], error?: string): DownloadTask {
  return {
    origin: 'https://bb.cuhk.edu.cn',
    coursePk1: '_1_1',
    contentPk1: '_c_1',
    attachmentPk1: '_a_1',
    sourceFileName: 'Chapter 0 Introduction.pdf',
    targetPath: 'BB/PHY1001/Chapter 0 Introduction.pdf',
    taskId: 'task-1',
    status,
    createdAt: 1,
    updatedAt: 1,
    ...(error === undefined ? {} : { error }),
  };
}

describe('chromeDownloadToStatus', () => {
  it('把 USER_CANCELED 映射为已取消', () => {
    expect(chromeDownloadToStatus('interrupted', 'USER_CANCELED')).toBe(
      'canceled',
    );
  });

  it('把网络中断映射为失败', () => {
    expect(chromeDownloadToStatus('interrupted', 'NETWORK_FAILED')).toBe(
      'interrupted',
    );
  });
});

describe('applyChromeDownloadUpdate', () => {
  it('下载中的用户取消不会变成失败', () => {
    const result = applyChromeDownloadUpdate(task('in_progress'), {
      state: 'interrupted',
      error: 'USER_CANCELED',
    });

    expect(result.patch.status).toBe('canceled');
    expect(result.patch.error).toBeUndefined();
    expect(result.clearError).toBe(true);
    expect(result.releaseSlot).toBe(true);
  });

  it('已经标记取消后，忽略后续 USER_CANCELED', () => {
    const result = applyChromeDownloadUpdate(task('canceled'), {
      state: 'interrupted',
      error: 'USER_CANCELED',
    });

    expect(result.patch.status).toBeUndefined();
    expect(result.patch.error).toBeUndefined();
    expect(result.releaseSlot).toBe(false);
  });

  it('取消时若文件已经落盘，升级为完成', () => {
    const result = applyChromeDownloadUpdate(task('canceled'), {
      state: 'complete',
      bytesReceived: 280_678,
      totalBytes: 280_678,
    });

    expect(result.patch.status).toBe('complete');
    expect(result.clearError).toBe(true);
  });

  it('已完成的任务不会被中断事件回写成失败', () => {
    const result = applyChromeDownloadUpdate(task('complete'), {
      state: 'interrupted',
      error: 'USER_CANCELED',
    });

    expect(result.patch.status).toBeUndefined();
    expect(result.releaseSlot).toBe(false);
  });

  it('真正的下载失败仍是 interrupted 并可带错误', () => {
    const result = applyChromeDownloadUpdate(task('in_progress'), {
      state: 'interrupted',
      error: 'NETWORK_FAILED',
    });

    expect(result.patch.status).toBe('interrupted');
    expect(result.patch.error).toBe('NETWORK_FAILED');
    expect(result.releaseSlot).toBe(true);
  });
});

describe('visibleDownloadError', () => {
  it('取消不展示 Chrome 错误码', () => {
    expect(
      visibleDownloadError(task('canceled', 'USER_CANCELED')),
    ).toBeUndefined();
    expect(
      visibleDownloadError(task('interrupted', 'USER_CANCELED')),
    ).toBeUndefined();
  });

  it('失败仍展示错误', () => {
    expect(visibleDownloadError(task('interrupted', 'NETWORK_FAILED'))).toBe(
      'NETWORK_FAILED',
    );
  });
});
