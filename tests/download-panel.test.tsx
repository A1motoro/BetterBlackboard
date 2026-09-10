import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DownloadTask } from '../src/core/types';
import { DownloadPanel } from '../src/ui/DownloadPanel';

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
    bytesReceived: 280_678,
    totalBytes: 280_678,
    createdAt: 1,
    updatedAt: 1,
    ...(error === undefined ? {} : { error }),
  };
}

describe('DownloadPanel', () => {
  it('用户取消显示已取消，不出现失败或重试', () => {
    render(
      <DownloadPanel
        tasks={[task('canceled')]}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/已取消/)).toBeInTheDocument();
    expect(screen.queryByText(/下载失败/)).not.toBeInTheDocument();
    expect(screen.queryByText('重试')).not.toBeInTheDocument();
    expect(screen.queryByText('USER_CANCELED')).not.toBeInTheDocument();
  });

  it('真正失败才显示重试和错误', () => {
    render(
      <DownloadPanel
        tasks={[task('interrupted', 'NETWORK_FAILED')]}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/下载失败/)).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
    expect(screen.getByText('NETWORK_FAILED')).toBeInTheDocument();
  });
});
