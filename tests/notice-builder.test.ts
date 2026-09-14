import { describe, expect, it } from 'vitest';
import { buildEnqueueNotice } from '../src/ui/notice-builder';
import type { EnqueueResult } from '../src/infrastructure/messages';

describe('buildEnqueueNotice', () => {
  it('返回 error 当有文件被拒绝', () => {
    const result: EnqueueResult = {
      tasks: [],
      accepted: 2,
      duplicates: 1,
      rejected: 1,
    };
    const notice = buildEnqueueNotice(result);
    expect(notice.tone).toBe('error');
    expect(notice.message).toBe(
      '已加入 2 个文件，1 个已在队列中，1 个被安全策略拦截',
    );
  });

  it('返回 error 当只有被拒绝的文件', () => {
    const result: EnqueueResult = {
      tasks: [],
      accepted: 0,
      duplicates: 0,
      rejected: 3,
    };
    const notice = buildEnqueueNotice(result);
    expect(notice.tone).toBe('error');
    expect(notice.message).toBe('3 个被安全策略拦截');
  });

  it('返回 info 当有文件被接受', () => {
    const result: EnqueueResult = {
      tasks: [],
      accepted: 5,
      duplicates: 0,
      rejected: 0,
    };
    const notice = buildEnqueueNotice(result);
    expect(notice.tone).toBe('info');
    expect(notice.message).toBe('已加入 5 个文件');
  });

  it('返回 info 当只有重复文件(无新文件)', () => {
    const result: EnqueueResult = {
      tasks: [],
      accepted: 0,
      duplicates: 3,
      rejected: 0,
    };
    const notice = buildEnqueueNotice(result);
    expect(notice.tone).toBe('info');
    expect(notice.message).toBe('3 个已在队列中');
  });

  it('返回 info 当没有任何文件(空结果)', () => {
    const result: EnqueueResult = {
      tasks: [],
      accepted: 0,
      duplicates: 0,
      rejected: 0,
    };
    const notice = buildEnqueueNotice(result);
    expect(notice.tone).toBe('info');
    expect(notice.message).toBe('没有新的文件需要下载');
  });

  it('返回 info 当有接受和重复', () => {
    const result: EnqueueResult = {
      tasks: [],
      accepted: 2,
      duplicates: 3,
      rejected: 0,
    };
    const notice = buildEnqueueNotice(result);
    expect(notice.tone).toBe('info');
    expect(notice.message).toBe('已加入 2 个文件，3 个已在队列中');
  });

  it('正确组合所有三种状态的消息', () => {
    const result: EnqueueResult = {
      tasks: [],
      accepted: 1,
      duplicates: 2,
      rejected: 3,
    };
    const notice = buildEnqueueNotice(result);
    expect(notice.tone).toBe('error');
    expect(notice.message).toBe(
      '已加入 1 个文件，2 个已在队列中，3 个被安全策略拦截',
    );
  });
});
