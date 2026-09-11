import type { SchoolAdapter, CourseContext } from './types';
import type { Course } from '../core/types';
import { sanitizeSegment } from '../core/naming';

/**
 * Adapter for The Chinese University of Hong Kong, Shenzhen.
 *
 * ## Verified Characteristics
 * - Blackboard Learn instance running "Classic" (Original) interface
 * - Standard REST API at /learn/api/public/v1
 * - Uses PK1 format for IDs (_17458_1)
 * - Attachment metadata complete (no HTML fallback needed in tested courses)
 * - Course content URLs follow /webapps/blackboard/content/listContent.jsp?course_id=...&content_id=...
 *
 * ## Known Limitations
 * - Only tested with Original experience; Ultra mode behavior unknown
 * - Only tested with course codes following PHY1001:Mechanics_L01 naming pattern
 * - Sample courses did not contain external links or LTI tools
 *
 * ## Permission Requirements
 * - optional_host_permissions: https://bb.cuhk.edu.cn/*
 */
export const cuhkszAdapter: SchoolAdapter = {
  id: 'cuhksz',
  displayName: 'CUHK(SZ)',
  origin: 'https://bb.cuhk.edu.cn',

  matches(url: URL): boolean {
    return url.origin === 'https://bb.cuhk.edu.cn';
  },

  apiBasePath: '/learn/api/public/v1',

  parseCourseContext(url: URL): CourseContext | null {
    const coursePk1 = url.searchParams.get('course_id');
    const contentPk1 = url.searchParams.get('content_id');
    if (!coursePk1 || !contentPk1) return null;

    return {
      origin: url.origin,
      coursePk1,
      contentPk1,
    };
  },

  courseFolderName(course: Course): string {
    return sanitizeSegment(course.name);
  },
};

/** Portal / Ultra home where the user picks courses, not a content list page. */
export function isBlackboardMainMenu(url: URL): boolean {
  if (!cuhkszAdapter.matches(url)) return false;
  const path = url.pathname;
  return (
    path.includes('/webapps/portal/') ||
    path === '/ultra' ||
    path === '/ultra/' ||
    path.startsWith('/ultra/institution-page') ||
    path.startsWith('/ultra/stream') ||
    path === '/ultra/course' ||
    path.startsWith('/ultra/course?')
  );
}

// Re-export for backward compatibility
export const CUHKSZ_ORIGIN = cuhkszAdapter.origin;
export const CUHKSZ_PERMISSION = `${cuhkszAdapter.origin}/*`;
export const matchesCuhksz = (url: URL): boolean => cuhkszAdapter.matches(url);
export const parseCourseContext = (url: URL): CourseContext | null =>
  cuhkszAdapter.parseCourseContext(url);
export const courseFolderName = (course: Course): string =>
  cuhkszAdapter.courseFolderName(course);
