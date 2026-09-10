import type { Course } from './types';

export interface CourseMembershipRecord {
  coursePk1: string;
  batchUid: string;
  name: string;
  ultraStatus: string;
}

export interface CourseTrackingSnapshot {
  trackedPk1s: string[];
  names: Record<string, string>;
  downloadedPaths: string[];
  lastHomeSyncAt: number;
}

export const HOME_SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;

export function uniqueCourses(rows: CourseMembershipRecord[]): Course[] {
  const seen = new Set<string>();
  const courses: Course[] = [];

  for (const row of rows) {
    const pk1 = row.coursePk1.trim();
    if (!pk1 || seen.has(pk1)) continue;
    seen.add(pk1);
    courses.push({
      pk1,
      batchUid: row.batchUid,
      name: row.name.trim() || pk1,
      ultraStatus: row.ultraStatus || 'Unknown',
    });
  }

  return courses.sort((left, right) =>
    left.name.localeCompare(right.name, 'zh-Hans-CN'),
  );
}
