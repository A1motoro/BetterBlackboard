import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistentDownloadQueue } from '../src/infrastructure/download-queue';
import type { CourseTrackingStore } from '../src/infrastructure/course-tracking';

// Mock the browser API
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  downloads: {
    download: vi.fn().mockResolvedValue(123),
    cancel: vi.fn().mockResolvedValue(undefined),
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
};

describe('PersistentDownloadQueue', () => {
  let queue: PersistentDownloadQueue;
  let mockTracking: Partial<CourseTrackingStore>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    mockTracking = {
      init: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockReturnValue(false),
      remember: vi.fn().mockResolvedValue(undefined),
    };

    queue = new PersistentDownloadQueue(mockTracking as CourseTrackingStore);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).browser = mockBrowser;
  });

  it('cancelAll should cancel all non-terminal tasks', async () => {
    await queue.init();

    // Enqueue a task
    const result = await queue.enqueue([
      {
        origin: 'https://bb.cuhk.edu.cn',
        coursePk1: '_1_1',
        contentPk1: '_c_1',
        attachmentPk1: '_a_1',
        sourceFileName: 'file1.pdf',
        targetPath: 'BB/Course/file1.pdf',
      },
    ]);

    // Verify task was accepted
    expect(result.accepted).toBeGreaterThan(0);
    const nonTerminalTasksCount = result.tasks.filter(
      (task) =>
        task.status === 'queued' ||
        task.status === 'starting' ||
        task.status === 'in_progress',
    ).length;
    expect(nonTerminalTasksCount).toBeGreaterThan(0);

    const cancelResult = await queue.cancelAll();

    // All non-terminal tasks should be canceled
    const canceledTasks = cancelResult.filter(
      (task) => task.status === 'canceled',
    );
    expect(canceledTasks.length).toBe(nonTerminalTasksCount);
  });

  it('cancelAll should return snapshot unchanged when no cancellable tasks', async () => {
    await queue.init();

    const result = await queue.cancelAll();

    expect(result).toEqual([]);
    expect(browser.downloads.cancel).not.toHaveBeenCalled();
  });
});
