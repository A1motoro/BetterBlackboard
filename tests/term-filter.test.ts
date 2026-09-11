import { describe, expect, it } from 'vitest';
import {
  filterCurrentTermCourses,
  groupCoursesByTerm,
  isCurrentTerm,
} from '../src/core/term-filter';
import type { Course } from '../src/core/types';

const BASE_COURSE: Course = {
  pk1: '_1_1',
  batchUid: 'TEST101',
  name: 'Test Course',
  ultraStatus: 'Classic',
};

describe('isCurrentTerm', () => {
  it('返回 true 当课程在时间范围内', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();
    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'Yes',
        duration: {
          start: '2026-09-01T00:00:00Z',
          end: '2026-12-31T23:59:59Z',
        },
      },
    };

    expect(isCurrentTerm(course, { referenceTime: now })).toBe(true);
  });

  it('返回 false 当课程已结束且超出宽容期', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();
    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'No',
        duration: {
          start: '2026-01-01T00:00:00Z',
          end: '2026-05-31T23:59:59Z',
        },
      },
    };

    expect(isCurrentTerm(course, { referenceTime: now })).toBe(false);
  });

  it('返回 true 当课程在结束宽容期内', () => {
    const courseEndTime = new Date('2026-05-31T23:59:59Z').getTime();
    // 课程结束后 5 天(默认宽容期 7 天)
    const now = courseEndTime + 5 * 24 * 60 * 60 * 1000;

    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'Yes',
        duration: {
          start: '2026-01-01T00:00:00Z',
          end: '2026-05-31T23:59:59Z',
        },
      },
    };

    expect(isCurrentTerm(course, { referenceTime: now })).toBe(true);
  });

  it('返回 false 当课程尚未开始且超出宽容期', () => {
    const now = new Date('2026-01-01T12:00:00Z').getTime();
    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'No',
        duration: {
          start: '2026-09-01T00:00:00Z',
          end: '2026-12-31T23:59:59Z',
        },
      },
    };

    expect(isCurrentTerm(course, { referenceTime: now })).toBe(false);
  });

  it('返回 true 当课程在开始宽容期内', () => {
    const courseStartTime = new Date('2026-09-01T00:00:00Z').getTime();
    // 课程开始前 5 天(默认宽容期 7 天)
    const now = courseStartTime - 5 * 24 * 60 * 60 * 1000;

    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'Yes',
        duration: {
          start: '2026-09-01T00:00:00Z',
          end: '2026-12-31T23:59:59Z',
        },
      },
    };

    expect(isCurrentTerm(course, { referenceTime: now })).toBe(true);
  });

  it('支持自定义宽容期', () => {
    const courseEndTime = new Date('2026-05-31T23:59:59Z').getTime();
    // 课程结束后 10 天
    const now = courseEndTime + 10 * 24 * 60 * 60 * 1000;

    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'Yes',
        duration: {
          end: '2026-05-31T23:59:59Z',
        },
      },
    };

    // 使用 7 天宽容期，应该返回 false
    expect(
      isCurrentTerm(course, {
        referenceTime: now,
        gracePeriodMs: 7 * 24 * 60 * 60 * 1000,
      }),
    ).toBe(false);

    // 使用 14 天宽容期，应该返回 true
    expect(
      isCurrentTerm(course, {
        referenceTime: now,
        gracePeriodMs: 14 * 24 * 60 * 60 * 1000,
      }),
    ).toBe(true);
  });

  it('返回 true 当没有 duration 但 available=Yes', () => {
    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'Yes',
      },
    };

    expect(isCurrentTerm(course)).toBe(true);
  });

  it('返回 false 当 available=No 且没有 duration', () => {
    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'No',
      },
    };

    expect(isCurrentTerm(course)).toBe(false);
  });

  it('返回 false 当 available=Disabled', () => {
    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'Disabled',
      },
    };

    expect(isCurrentTerm(course)).toBe(false);
  });

  it('返回 true 当没有 availability 信息(保守策略)', () => {
    const course: Course = {
      ...BASE_COURSE,
    };

    expect(isCurrentTerm(course)).toBe(true);
  });

  it('处理只有 start 时间的 duration', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();
    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'Yes',
        duration: {
          start: '2026-09-01T00:00:00Z',
        },
      },
    };

    // 已经开始的课程
    expect(isCurrentTerm(course, { referenceTime: now })).toBe(true);

    // 还未开始且超出宽容期
    const beforeStart = new Date('2026-08-01T12:00:00Z').getTime();
    expect(isCurrentTerm(course, { referenceTime: beforeStart })).toBe(false);
  });

  it('处理只有 end 时间的 duration', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();
    const course: Course = {
      ...BASE_COURSE,
      availability: {
        available: 'Yes',
        duration: {
          end: '2026-12-31T23:59:59Z',
        },
      },
    };

    // 还未结束的课程
    expect(isCurrentTerm(course, { referenceTime: now })).toBe(true);

    // 已经结束且超出宽容期
    const afterEnd = new Date('2027-02-01T12:00:00Z').getTime();
    expect(isCurrentTerm(course, { referenceTime: afterEnd })).toBe(false);
  });
});

describe('filterCurrentTermCourses', () => {
  it('过滤出当前学期的课程', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();

    const courses: Course[] = [
      {
        ...BASE_COURSE,
        pk1: '_1_1',
        name: 'Current Course',
        availability: {
          available: 'Yes',
          duration: {
            start: '2026-09-01T00:00:00Z',
            end: '2026-12-31T23:59:59Z',
          },
        },
      },
      {
        ...BASE_COURSE,
        pk1: '_2_1',
        name: 'Past Course',
        availability: {
          available: 'No',
          duration: {
            start: '2026-01-01T00:00:00Z',
            end: '2026-05-31T23:59:59Z',
          },
        },
      },
      {
        ...BASE_COURSE,
        pk1: '_3_1',
        name: 'Available Course',
        availability: {
          available: 'Yes',
        },
      },
      {
        ...BASE_COURSE,
        pk1: '_4_1',
        name: 'Future Course',
        availability: {
          available: 'No',
          duration: {
            start: '2027-01-01T00:00:00Z',
            end: '2027-05-31T23:59:59Z',
          },
        },
      },
    ];

    const result = filterCurrentTermCourses(courses, { referenceTime: now });

    expect(result.map((c) => c.name)).toEqual([
      'Current Course',
      'Available Course',
    ]);
  });

  it('包含没有 availability 信息的课程(保守策略)', () => {
    const courses: Course[] = [
      {
        ...BASE_COURSE,
        pk1: '_1_1',
        name: 'Course Without Availability',
      },
      {
        ...BASE_COURSE,
        pk1: '_2_1',
        name: 'Course With Availability',
        availability: {
          available: 'Yes',
        },
      },
    ];

    const result = filterCurrentTermCourses(courses);

    expect(result).toHaveLength(2);
  });
});

describe('groupCoursesByTerm', () => {
  it('按 termId 分组课程', () => {
    const courses: Course[] = [
      {
        ...BASE_COURSE,
        pk1: '_1_1',
        termId: '_2026_T1',
        name: 'Fall 2026 A',
      },
      {
        ...BASE_COURSE,
        pk1: '_2_1',
        termId: '_2026_T1',
        name: 'Fall 2026 B',
      },
      {
        ...BASE_COURSE,
        pk1: '_3_1',
        termId: '_2026_T2',
        name: 'Spring 2026',
      },
      {
        ...BASE_COURSE,
        pk1: '_4_1',
        name: 'No Term',
      },
    ];

    const groups = groupCoursesByTerm(courses);

    expect(groups.size).toBe(3);
    expect(groups.get('_2026_T1')?.map((c) => c.name)).toEqual([
      'Fall 2026 A',
      'Fall 2026 B',
    ]);
    expect(groups.get('_2026_T2')?.map((c) => c.name)).toEqual(['Spring 2026']);
    expect(groups.get('unknown')?.map((c) => c.name)).toEqual(['No Term']);
  });

  it('处理空课程列表', () => {
    const groups = groupCoursesByTerm([]);
    expect(groups.size).toBe(0);
  });

  it('所有课程都没有 termId', () => {
    const courses: Course[] = [
      { ...BASE_COURSE, pk1: '_1_1', name: 'A' },
      { ...BASE_COURSE, pk1: '_2_1', name: 'B' },
    ];

    const groups = groupCoursesByTerm(courses);

    expect(groups.size).toBe(1);
    expect(groups.get('unknown')?.map((c) => c.name)).toEqual(['A', 'B']);
  });
});
