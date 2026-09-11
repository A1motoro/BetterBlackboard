import type { AggregatedDDL, Assignment, CalendarItem, Course } from './types';

export interface DDLAggregationOptions {
  weeksAhead?: number;
  includeWeeksPast?: number;
  userTimezone?: string;
}

const DEFAULT_WEEKS_AHEAD = 4;
const DEFAULT_WEEKS_PAST = 0;
const MAX_WEEKS_AHEAD = 16;

export function createTimeRange(options: DDLAggregationOptions = {}): {
  since: string;
  until: string;
} {
  const weeksAhead = Math.min(
    options.weeksAhead ?? DEFAULT_WEEKS_AHEAD,
    MAX_WEEKS_AHEAD,
  );
  const weeksPast = options.includeWeeksPast ?? DEFAULT_WEEKS_PAST;

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - weeksPast * 7);

  const until = new Date(now);
  until.setDate(until.getDate() + weeksAhead * 7);

  return {
    since: since.toISOString(),
    until: until.toISOString(),
  };
}

export function calendarItemToAssignment(
  item: CalendarItem,
  courseName: string,
): Assignment {
  return {
    id: item.id,
    coursePk1: item.calendarId,
    courseName,
    title: item.title,
    dueDate: item.start,
    ...(item.dynamicCalendarItemProps?.eventType
      ? { eventType: item.dynamicCalendarItemProps.eventType }
      : {}),
    ...(item.dynamicCalendarItemProps?.categoryId
      ? { categoryId: item.dynamicCalendarItemProps.categoryId }
      : {}),
    attemptable: item.dynamicCalendarItemProps?.attemptable ?? false,
    gradable: item.dynamicCalendarItemProps?.gradable ?? false,
  };
}

export function aggregateDDL(
  courseItems: Array<{
    course: Course;
    items: CalendarItem[];
  }>,
  timeRange: { since: string; until: string },
): AggregatedDDL {
  const assignments: Assignment[] = [];

  for (const { course, items } of courseItems) {
    for (const item of items) {
      if (item.type === 'GradebookColumn') {
        assignments.push(calendarItemToAssignment(item, course.name));
      }
    }
  }

  assignments.sort((a, b) => {
    const dateA = new Date(a.dueDate).getTime();
    const dateB = new Date(b.dueDate).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });

  return {
    assignments,
    totalCount: assignments.length,
    timeRange,
  };
}

export function formatDueDate(
  isoDate: string,
  userTimezone?: string,
): {
  date: string;
  time: string;
  relative: string;
} {
  const dueDate = new Date(isoDate);
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  let relative: string;
  if (diffMs < 0) {
    relative = '已截止';
  } else if (diffHours < 24) {
    relative = `今天截止`;
  } else if (diffDays === 1) {
    relative = `明天截止`;
  } else if (diffDays < 7) {
    relative = `${diffDays}天后`;
  } else if (diffDays < 14) {
    relative = `1周后`;
  } else {
    const weeks = Math.floor(diffDays / 7);
    relative = `${weeks}周后`;
  }

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(userTimezone ? { timeZone: userTimezone } : {}),
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(userTimezone ? { timeZone: userTimezone } : {}),
  };

  const date = dueDate.toLocaleDateString('zh-CN', options);
  const time = dueDate.toLocaleTimeString('zh-CN', timeOptions);

  return { date, time, relative };
}

export function isOverdue(isoDate: string): boolean {
  return new Date(isoDate).getTime() < Date.now();
}

export function groupByTimeframe(assignments: Assignment[]): {
  overdue: Assignment[];
  thisWeek: Assignment[];
  nextWeek: Assignment[];
  later: Assignment[];
} {
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const twoWeeks = 2 * oneWeek;

  const overdue: Assignment[] = [];
  const thisWeek: Assignment[] = [];
  const nextWeek: Assignment[] = [];
  const later: Assignment[] = [];

  for (const assignment of assignments) {
    const dueTime = new Date(assignment.dueDate).getTime();
    const diff = dueTime - now;

    if (diff < 0) {
      overdue.push(assignment);
    } else if (diff < oneWeek) {
      thisWeek.push(assignment);
    } else if (diff < twoWeeks) {
      nextWeek.push(assignment);
    } else {
      later.push(assignment);
    }
  }

  return { overdue, thisWeek, nextWeek, later };
}
