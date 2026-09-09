import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CourseContext } from '../src/core/types';
import type { BlackboardClient } from '../src/infrastructure/blackboard/client';
import { mountEmbeddedDownloadActions } from '../src/ui/embedded-actions';

const context: CourseContext = {
  origin: 'https://bb.cuhk.edu.cn',
  coursePk1: '_course_1',
  contentPk1: '_root_1',
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('embedded download actions', () => {
  it('在根内容区和文件夹标题后注入下载按钮', () => {
    document.body.innerHTML = `
      <div id="content">
        <ul id="content_listContainer">
          <li>
            <a href="https://bb.cuhk.edu.cn/webapps/blackboard/content/listContent.jsp?course_id=_course_1&content_id=_folder_1">
              Lecture Notes
            </a>
          </li>
        </ul>
      </div>
    `;

    const client = {
      loadCurrentContent: vi.fn().mockResolvedValue([]),
    } as unknown as BlackboardClient;
    const remove = mountEmbeddedDownloadActions(
      context,
      client,
      Promise.resolve({
        pk1: '_course_1',
        batchUid: 'PHY1001',
        name: 'PHY1001:Mechanics',
        ultraStatus: 'Classic',
      }),
    );

    const actions = document.querySelectorAll(
      '[data-better-blackboard-action]',
    );
    expect(actions).toHaveLength(3);
    expect(
      [...actions]
        .map(
          (element) => element.shadowRoot?.querySelector('button')?.textContent,
        )
        .filter(Boolean),
    ).toEqual(['下载当前目录全部', '下载文件夹']);

    remove();
    expect(
      document.querySelectorAll('[data-better-blackboard-action]'),
    ).toHaveLength(0);
  });
});
