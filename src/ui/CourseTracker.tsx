import { useState } from 'react';
import { filterCurrentTermCourses } from '../core/term-filter';
import type { Course } from '../core/types';
import { buttonStyles } from './buttonStyles';

interface CourseTrackerProps {
  courses: Course[];
  tracked: ReadonlySet<string>;
  busyPk1: string | null;
  syncing: boolean;
  syncRoundPk1s: ReadonlySet<string>;
  onToggle: (course: Course, tracked: boolean) => void;
  onSyncNow: () => void;
  onDownloadWholeCourse: (course: Course) => void;
}

export function CourseTracker({
  courses,
  tracked,
  busyPk1,
  syncing,
  syncRoundPk1s,
  onToggle,
  onSyncNow,
  onDownloadWholeCourse,
}: CourseTrackerProps) {
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);
  const [showCurrentTermOnly, setShowCurrentTermOnly] = useState(false);

  let filteredCourses = courses;

  if (showAvailableOnly) {
    filteredCourses = filteredCourses.filter(
      (course) =>
        !course.availability || course.availability.available === 'Yes',
    );
  }

  if (showCurrentTermOnly) {
    filteredCourses = filterCurrentTermCourses(filteredCourses);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-4 py-3">
        <p className="text-xs leading-5 text-slate-500">
          勾选课程加入跟踪列表。勾选后不会立即下载，点击「立即同步」开始下载。
        </p>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={syncing || tracked.size === 0}
              className={`text-xs ${buttonStyles.primary}`}
              onClick={onSyncNow}
            >
              {syncing ? '正在同步…' : '立即同步'}
            </button>
            {syncing && syncRoundPk1s.size > 0 && (
              <span className="text-xs text-slate-500">
                本轮 {syncRoundPk1s.size} 门 · 可继续勾选，下轮再生效
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-slate-900"
                checked={showAvailableOnly}
                onChange={(event) => setShowAvailableOnly(event.target.checked)}
              />
              <span>仅显示可用课程</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-slate-900"
                checked={showCurrentTermOnly}
                onChange={(event) =>
                  setShowCurrentTermOnly(event.target.checked)
                }
              />
              <span>仅显示当前学期</span>
            </label>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {filteredCourses.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-slate-500">
            {courses.length === 0
              ? '没有读取到课程。请确认已登录 Blackboard。'
              : '没有符合条件的课程。'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filteredCourses.map((course) => {
              const isTracked = tracked.has(course.pk1);
              const isInSyncRound = syncRoundPk1s.has(course.pk1);
              const downloadDisabled =
                busyPk1 === course.pk1 || (syncing && isInSyncRound);
              return (
                <li key={course.pk1}>
                  <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
                    <label className="flex flex-1 cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900"
                        checked={isTracked}
                        aria-label={`跟踪 ${course.name}`}
                        onChange={(event) =>
                          onToggle(course, event.target.checked)
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                        {course.name}
                      </span>
                    </label>
                    <button
                      type="button"
                      disabled={downloadDisabled}
                      className="shrink-0 text-xs text-slate-900 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                      onClick={() => onDownloadWholeCourse(course)}
                      title={
                        downloadDisabled && isInSyncRound
                          ? '该课程正在本轮同步中'
                          : '下载整课内容'
                      }
                    >
                      ⬇️
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
