import type { Course, CourseContext } from '../core/types';
import { sanitizeSegment } from '../core/naming';

export const CUHKSZ_ORIGIN = 'https://bb.cuhk.edu.cn';
export const CUHKSZ_PERMISSION = `${CUHKSZ_ORIGIN}/*`;

export function matchesCuhksz(url: URL): boolean {
  return url.origin === CUHKSZ_ORIGIN;
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
