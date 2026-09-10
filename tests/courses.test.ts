import { describe, expect, it } from 'vitest';
import {
  isBlackboardMainMenu,
  parseCourseContext,
} from '../src/adapters/cuhksz';
import { uniqueCourses } from '../src/core/courses';
import { excludeKnownPaths } from '../src/core/download-plan';
import type { DownloadTaskInput } from '../src/core/types';

describe('isBlackboardMainMenu', () => {
  it('识别 CUHK(SZ) 门户主菜单', () => {
    expect(
      isBlackboardMainMenu(
        new URL(
          'https://bb.cuhk.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1',
        ),
      ),
    ).toBe(true);
    expect(
      isBlackboardMainMenu(
        new URL(
          'https://bb.cuhk.edu.cn/webapps/blackboard/content/listContent.jsp?course_id=_1_1&content_id=_2_1',
        ),
      ),
    ).toBe(false);
  });
});

describe('parseCourseContext', () => {
  it('只从内容列表页解析课程上下文', () => {
    expect(
      parseCourseContext(
        new URL(
          'https://bb.cuhk.edu.cn/webapps/blackboard/content/listContent.jsp?course_id=_1_1&content_id=_2_1',
        ),
      ),
    ).toEqual({
      origin: 'https://bb.cuhk.edu.cn',
      coursePk1: '_1_1',
      contentPk1: '_2_1',
    });
  });
});

describe('uniqueCourses', () => {
  it('按课程主键去重并按名称排序', () => {
    expect(
      uniqueCourses([
        {
          coursePk1: '_2_1',
          batchUid: 'B',
          name: 'PHY1001',
          ultraStatus: 'Classic',
        },
        {
          coursePk1: '_2_1',
          batchUid: 'B',
          name: 'PHY1001',
          ultraStatus: 'Classic',
        },
        {
          coursePk1: '_1_1',
          batchUid: 'A',
          name: 'AIE2001',
          ultraStatus: 'Classic',
        },
      ]).map((course) => course.pk1),
    ).toEqual(['_1_1', '_2_1']);
  });
});

describe('excludeKnownPaths', () => {
  it('跳过已经下载过的相同路径', () => {
    const tasks: DownloadTaskInput[] = [
      {
        origin: 'https://bb.cuhk.edu.cn',
        coursePk1: '_1_1',
        contentPk1: '_c_1',
        attachmentPk1: '_a_1',
        sourceFileName: 'a.pdf',
        targetPath: 'BB/PHY1001/a.pdf',
      },
      {
        origin: 'https://bb.cuhk.edu.cn',
        coursePk1: '_1_1',
        contentPk1: '_c_2',
        attachmentPk1: '_a_2',
        sourceFileName: 'b.pdf',
        targetPath: 'BB/PHY1001/b.pdf',
      },
    ];
    expect(
      excludeKnownPaths(tasks, new Set(['BB/PHY1001/a.pdf'])).map(
        (task) => task.sourceFileName,
      ),
    ).toEqual(['b.pdf']);
  });
});
