import type { Course } from './types';

/**
 * 当前学期识别策略
 *
 * 由于 Blackboard termId 格式和语义是"未验证"的，本模块采用防御性实现：
 * 1. 如果课程有 availability.duration，优先使用时间范围判断
 * 2. 如果没有 duration 但有 availability.available = 'Yes'，认为是当前可用
 * 3. 如果都没有，保守地包含该课程(避免静默过滤掉可能有效的课程)
 *
 * 不依赖 termId 的具体格式，因为它在 spec.md 中标记为"未验证"。
 */

export interface TermFilterOptions {
  /**
   * 参考时间点(毫秒时间戳)
   * 默认为当前时间
   */
  referenceTime?: number;

  /**
   * 宽容度(毫秒)
   * 对于即将开始或刚刚结束的课程，给予一定的宽容时间
   * 默认 7 天
   */
  gracePeriodMs?: number;
}

const DEFAULT_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/**
 * 判断课程是否为"当前学期"
 *
 * @param course 课程对象
 * @param options 过滤选项
 * @returns true 表示该课程应被视为当前学期课程
 */
export function isCurrentTerm(
  course: Course,
  options: TermFilterOptions = {},
): boolean {
  const now = options.referenceTime ?? Date.now();
  const grace = options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;

  // 策略 1: 基于 availability.duration 的时间范围判断
  if (course.availability?.duration) {
    const { start, end } = course.availability.duration;

    // 如果有开始时间，检查是否在宽容期内或已开始
    if (start) {
      const startMs = new Date(start).getTime();
      if (now + grace < startMs) {
        // 课程开始时间在未来，且超出宽容期
        return false;
      }
    }

    // 如果有结束时间，检查是否在宽容期内或未结束
    if (end) {
      const endMs = new Date(end).getTime();
      if (now - grace > endMs) {
        // 课程结束时间在过去，且超出宽容期
        return false;
      }
    }

    // 时间范围检查通过(或只有部分时间信息)
    return true;
  }

  // 策略 2: 如果没有 duration，但 availability.available = 'Yes'，认为是当前可用
  if (course.availability?.available === 'Yes') {
    return true;
  }

  // 策略 3: 保守策略 - 如果没有足够的信息判断，包含该课程
  // 这样可以避免静默过滤掉可能有效的课程
  if (!course.availability) {
    return true;
  }

  // 如果 availability.available 明确为 'No' 或 'Disabled'，排除
  return false;
}

/**
 * 过滤出当前学期的课程
 *
 * @param courses 课程列表
 * @param options 过滤选项
 * @returns 当前学期的课程列表
 */
export function filterCurrentTermCourses(
  courses: Course[],
  options: TermFilterOptions = {},
): Course[] {
  return courses.filter((course) => isCurrentTerm(course, options));
}

/**
 * 按学期分组课程
 *
 * 注意：由于 termId 格式未验证，本函数只做简单的 termId 分组
 * 不尝试解析 termId 的语义或排序
 *
 * @param courses 课程列表
 * @returns 按 termId 分组的课程 Map，没有 termId 的课程归入 'unknown' 键
 */
export function groupCoursesByTerm(courses: Course[]): Map<string, Course[]> {
  const groups = new Map<string, Course[]>();

  for (const course of courses) {
    const termKey = course.termId ?? 'unknown';
    const group = groups.get(termKey);
    if (group) {
      group.push(course);
    } else {
      groups.set(termKey, [course]);
    }
  }

  return groups;
}
