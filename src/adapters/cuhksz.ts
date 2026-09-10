import type { Course, CourseContext } from '../core/types';
import { sanitizeSegment } from '../core/naming';

export const CUHKSZ_ORIGIN = 'https://bb.cuhk.edu.cn';
export const CUHKSZ_PERMISSION = `${CUHKSZ_ORIGIN}/*`;

export function matchesCuhksz(url: URL): boolean {
  return url.origin === CUHKSZ_ORIGIN;
}

/** Portal / Ultra home where the user picks courses, not a content list page. */
export function isBlackboardMainMenu(url: URL): boolean {
  if (!matchesCuhksz(url)) return false;
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

export function parseCourseContext(url: URL): CourseContext | null {
  if (!matchesCuhksz(url)) return null;

  const coursePk1 = url.searchParams.get('course_id');
  const contentPk1 = url.searchParams.get('content_id');
  if (!coursePk1 || !contentPk1) return null;

  return {
    origin: url.origin,
    coursePk1,
    contentPk1,
  };
}

export function courseFolderName(course: Course): string {
  return sanitizeSegment(course.name);
}
