import type { Course } from '../core/types';

interface CourseTrackerProps {
  courses: Course[];
  tracked: ReadonlySet<string>;
  busyPk1: string | null;
  syncing: boolean;
  onToggle: (course: Course, tracked: boolean) => void;
  onSyncNow: () => void;
}

export function CourseTracker({
  courses,
  tracked,
  busyPk1,
  syncing,
  onToggle,
  onSyncNow,
}: CourseTrackerProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-4 py-3">
        <p className="text-xs leading-5 text-slate-500">
          勾选后立刻下载该课全部附件。之后打开主菜单时只补路径或文件名变了的新文件。
        </p>
        <button
          type="button"
          disabled={syncing || tracked.size === 0}
          className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-400"
          onClick={onSyncNow}
        >
          {syncing ? '正在同步…' : '立即同步已跟踪课程'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {courses.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-slate-500">
            没有读取到课程。请确认已登录 Blackboard。
          </p>
        ) : (
          <ul className="space-y-1">
            {courses.map((course) => {
              const isTracked = tracked.has(course.pk1);
              const busy = busyPk1 === course.pk1 || (syncing && isTracked);
              return (
                <li key={course.pk1}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                      checked={isTracked}
                      disabled={busyPk1 !== null}
                      aria-label={`跟踪 ${course.name}`}
                      onChange={(event) =>
                        onToggle(course, event.target.checked)
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">
                        {course.name}
                      </span>
                      {busy && (
                        <span className="text-[11px] text-indigo-600">
                          正在下载…
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
