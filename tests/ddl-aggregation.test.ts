import { describe, expect, it, vi } from 'vitest';
import type { CalendarItem, CalendarItemType, Course } from '../src/core/types';
import {
  aggregateDDL,
  calendarItemToAssignment,
  createTimeRange,
  formatDueDate,
  groupByTimeframe,
  isAssignmentType,
  isOverdue,
  SUPPORTED_ASSIGNMENT_TYPES,
} from '../src/core/ddl-aggregation';

describe('createTimeRange', () => {
  it('默认返回未来4周的时间范围', () => {
    const range = createTimeRange();
    const since = new Date(range.since);
    const until = new Date(range.until);
    const now = new Date();

    const daysDiff = Math.floor(
      (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24),
    );

    expect(daysDiff).toBe(28);
    expect(since.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(until.getTime()).toBeGreaterThan(now.getTime());
  });

  it('支持自定义未来周数', () => {
    const range = createTimeRange({ weeksAhead: 8 });
    const since = new Date(range.since);
    const until = new Date(range.until);

    const daysDiff = Math.floor(
      (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24),
    );

    expect(daysDiff).toBe(56);
  });

  it('支持包含过去的周数', () => {
    const range = createTimeRange({ weeksAhead: 4, includeWeeksPast: 2 });
    const since = new Date(range.since);
    const until = new Date(range.until);

    const daysDiff = Math.floor(
      (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24),
    );

    expect(daysDiff).toBe(42);
  });

  it('限制最大未来周数为16周', () => {
    const range = createTimeRange({ weeksAhead: 20 });
    const since = new Date(range.since);
    const until = new Date(range.until);

    const daysDiff = Math.floor(
      (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24),
    );

    expect(daysDiff).toBe(112);
  });

  it('返回ISO-8601格式的日期字符串', () => {
    const range = createTimeRange();

    expect(range.since).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(range.until).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

describe('calendarItemToAssignment', () => {
  it('将GradebookColumn CalendarItem转换为Assignment', () => {
    const item: CalendarItem = {
      id: '_120127_1',
      type: 'GradebookColumn',
      calendarId: '_12594_1',
      title: 'Assignment 1',
      start: '2026-10-15T04:00:00.000Z',
      end: '2026-10-15T04:00:00.000Z',
      dynamicCalendarItemProps: {
        attemptable: true,
        categoryId: '_172683_1',
        eventType: 'Test',
        gradable: true,
      },
    };

    const assignment = calendarItemToAssignment(item, 'Test Course');

    expect(assignment).toEqual({
      id: '_120127_1',
      coursePk1: '_12594_1',
      courseName: 'Test Course',
      title: 'Assignment 1',
      dueDate: '2026-10-15T04:00:00.000Z',
      eventType: 'Test',
      categoryId: '_172683_1',
      attemptable: true,
      gradable: true,
    });
  });

  it('处理缺少dynamicCalendarItemProps的情况', () => {
    const item: CalendarItem = {
      id: '_120128_1',
      type: 'GradebookColumn',
      calendarId: '_12594_1',
      title: 'Assignment 2',
      start: '2026-10-20T04:00:00.000Z',
      end: '2026-10-20T04:00:00.000Z',
    };

    const assignment = calendarItemToAssignment(item, 'Test Course');

    expect(assignment).toMatchObject({
      id: '_120128_1',
      coursePk1: '_12594_1',
      courseName: 'Test Course',
      title: 'Assignment 2',
      dueDate: '2026-10-20T04:00:00.000Z',
      attemptable: false,
      gradable: false,
    });
    expect(assignment).not.toHaveProperty('eventType');
    expect(assignment).not.toHaveProperty('categoryId');
  });
});

describe('aggregateDDL', () => {
  const course1: Course = {
    pk1: '_100_1',
    batchUid: 'CS101',
    name: '计算机科学导论',
    ultraStatus: 'Classic',
  };

  const course2: Course = {
    pk1: '_200_1',
    batchUid: 'MATH101',
    name: '微积分I',
    ultraStatus: 'Classic',
  };

  it('聚合多个课程的GradebookColumn items', () => {
    const items1: CalendarItem[] = [
      {
        id: '_1_1',
        type: 'GradebookColumn',
        calendarId: '_100_1',
        title: 'Assignment 1',
        start: '2026-10-15T04:00:00.000Z',
        end: '2026-10-15T04:00:00.000Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
      {
        id: '_2_1',
        type: 'Course',
        calendarId: '_100_1',
        title: 'Lecture',
        start: '2026-10-10T10:00:00.000Z',
        end: '2026-10-10T11:00:00.000Z',
      },
    ];

    const items2: CalendarItem[] = [
      {
        id: '_3_1',
        type: 'GradebookColumn',
        calendarId: '_200_1',
        title: 'Quiz 1',
        start: '2026-10-12T04:00:00.000Z',
        end: '2026-10-12T04:00:00.000Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
    ];

    const result = aggregateDDL(
      [
        { course: course1, items: items1 },
        { course: course2, items: items2 },
      ],
      { since: '2026-10-01T00:00:00.000Z', until: '2026-10-31T23:59:59.999Z' },
    );

    expect(result.totalCount).toBe(2);
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]?.id).toBe('_3_1');
    expect(result.assignments[1]?.id).toBe('_1_1');
    expect(result.timeRange.since).toBe('2026-10-01T00:00:00.000Z');
    expect(result.timeRange.until).toBe('2026-10-31T23:59:59.999Z');
  });

  it('按到期日期排序assignments', () => {
    const items: CalendarItem[] = [
      {
        id: '_3_1',
        type: 'GradebookColumn',
        calendarId: '_100_1',
        title: 'C',
        start: '2026-10-20T04:00:00.000Z',
        end: '2026-10-20T04:00:00.000Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
      {
        id: '_1_1',
        type: 'GradebookColumn',
        calendarId: '_100_1',
        title: 'A',
        start: '2026-10-10T04:00:00.000Z',
        end: '2026-10-10T04:00:00.000Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
      {
        id: '_2_1',
        type: 'GradebookColumn',
        calendarId: '_100_1',
        title: 'B',
        start: '2026-10-15T04:00:00.000Z',
        end: '2026-10-15T04:00:00.000Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
    ];

    const result = aggregateDDL([{ course: course1, items }], {
      since: '2026-10-01T00:00:00.000Z',
      until: '2026-10-31T23:59:59.999Z',
    });

    expect(result.assignments.map((a) => a.id)).toEqual([
      '_1_1',
      '_2_1',
      '_3_1',
    ]);
  });

  it('同一天的assignments按标题排序', () => {
    const items: CalendarItem[] = [
      {
        id: '_2_1',
        type: 'GradebookColumn',
        calendarId: '_100_1',
        title: 'Quiz',
        start: '2026-10-15T04:00:00.000Z',
        end: '2026-10-15T04:00:00.000Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
      {
        id: '_1_1',
        type: 'GradebookColumn',
        calendarId: '_100_1',
        title: 'Assignment',
        start: '2026-10-15T04:00:00.000Z',
        end: '2026-10-15T04:00:00.000Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
    ];

    const result = aggregateDDL([{ course: course1, items }], {
      since: '2026-10-01T00:00:00.000Z',
      until: '2026-10-31T23:59:59.999Z',
    });

    expect(result.assignments.map((a) => a.title)).toEqual([
      'Assignment',
      'Quiz',
    ]);
  });

  it('过滤非GradebookColumn类型的items', () => {
    const items: CalendarItem[] = [
      {
        id: '_1_1',
        type: 'Course',
        calendarId: '_100_1',
        title: 'Lecture',
        start: '2026-10-10T10:00:00.000Z',
        end: '2026-10-10T11:00:00.000Z',
      },
      {
        id: '_2_1',
        type: 'OfficeHours',
        calendarId: '_100_1',
        title: 'Office Hours',
        start: '2026-10-11T14:00:00.000Z',
        end: '2026-10-11T15:00:00.000Z',
      },
      {
        id: '_3_1',
        type: 'GradebookColumn',
        calendarId: '_100_1',
        title: 'Assignment',
        start: '2026-10-15T04:00:00.000Z',
        end: '2026-10-15T04:00:00.000Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
    ];

    const result = aggregateDDL([{ course: course1, items }], {
      since: '2026-10-01T00:00:00.000Z',
      until: '2026-10-31T23:59:59.999Z',
    });

    expect(result.totalCount).toBe(1);
    expect(result.assignments[0]?.id).toBe('_3_1');
  });

  it('处理空列表', () => {
    const result = aggregateDDL([], {
      since: '2026-10-01T00:00:00.000Z',
      until: '2026-10-31T23:59:59.999Z',
    });

    expect(result.totalCount).toBe(0);
    expect(result.assignments).toEqual([]);
  });

  it('过滤非作业类型的 CalendarItem', () => {
    const course1: Course = {
      pk1: '_1_1',
      batchUid: 'TEST101',
      name: 'Test Course',
      ultraStatus: 'Classic',
    };

    const items: CalendarItem[] = [
      {
        id: '_1_1',
        type: 'GradebookColumn',
        calendarId: '_1_1',
        title: 'Assignment 1',
        start: '2026-09-15T23:59:00Z',
        end: '2026-09-15T23:59:00Z',
        dynamicCalendarItemProps: { attemptable: true, gradable: true },
      },
      {
        id: '_2_1',
        type: 'Course',
        calendarId: '_1_1',
        title: 'Course Event',
        start: '2026-09-16T10:00:00Z',
        end: '2026-09-16T11:00:00Z',
      },
      {
        id: '_3_1',
        type: 'OfficeHours',
        calendarId: '_1_1',
        title: 'Office Hours',
        start: '2026-09-17T14:00:00Z',
        end: '2026-09-17T15:00:00Z',
      },
      {
        id: '_4_1',
        type: 'Institution',
        calendarId: '_1_1',
        title: 'Institution Event',
        start: '2026-09-18T09:00:00Z',
        end: '2026-09-18T10:00:00Z',
      },
    ];

    const result = aggregateDDL([{ course: course1, items }], {
      since: '2026-09-01T00:00:00Z',
      until: '2026-09-30T23:59:59Z',
    });

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]?.title).toBe('Assignment 1');
    expect(result.filterCounts).toEqual({
      GradebookColumn: 1,
      Course: 1,
      OfficeHours: 1,
      Institution: 1,
      unknown: 0,
    });
  });

  it('记录未知的 CalendarItem 类型', () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const course1: Course = {
      pk1: '_1_1',
      batchUid: 'TEST101',
      name: 'Test Course',
      ultraStatus: 'Classic',
    };

    const items: CalendarItem[] = [
      {
        id: '_1_1',
        type: 'UnknownType' as CalendarItemType,
        calendarId: '_1_1',
        title: 'Unknown Item',
        start: '2026-09-15T23:59:00Z',
        end: '2026-09-15T23:59:00Z',
      },
    ];

    const result = aggregateDDL([{ course: course1, items }], {
      since: '2026-09-01T00:00:00Z',
      until: '2026-09-30T23:59:59Z',
    });

    expect(result.assignments).toHaveLength(0);
    expect(result.filterCounts?.unknown).toBe(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown CalendarItem type: "UnknownType"'),
    );

    consoleWarnSpy.mockRestore();
  });

  it('记录所有被过滤的类型统计', () => {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => {});

    const course1: Course = {
      pk1: '_1_1',
      batchUid: 'TEST101',
      name: 'Test Course',
      ultraStatus: 'Classic',
    };

    const items: CalendarItem[] = [
      {
        id: '_2_1',
        type: 'Course',
        calendarId: '_1_1',
        title: 'Course Event 1',
        start: '2026-09-16T10:00:00Z',
        end: '2026-09-16T11:00:00Z',
      },
      {
        id: '_3_1',
        type: 'Course',
        calendarId: '_1_1',
        title: 'Course Event 2',
        start: '2026-09-17T10:00:00Z',
        end: '2026-09-17T11:00:00Z',
      },
      {
        id: '_4_1',
        type: 'OfficeHours',
        calendarId: '_1_1',
        title: 'Office Hours',
        start: '2026-09-18T14:00:00Z',
        end: '2026-09-18T15:00:00Z',
      },
    ];

    aggregateDDL([{ course: course1, items }], {
      since: '2026-09-01T00:00:00Z',
      until: '2026-09-30T23:59:59Z',
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Filtered 2 Course, 1 OfficeHours'),
    );

    consoleInfoSpy.mockRestore();
  });
});

describe('SUPPORTED_ASSIGNMENT_TYPES', () => {
  it('只包含 GradebookColumn', () => {
    expect(SUPPORTED_ASSIGNMENT_TYPES.has('GradebookColumn')).toBe(true);
    expect(SUPPORTED_ASSIGNMENT_TYPES.has('Course')).toBe(false);
    expect(SUPPORTED_ASSIGNMENT_TYPES.has('OfficeHours')).toBe(false);
    expect(SUPPORTED_ASSIGNMENT_TYPES.has('Institution')).toBe(false);
  });
});

describe('isAssignmentType', () => {
  it('只有 GradebookColumn 返回 true', () => {
    expect(isAssignmentType('GradebookColumn')).toBe(true);
    expect(isAssignmentType('Course')).toBe(false);
    expect(isAssignmentType('OfficeHours')).toBe(false);
    expect(isAssignmentType('Institution')).toBe(false);
  });
});

describe('formatDueDate', () => {
  it('格式化未来日期', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-15T12:00:00.000Z');
    vi.setSystemTime(now);

    const tomorrow = new Date('2024-01-16T23:59:00.000Z');
    const formatted = formatDueDate(tomorrow.toISOString());

    expect(formatted.date).toMatch(/\d{4}\/\d{2}\/\d{2}/);
    expect(formatted.time).toMatch(/\d{2}:\d{2}/);
    expect(formatted.relative).toBe('明天截止');

    vi.useRealTimers();
  });

  it('标记已过期的日期', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-15T12:00:00.000Z');
    vi.setSystemTime(now);

    const yesterday = new Date('2024-01-14T12:00:00.000Z');
    const formatted = formatDueDate(yesterday.toISOString());

    expect(formatted.relative).toBe('已截止');

    vi.useRealTimers();
  });

  it('计算相对天数', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-15T12:00:00.000Z');
    vi.setSystemTime(now);

    const future = new Date('2024-01-20T12:00:00.000Z');
    const formatted = formatDueDate(future.toISOString());

    expect(formatted.relative).toBe('5天后');

    vi.useRealTimers();
  });

  it('显示今天截止', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-15T12:00:00.000Z');
    vi.setSystemTime(now);

    const today = new Date('2024-01-15T23:59:00.000Z');
    const formatted = formatDueDate(today.toISOString());

    expect(formatted.relative).toBe('今天截止');

    vi.useRealTimers();
  });

  it('显示周数', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-15T12:00:00.000Z');
    vi.setSystemTime(now);

    const future = new Date('2024-02-05T12:00:00.000Z');
    const formatted = formatDueDate(future.toISOString());

    expect(formatted.relative).toBe('3周后');

    vi.useRealTimers();
  });
});

describe('isOverdue', () => {
  it('识别过期日期', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-15T12:00:00.000Z');
    vi.setSystemTime(now);

    const yesterday = new Date('2024-01-14T12:00:00.000Z');
    expect(isOverdue(yesterday.toISOString())).toBe(true);

    vi.useRealTimers();
  });

  it('识别未来日期', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-15T12:00:00.000Z');
    vi.setSystemTime(now);

    const tomorrow = new Date('2024-01-16T12:00:00.000Z');
    expect(isOverdue(tomorrow.toISOString())).toBe(false);

    vi.useRealTimers();
  });
});

describe('groupByTimeframe', () => {
  it('按时间段分组assignments', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-15T12:00:00.000Z');
    vi.setSystemTime(now);

    const yesterday = new Date('2024-01-14T12:00:00.000Z');
    const threeDays = new Date('2024-01-18T12:00:00.000Z');
    const nineDays = new Date('2024-01-24T12:00:00.000Z');
    const twentyDays = new Date('2024-02-04T12:00:00.000Z');

    const assignments = [
      {
        id: '_1_1',
        coursePk1: '_100_1',
        courseName: 'Course',
        title: 'Overdue',
        dueDate: yesterday.toISOString(),
        attemptable: true,
        gradable: true,
      },
      {
        id: '_2_1',
        coursePk1: '_100_1',
        courseName: 'Course',
        title: 'This Week',
        dueDate: threeDays.toISOString(),
        attemptable: true,
        gradable: true,
      },
      {
        id: '_3_1',
        coursePk1: '_100_1',
        courseName: 'Course',
        title: 'Next Week',
        dueDate: nineDays.toISOString(),
        attemptable: true,
        gradable: true,
      },
      {
        id: '_4_1',
        coursePk1: '_100_1',
        courseName: 'Course',
        title: 'Later',
        dueDate: twentyDays.toISOString(),
        attemptable: true,
        gradable: true,
      },
    ];

    const grouped = groupByTimeframe(assignments);

    expect(grouped.overdue).toHaveLength(1);
    expect(grouped.thisWeek).toHaveLength(1);
    expect(grouped.nextWeek).toHaveLength(1);
    expect(grouped.later).toHaveLength(1);

    expect(grouped.overdue[0]?.title).toBe('Overdue');
    expect(grouped.thisWeek[0]?.title).toBe('This Week');
    expect(grouped.nextWeek[0]?.title).toBe('Next Week');
    expect(grouped.later[0]?.title).toBe('Later');

    vi.useRealTimers();
  });

  it('处理空列表', () => {
    const grouped = groupByTimeframe([]);

    expect(grouped.overdue).toEqual([]);
    expect(grouped.thisWeek).toEqual([]);
    expect(grouped.nextWeek).toEqual([]);
    expect(grouped.later).toEqual([]);
  });
});
