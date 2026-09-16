import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DownloadTask } from '../src/core/types';
import { DownloadPanel } from '../src/ui/DownloadPanel';

afterEach(() => {
  cleanup();
});

function task(
  status: DownloadTask['status'],
  error?: string,
  id = 'task-1',
  batchId = 1,
): DownloadTask {
  return {
    origin: 'https://bb.cuhk.edu.cn',
    coursePk1: '_1_1',
    contentPk1: '_c_1',
    attachmentPk1: '_a_1',
    sourceFileName: 'Chapter 0 Introduction.pdf',
    targetPath: 'BB/PHY1001/Chapter 0 Introduction.pdf',
    taskId: id,
    status,
    bytesReceived: 280_678,
    totalBytes: 280_678,
    createdAt: 1,
    updatedAt: 1,
    batchId,
    ...(error === undefined ? {} : { error }),
  };
}

describe('DownloadPanel', () => {
  it('用户取消不显示在任务区域', () => {
    render(
      <DownloadPanel
        tasks={[task('canceled')]}
        onCancelAll={vi.fn()}
        onRetry={vi.fn()}
        downloadRoot="BB"
        onDownloadRootChange={vi.fn()}
        onDownloadRootCommit={vi.fn()}
        onOpenChromeSettings={vi.fn()}
        sidebarLayout="rail"
        onSidebarLayoutChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('下载任务')).not.toBeInTheDocument();
    expect(screen.queryByText('重试')).not.toBeInTheDocument();
    expect(screen.queryByText('USER_CANCELED')).not.toBeInTheDocument();
  });

  it('真正失败才显示重试和错误', () => {
    render(
      <DownloadPanel
        tasks={[task('interrupted', 'NETWORK_FAILED')]}
        onCancelAll={vi.fn()}
        onRetry={vi.fn()}
        downloadRoot="BB"
        onDownloadRootChange={vi.fn()}
        onDownloadRootCommit={vi.fn()}
        onOpenChromeSettings={vi.fn()}
        sidebarLayout="rail"
        onSidebarLayoutChange={vi.fn()}
      />,
    );

    expect(screen.getByText('下载任务')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
    expect(screen.getByText('NETWORK_FAILED')).toBeInTheDocument();
    expect(screen.getByText('Chapter 0 Introduction.pdf')).toBeInTheDocument();
  });

  it('批量下载显示文件计数进度', () => {
    render(
      <DownloadPanel
        tasks={[
          task('complete', undefined, 'task-1', 100),
          task('complete', undefined, 'task-2', 100),
          task('complete', undefined, 'task-3', 100),
          task('in_progress', undefined, 'task-4', 100),
          task('queued', undefined, 'task-5', 100),
        ]}
        onCancelAll={vi.fn()}
        onRetry={vi.fn()}
        downloadRoot="BB"
        onDownloadRootChange={vi.fn()}
        onDownloadRootCommit={vi.fn()}
        onOpenChromeSettings={vi.fn()}
        sidebarLayout="rail"
        onSidebarLayoutChange={vi.fn()}
      />,
    );

    expect(screen.getByText('下载任务')).toBeInTheDocument();
    expect(screen.getByText(/已完成 3\/5 · 60%/)).toBeInTheDocument();
    expect(screen.getByText('停止全部下载')).toBeInTheDocument();
  });

  it('所有完成且无失败不显示任务区域', () => {
    render(
      <DownloadPanel
        tasks={[
          task('complete', undefined, 'task-1'),
          task('complete', undefined, 'task-2'),
        ]}
        onCancelAll={vi.fn()}
        onRetry={vi.fn()}
        downloadRoot="BB"
        onDownloadRootChange={vi.fn()}
        onDownloadRootCommit={vi.fn()}
        onOpenChromeSettings={vi.fn()}
        sidebarLayout="rail"
        onSidebarLayoutChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('下载任务')).not.toBeInTheDocument();
  });

  it('有失败时显示失败列表', () => {
    const task2 = {
      ...task('interrupted', 'NETWORK_FAILED', 'task-2'),
      sourceFileName: 'Document1.pdf',
    };
    const task3 = {
      ...task('interrupted', 'SERVER_UNREACHABLE', 'task-3'),
      sourceFileName: 'Document2.pdf',
    };
    render(
      <DownloadPanel
        tasks={[task('complete', undefined, 'task-1'), task2, task3]}
        onCancelAll={vi.fn()}
        onRetry={vi.fn()}
        downloadRoot="BB"
        onDownloadRootChange={vi.fn()}
        onDownloadRootCommit={vi.fn()}
        onOpenChromeSettings={vi.fn()}
        sidebarLayout="rail"
        onSidebarLayoutChange={vi.fn()}
      />,
    );

    expect(screen.getByText('下载任务')).toBeInTheDocument();
    expect(screen.getByText('NETWORK_FAILED')).toBeInTheDocument();
    expect(screen.getByText('SERVER_UNREACHABLE')).toBeInTheDocument();
    expect(screen.getByText('Document1.pdf')).toBeInTheDocument();
    expect(screen.getByText('Document2.pdf')).toBeInTheDocument();
    const retryButtons = screen.getAllByText('重试');
    expect(retryButtons).toHaveLength(2);
  });

  it('只显示最新批次的进度，忽略旧批次', () => {
    render(
      <DownloadPanel
        tasks={[
          task('complete', undefined, 'old-1', 50),
          task('complete', undefined, 'old-2', 50),
          task('complete', undefined, 'new-1', 100),
          task('complete', undefined, 'new-2', 100),
          task('in_progress', undefined, 'new-3', 100),
        ]}
        onCancelAll={vi.fn()}
        onRetry={vi.fn()}
        downloadRoot="BB"
        onDownloadRootChange={vi.fn()}
        onDownloadRootCommit={vi.fn()}
        onOpenChromeSettings={vi.fn()}
        sidebarLayout="rail"
        onSidebarLayoutChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/已完成 2\/3 · 67%/)).toBeInTheDocument();
  });

  it('重试后保留原批次，同批失败仍可见', () => {
    const batchId = 100;
    const task1 = {
      ...task('interrupted', 'NETWORK_FAILED', 'task-1', batchId),
      sourceFileName: 'File1.pdf',
    };
    const task2 = {
      ...task('interrupted', 'SERVER_ERROR', 'task-2', batchId),
      sourceFileName: 'File2.pdf',
    };
    const task3 = {
      ...task('queued', undefined, 'task-3-retry', batchId),
      sourceFileName: 'File1.pdf',
    };

    render(
      <DownloadPanel
        tasks={[task1, task2, task3]}
        onCancelAll={vi.fn()}
        onRetry={vi.fn()}
        downloadRoot="BB"
        onDownloadRootChange={vi.fn()}
        onDownloadRootCommit={vi.fn()}
        onOpenChromeSettings={vi.fn()}
        sidebarLayout="rail"
        onSidebarLayoutChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/已完成 0\/3 · 0%/)).toBeInTheDocument();
    expect(screen.getByText('File1.pdf')).toBeInTheDocument();
    expect(screen.getByText('File2.pdf')).toBeInTheDocument();
    const retryButtons = screen.getAllByText('重试');
    expect(retryButtons).toHaveLength(2);
  });
});
