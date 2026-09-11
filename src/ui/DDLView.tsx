import { formatDueDate, isOverdue } from '../core/ddl-aggregation';
import type { Assignment } from '../core/types';

interface DDLListProps {
  assignments: Assignment[];
  loading: boolean;
}

export function DDLList({ assignments, loading }: DDLListProps) {
  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        <div className="animate-pulse">正在加载 DDL...</div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        未找到即将到期的作业
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {assignments.map((assignment) => (
        <DDLItem key={assignment.id} assignment={assignment} />
      ))}
    </div>
  );
}

interface DDLItemProps {
  assignment: Assignment;
}

function DDLItem({ assignment }: DDLItemProps) {
  const { date, time, relative } = formatDueDate(assignment.dueDate);
  const overdue = isOverdue(assignment.dueDate);

  return (
    <div className="p-3 hover:bg-gray-50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 truncate">
            {assignment.title}
          </h4>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {assignment.courseName}
          </p>
        </div>
        <div className="flex-shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              overdue ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
            }`}
          >
            {relative}
          </span>
        </div>
      </div>
      <div className="mt-1.5 text-xs text-gray-600">
        <span>{date}</span>
        <span className="mx-1.5">·</span>
        <span>{time}</span>
      </div>
      {assignment.eventType && (
        <div className="mt-1">
          <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            {assignment.eventType}
          </span>
        </div>
      )}
    </div>
  );
}

interface DDLSectionProps {
  assignments: Assignment[];
  loading: boolean;
  onRefresh: () => void;
  lastRefresh: number | null;
  filterCounts?: {
    GradebookColumn: number;
    Course: number;
    OfficeHours: number;
    Institution: number;
    unknown: number;
  } | null;
}

export function DDLSection({
  assignments,
  loading,
  onRefresh,
  lastRefresh,
  filterCounts,
}: DDLSectionProps) {
  const now = Date.now();
  const thisWeek: Assignment[] = [];
  const nextWeek: Assignment[] = [];
  const later: Assignment[] = [];
  const overdue: Assignment[] = [];

  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const twoWeeks = 2 * oneWeek;

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

  const lastRefreshText = lastRefresh
    ? `上次刷新: ${new Date(lastRefresh).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const hasFilteredItems =
    filterCounts &&
    (filterCounts.Course > 0 ||
      filterCounts.OfficeHours > 0 ||
      filterCounts.Institution > 0 ||
      filterCounts.unknown > 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">DDL 聚合</h3>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
            type="button"
          >
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
        {lastRefreshText && (
          <p className="text-xs text-gray-500 mt-1">{lastRefreshText}</p>
        )}
        {hasFilteredItems && (
          <div className="mt-2 text-xs text-gray-600">
            <details className="cursor-pointer">
              <summary className="hover:text-gray-900">
                已过滤非作业项目 (点击查看详情)
              </summary>
              <div className="mt-1 ml-4 space-y-0.5">
                {filterCounts.Course > 0 && (
                  <div>课程事件: {filterCounts.Course}</div>
                )}
                {filterCounts.OfficeHours > 0 && (
                  <div>答疑时间: {filterCounts.OfficeHours}</div>
                )}
                {filterCounts.Institution > 0 && (
                  <div>机构事件: {filterCounts.Institution}</div>
                )}
                {filterCounts.unknown > 0 && (
                  <div className="text-orange-600">
                    未知类型: {filterCounts.unknown}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {overdue.length > 0 && (
          <div className="border-b border-gray-200">
            <div className="bg-red-50 px-4 py-2">
              <h4 className="text-xs font-semibold text-red-900">
                已截止 ({overdue.length})
              </h4>
            </div>
            <DDLList assignments={overdue} loading={false} />
          </div>
        )}

        {thisWeek.length > 0 && (
          <div className="border-b border-gray-200">
            <div className="bg-orange-50 px-4 py-2">
              <h4 className="text-xs font-semibold text-orange-900">
                本周 ({thisWeek.length})
              </h4>
            </div>
            <DDLList assignments={thisWeek} loading={false} />
          </div>
        )}

        {nextWeek.length > 0 && (
          <div className="border-b border-gray-200">
            <div className="bg-blue-50 px-4 py-2">
              <h4 className="text-xs font-semibold text-blue-900">
                下周 ({nextWeek.length})
              </h4>
            </div>
            <DDLList assignments={nextWeek} loading={false} />
          </div>
        )}

        {later.length > 0 && (
          <div>
            <div className="bg-gray-50 px-4 py-2">
              <h4 className="text-xs font-semibold text-gray-700">
                更晚 ({later.length})
              </h4>
            </div>
            <DDLList assignments={later} loading={false} />
          </div>
        )}

        {assignments.length === 0 && !loading && (
          <div className="p-8 text-center text-sm text-gray-500">
            未找到即将到期的作业
          </div>
        )}

        {loading && assignments.length === 0 && (
          <div className="p-8 text-center">
            <div className="animate-pulse text-sm text-gray-500">
              正在加载 DDL...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
