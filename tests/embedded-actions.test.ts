import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CourseContext } from '../src/core/types';
import type { BlackboardClient } from '../src/infrastructure/blackboard/client';
import { mountEmbeddedDownloadActions } from '../src/ui/embedded-actions';

const context: CourseContext = {
  origin: 'https://bb.cuhk.edu.cn',
  coursePk1: '_course_1',
  contentPk1: '_root_1',
};

function buttonLabels(): string[] {
  return [...document.querySelectorAll('[data-better-blackboard-action]')]
    .map(
      (element) =>
        element.shadowRoot?.querySelector('.label')?.textContent ??
        element.shadowRoot?.querySelector('button')?.textContent,
    )
    .filter((label): label is string => Boolean(label));
}

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
      loadAttachments: vi.fn().mockResolvedValue([]),
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

    expect(buttonLabels()).toEqual(['下载当前目录全部', '下载文件夹']);

    remove();
    expect(
      document.querySelectorAll('[data-better-blackboard-action]'),
    ).toHaveLength(0);
  });

  it('给含多个附件的内容项注入一次下载全部', () => {
    document.body.innerHTML = `
      <div id="content">
        <ul id="content_listContainer">
          <li id="contentListItem:_doc_1">
            <h3>Course Outline</h3>
            <div class="details">
              Attached Files:
              <a href="https://bb.cuhk.edu.cn/bbcswebdav/xid-1_1">glossary.pdf</a>
              <a href="https://bb.cuhk.edu.cn/bbcswebdav/xid-2_1">textbook.pdf</a>
              <a href="https://bb.cuhk.edu.cn/bbcswebdav/xid-3_1">syllabus.pdf</a>
            </div>
          </li>
          <li id="contentListItem:_single_1">
            <h3>One file</h3>
            <a href="https://bb.cuhk.edu.cn/bbcswebdav/xid-4_1">only.pdf</a>
          </li>
        </ul>
      </div>
    `;

    const client = {
      loadCurrentContent: vi.fn().mockResolvedValue([]),
      loadAttachments: vi.fn().mockResolvedValue([]),
    } as unknown as BlackboardClient;
    mountEmbeddedDownloadActions(
      context,
      client,
      Promise.resolve({
        pk1: '_course_1',
        batchUid: 'AIE2001',
        name: 'AIE2001',
        ultraStatus: 'Classic',
      }),
    );

    expect(buttonLabels()).toEqual(['下载当前目录全部', '下载全部附件']);
    expect(
      document
        .querySelector('[data-better-blackboard-action="attachments"]')
        ?.closest('h3')?.textContent,
    ).toContain('Course Outline');
  });
});
