import { describe, expect, it } from 'vitest';
import { BlackboardClient } from '../src/infrastructure/blackboard/client';
import type { ApiTransport } from '../src/infrastructure/blackboard/transport';

class LoopingPaginatorTransport implements ApiTransport {
  readonly calls: string[] = [];

  constructor(private readonly responses: Record<string, unknown>) {}

  request<T>(path: string): Promise<T> {
    this.calls.push(path);
    if (!(path in this.responses)) {
      return Promise.reject(new Error(`缺少 fixture: ${path}`));
    }
    return Promise.resolve(this.responses[path] as T);
  }
}

describe('循环分页检测', () => {
  it('拒绝循环的 nextPage 链接', async () => {
    const root =
      '/learn/api/public/v1/courses/_1_1/contents/_root_1/children?fields=id,title,contentHandler,hasChildren';
    const page2 = `${root}&offset=10`;

    const transport = new LoopingPaginatorTransport({
      [root]: {
        results: [
          {
            id: '_item_1',
            title: 'Item 1',
            hasChildren: false,
            contentHandler: { id: 'resource/x-bb-file' },
          },
        ],
        paging: { nextPage: page2 },
      },
      [page2]: {
        results: [
          {
            id: '_item_2',
            title: 'Item 2',
            hasChildren: false,
            contentHandler: { id: 'resource/x-bb-file' },
          },
        ],
        // 循环回第一页,形成无限循环
        paging: { nextPage: root },
      },
      '/learn/api/public/v1/courses/_1_1/contents/_item_1/attachments': {
        results: [],
      },
      '/learn/api/public/v1/courses/_1_1/contents/_item_2/attachments': {
        results: [],
      },
    });

    await expect(
      new BlackboardClient(transport).loadCurrentContent('_1_1', '_root_1'),
    ).rejects.toThrow('循环分页');
  });

  it('阻止无限递归但保留同级重复节点', async () => {
    const root =
      '/learn/api/public/v1/courses/_1_1/contents/_root_1/children?fields=id,title,contentHandler,hasChildren';

    const transport = new LoopingPaginatorTransport({
      [root]: {
        results: [
          {
            id: '_dup_1',
            title: 'First',
            hasChildren: false,
            contentHandler: { id: 'resource/x-bb-file' },
          },
          {
            id: '_dup_1',
            title: 'Duplicate',
            hasChildren: false,
            contentHandler: { id: 'resource/x-bb-file' },
          },
        ],
      },
      '/learn/api/public/v1/courses/_1_1/contents/_dup_1/attachments': {
        results: [{ id: '_att_1', fileName: 'test.pdf' }],
      },
    });

    const nodes = await new BlackboardClient(transport).loadCurrentContent(
      '_1_1',
      '_root_1',
    );

    // API 在同一父节点下返回重复ID时,两个都被物化
    // visited 只防止递归时再次遍历相同ID,避免无限循环
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.pk1).toBe('_dup_1');
    expect(nodes[1]?.pk1).toBe('_dup_1');
    // 但第二次遇到同ID时,不会递归加载其 children
    expect(
      transport.calls.filter((c) => c.includes('_dup_1/children')),
    ).toEqual([]);
  });

  it('拒绝超过 2000 个节点的异常大树', async () => {
    const root =
      '/learn/api/public/v1/courses/_1_1/contents/_root_1/children?fields=id,title,contentHandler,hasChildren';

    // 构造一个分页返回大量节点的响应
    const hugeResults = Array.from({ length: 2_100 }, (_, i) => ({
      id: `_item_${i}_1`,
      title: `Item ${i}`,
      hasChildren: false,
      contentHandler: { id: 'resource/x-bb-file' },
    }));

    const responses: Record<string, unknown> = {
      [root]: {
        results: hugeResults,
      },
    };

    // 为每个节点提供空附件响应
    for (let i = 0; i < 2_100; i++) {
      responses[
        `/learn/api/public/v1/courses/_1_1/contents/_item_${i}_1/attachments`
      ] = { results: [] };
    }

    const transport = new LoopingPaginatorTransport(responses);

    await expect(
      new BlackboardClient(transport).loadCurrentContent('_1_1', '_root_1'),
    ).rejects.toThrow('2000');
  });
});

describe('空响应边界', () => {
  it('处理空的 results 数组', async () => {
    const root =
      '/learn/api/public/v1/courses/_1_1/contents/_root_1/children?fields=id,title,contentHandler,hasChildren';

    const transport = new LoopingPaginatorTransport({
      [root]: {
        results: [],
      },
    });

    const nodes = await new BlackboardClient(transport).loadCurrentContent(
      '_1_1',
      '_root_1',
    );

    expect(nodes).toEqual([]);
  });

  it('处理缺少 paging 字段的响应', async () => {
    const root =
      '/learn/api/public/v1/courses/_1_1/contents/_root_1/children?fields=id,title,contentHandler,hasChildren';

    const transport = new LoopingPaginatorTransport({
      [root]: {
        results: [
          {
            id: '_item_1',
            title: 'Single Item',
            hasChildren: false,
            contentHandler: { id: 'resource/x-bb-file' },
          },
        ],
        // 完全没有 paging 字段
      },
      '/learn/api/public/v1/courses/_1_1/contents/_item_1/attachments': {
        results: [],
      },
    });

    const nodes = await new BlackboardClient(transport).loadCurrentContent(
      '_1_1',
      '_root_1',
    );

    expect(nodes).toHaveLength(1);
  });

  it('处理 nextPage 为 null 或空字符串', async () => {
    const root =
      '/learn/api/public/v1/courses/_1_1/contents/_root_1/children?fields=id,title,contentHandler,hasChildren';

    const transport = new LoopingPaginatorTransport({
      [root]: {
        results: [
          {
            id: '_item_1',
            title: 'Item',
            hasChildren: false,
            contentHandler: { id: 'resource/x-bb-file' },
          },
        ],
        paging: { nextPage: null },
      },
      '/learn/api/public/v1/courses/_1_1/contents/_item_1/attachments': {
        results: [],
      },
    });

    const nodes = await new BlackboardClient(transport).loadCurrentContent(
      '_1_1',
      '_root_1',
    );

    expect(nodes).toHaveLength(1);
    expect(transport.calls.filter((path) => path.includes('children'))).toEqual(
      [root],
    );
  });
});
