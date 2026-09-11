import { describe, expect, it } from 'vitest';
import { cuhkszAdapter, isBlackboardMainMenu } from '../../src/adapters/cuhksz';
import type { Course } from '../../src/core/types';

describe('cuhkszAdapter', () => {
  describe('metadata', () => {
    it('有正确的 ID 和显示名', () => {
      expect(cuhkszAdapter.id).toBe('cuhksz');
      expect(cuhkszAdapter.displayName).toBe('CUHK(SZ)');
    });

    it('有正确的 origin', () => {
      expect(cuhkszAdapter.origin).toBe('https://bb.cuhk.edu.cn');
    });

    it('有正确的 API base path', () => {
      expect(cuhkszAdapter.apiBasePath).toBe('/learn/api/public/v1');
    });
  });

  describe('matches', () => {
    it('匹配 CUHK(SZ) origin', () => {
      const url = new URL('https://bb.cuhk.edu.cn/webapps/portal/');
      expect(cuhkszAdapter.matches(url)).toBe(true);
    });

    it('匹配任何 CUHK(SZ) 路径', () => {
      const paths = [
        '/webapps/blackboard/content/listContent.jsp',
        '/learn/api/public/v1/courses',
        '/ultra/courses/_123_1/outline',
      ];
      for (const path of paths) {
        const url = new URL(`https://bb.cuhk.edu.cn${path}`);
        expect(cuhkszAdapter.matches(url)).toBe(true);
      }
    });

    it('不匹配其他 origin', () => {
      const url = new URL('https://other.edu/path');
      expect(cuhkszAdapter.matches(url)).toBe(false);
    });

    it('不匹配 http', () => {
      const url = new URL('http://bb.cuhk.edu.cn/path');
      expect(cuhkszAdapter.matches(url)).toBe(false);
    });
  });

  describe('parseCourseContext', () => {
    it('解析标准课程内容页 URL', () => {
      const url = new URL(
        'https://bb.cuhk.edu.cn/webapps/blackboard/content/listContent.jsp?course_id=_17458_1&content_id=_656083_1',
      );
      const context = cuhkszAdapter.parseCourseContext(url);
      expect(context).toEqual({
        origin: 'https://bb.cuhk.edu.cn',
        coursePk1: '_17458_1',
        contentPk1: '_656083_1',
      });
    });

    it('解析带额外参数的 URL', () => {
      const url = new URL(
        'https://bb.cuhk.edu.cn/webapps/blackboard/content/listContent.jsp?course_id=_123_1&content_id=_456_1&mode=view',
      );
      const context = cuhkszAdapter.parseCourseContext(url);
      expect(context).toEqual({
        origin: 'https://bb.cuhk.edu.cn',
        coursePk1: '_123_1',
        contentPk1: '_456_1',
      });
    });

    it('缺少 course_id 返回 null', () => {
      const url = new URL(
        'https://bb.cuhk.edu.cn/webapps/blackboard/content/listContent.jsp?content_id=_456_1',
      );
      expect(cuhkszAdapter.parseCourseContext(url)).toBeNull();
    });

    it('缺少 content_id 返回 null', () => {
      const url = new URL(
        'https://bb.cuhk.edu.cn/webapps/blackboard/content/listContent.jsp?course_id=_123_1',
      );
      expect(cuhkszAdapter.parseCourseContext(url)).toBeNull();
    });

    it('主页返回 null', () => {
      const url = new URL(
        'https://bb.cuhk.edu.cn/webapps/portal/execute/tabs/tabAction',
      );
      expect(cuhkszAdapter.parseCourseContext(url)).toBeNull();
    });

    it('非 CUHK(SZ) URL 返回 null', () => {
      const url = new URL('https://other.edu/courses?course_id=123');
      expect(cuhkszAdapter.parseCourseContext(url)).toBeNull();
    });
  });

  describe('courseFolderName', () => {
    it('使用课程名称生成文件夹', () => {
      const course: Course = {
        pk1: '_17458_1',
        batchUid: 'PHY100126103015',
        name: 'PHY1001:Mechanics_L01',
        ultraStatus: 'Classic',
      };
      const folderName = cuhkszAdapter.courseFolderName(course);
      expect(folderName).toBe('PHY1001_Mechanics_L01');
    });

    it('替换特殊字符', () => {
      const course: Course = {
        pk1: '_1_1',
        batchUid: 'TEST',
        name: 'Test/Course:Name*With?Special<Chars>',
        ultraStatus: 'Classic',
      };
      const folderName = cuhkszAdapter.courseFolderName(course);
      expect(folderName).not.toContain('/');
      expect(folderName).not.toContain(':');
      expect(folderName).not.toContain('*');
      expect(folderName).not.toContain('?');
      expect(folderName).not.toContain('<');
      expect(folderName).not.toContain('>');
    });

    it('处理中文课程名', () => {
      const course: Course = {
        pk1: '_1_1',
        batchUid: 'CHN101',
        name: 'CHN101:中国文学',
        ultraStatus: 'Classic',
      };
      const folderName = cuhkszAdapter.courseFolderName(course);
      expect(folderName).toContain('中国文学');
    });

    it('处理超长课程名', () => {
      const course: Course = {
        pk1: '_1_1',
        batchUid: 'LONG',
        name: 'A'.repeat(300),
        ultraStatus: 'Classic',
      };
      const folderName = cuhkszAdapter.courseFolderName(course);
      expect(folderName.length).toBeLessThanOrEqual(255);
    });
  });

  describe('isBlackboardMainMenu', () => {
    it('识别 Classic portal 主页', () => {
      const url = new URL(
        'https://bb.cuhk.edu.cn/webapps/portal/execute/tabs/tabAction',
      );
      expect(isBlackboardMainMenu(url)).toBe(true);
    });

    it('识别 Ultra 主页', () => {
      const urls = [
        'https://bb.cuhk.edu.cn/ultra',
        'https://bb.cuhk.edu.cn/ultra/',
        'https://bb.cuhk.edu.cn/ultra/institution-page',
        'https://bb.cuhk.edu.cn/ultra/stream',
      ];
      for (const urlStr of urls) {
        expect(isBlackboardMainMenu(new URL(urlStr))).toBe(true);
      }
    });

    it('识别 Ultra 课程列表页', () => {
      const url = new URL('https://bb.cuhk.edu.cn/ultra/course');
      expect(isBlackboardMainMenu(url)).toBe(true);
    });

    it('课程内容页不是主页', () => {
      const url = new URL(
        'https://bb.cuhk.edu.cn/webapps/blackboard/content/listContent.jsp?course_id=_123_1&content_id=_456_1',
      );
      expect(isBlackboardMainMenu(url)).toBe(false);
    });

    it('非 CUHK(SZ) URL 不是主页', () => {
      const url = new URL('https://other.edu/webapps/portal/');
      expect(isBlackboardMainMenu(url)).toBe(false);
    });
  });

  describe('extractFallbackResources', () => {
    it('未实现 fallback 提取', () => {
      expect('extractFallbackResources' in cuhkszAdapter).toBe(false);
    });
  });
});
