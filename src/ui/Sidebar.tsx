import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  CUHKSZ_ORIGIN,
  isBlackboardMainMenu,
  parseCourseContext,
} from '../adapters/cuhksz';
import {
  HOME_SYNC_MIN_INTERVAL_MS,
  type CourseTrackingSnapshot,
} from '../core/courses';
import {
  aggregateDDL,
  createTimeRange,
} from '../core/ddl-aggregation';
import { createContentSnapshot } from '../core/fingerprint';
import {
  detectDownloadDiff,
  addDownloadRecords,
  pruneHistory,
  type CourseDownloadHistory,
  type DownloadHistoryRecord,
} from '../core/download-history';
import {
  createDiffPreview,
  filterDownloadableItems,
  type DiffPreview,
} from '../core/diff-preview';
import {
  buildAttachmentKeyIndex,
  collectAttachmentKeys,
  createDownloadPlan,
  createFullDownloadPlan,
} from '../core/download-plan';
import {
  BbError,
  type Assignment,
  type ContentNode,
  type Course,
  type DownloadTask,
  type DownloadTaskInput,
} from '../core/types';
import { BlackboardClient } from '../infrastructure/blackboard/client';
import {
  BackgroundApiTransport,
  FallbackApiTransport,
  FetchApiTransport,
} from '../infrastructure/blackboard/transport';
import {
  isDownloadSnapshotEvent,
  requestId,
  type EnqueueResult,
  type ExtensionRequest,
  type ExtensionResponse,
} from '../infrastructure/messages';
import { ContentTree } from './ContentTree';
import { CourseTracker } from './CourseTracker';
import { DDLSection } from './DDLView';
import { DownloadPanel } from './DownloadPanel';
import { DiffPreviewComponent } from './DiffPreview';

const POLL_INTERVAL = 1_200;
const PENDING_STATUSES = new Set<DownloadTask['status']>([
  'queued',
  'starting',
  'in_progress',
]);

interface Notice {
  tone: 'info' | 'error';
  message: string;
}

interface State {
  loading: boolean;
  collapsed: boolean;
  nodes: ContentNode[];
  selected: Set<string>;
  tasks: DownloadTask[];
  course: Course | null;
  courses: Course[];
  tracked: Set<string>;
  busyPk1: string | null;
  syncing: boolean;
  loadError: string | null;
  notice: Notice | null;
  diffPreview: DiffPreview | null;
  showingDiff: boolean;
  viewMode: 'files' | 'ddl';
  ddlAssignments: Assignment[];
  ddlLoading: boolean;
  ddlLastRefresh: number | null;
}

type Action =
  | { type: 'loaded'; course: Course; nodes: ContentNode[] }
  | { type: 'failed'; message: string }
  | { type: 'toggle'; keys: string[]; selected: boolean }
  | { type: 'tasks'; tasks: DownloadTask[] }
  | { type: 'collapse'; value: boolean }
  | { type: 'ready' }
  | { type: 'notice'; notice: Notice | null }
  | { type: 'courses'; courses: Course[] }
  | { type: 'tracking'; tracked: string[] }
  | { type: 'busy'; coursePk1: string | null }
  | { type: 'syncing'; value: boolean }
  | { type: 'showDiff'; preview: DiffPreview }
  | { type: 'hideDiff' }
  | { type: 'setViewMode'; mode: 'files' | 'ddl' }
  | { type: 'ddlLoaded'; assignments: Assignment[] }
  | { type: 'ddlLoading'; value: boolean };

const initialState: State = {
  loading: true,
  collapsed: false,
  nodes: [],
  selected: new Set(),
  tasks: [],
  course: null,
  courses: [],
  tracked: new Set(),
  busyPk1: null,
  syncing: false,
  loadError: null,
  notice: null,
  diffPreview: null,
  showingDiff: false,
  viewMode: 'files',
  ddlAssignments: [],
  ddlLoading: false,
  ddlLastRefresh: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        loading: false,
        course: action.course,
        nodes: action.nodes,
        selected: new Set(),
        loadError: null,
        showingDiff: false,
        diffPreview: null,
      };
    case 'failed':
      return { ...state, loading: false, loadError: action.message };
    case 'ready':
      return { ...state, loading: false, loadError: null };
    case 'toggle': {
      const selected = new Set(state.selected);
      for (const key of action.keys) {
        if (action.selected) selected.add(key);
        else selected.delete(key);
      }
      return { ...state, selected };
    }
    case 'tasks':
      return { ...state, tasks: action.tasks };
    case 'collapse':
      return { ...state, collapsed: action.value };
    case 'notice':
      return { ...state, notice: action.notice };
    case 'courses':
      return { ...state, courses: action.courses };
    case 'tracking':
      return { ...state, tracked: new Set(action.tracked) };
    case 'busy':
      return { ...state, busyPk1: action.coursePk1 };
    case 'syncing':
      return { ...state, syncing: action.value };
    case 'showDiff':
      return {
        ...state,
        showingDiff: true,
        diffPreview: action.preview,
      };
    case 'hideDiff':
      return { ...state, showingDiff: false, diffPreview: null };
    case 'setViewMode':
      return { ...state, viewMode: action.mode };
    case 'ddlLoaded':
      return {
        ...state,
        ddlAssignments: action.assignments,
        ddlLoading: false,
        ddlLastRefresh: Date.now(),
      };
    case 'ddlLoading':
      return { ...state, ddlLoading: action.value };
  }
}

async function send<T>(message: ExtensionRequest): Promise<T> {
  const response: ExtensionResponse<T> =
    await browser.runtime.sendMessage(message);
  if (!response) {
    throw new BbError('api_incompatible', '扩展后台没有响应，请重新加载页面');
  }
  if (response.ok) return response.data;
  throw new BbError(
    response.error.code,
    response.error.message,
    response.error.status,
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof BbError) return error.message;
  if (error instanceof Error) return error.message;
  return '加载 Blackboard 内容时发生未知错误';
}

function enqueueNotice(result: EnqueueResult): Notice {
  const parts: string[] = [];
  if (result.accepted > 0) parts.push(`已加入 ${result.accepted} 个文件`);
  if (result.duplicates > 0) parts.push(`${result.duplicates} 个已在队列中`);
  if (result.rejected > 0) parts.push(`${result.rejected} 个被安全策略拦截`);
  return {
    tone: result.accepted > 0 ? 'info' : 'error',
    message: parts.length > 0 ? parts.join('，') : '没有新的文件需要下载',
  };
}

function createClient(): BlackboardClient {
  return new BlackboardClient(
    new FallbackApiTransport(
      new FetchApiTransport(CUHKSZ_ORIGIN),
      new BackgroundApiTransport(CUHKSZ_ORIGIN),
    ),
  );
}

interface SidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({ onCollapsedChange }: SidebarProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pageUrl = useMemo(() => new URL(window.location.href), []);
  const context = useMemo(() => parseCourseContext(pageUrl), [pageUrl]);
  const isHome = useMemo(() => isBlackboardMainMenu(pageUrl), [pageUrl]);
  const client = useMemo(() => createClient(), []);

  useEffect(() => {
    onCollapsedChange?.(state.collapsed);
  }, [onCollapsedChange, state.collapsed]);

  const refresh = useCallback(() => {
    void send<DownloadTask[]>({
      v: 1,
      type: 'downloads.snapshot.get',
      requestId: requestId(),
    })
      .then((tasks) => dispatch({ type: 'tasks', tasks }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (isDownloadSnapshotEvent(message)) {
        dispatch({ type: 'tasks', tasks: message.tasks });
      }
    };
    browser.runtime.onMessage.addListener(listener);
    refresh();
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  // The background pushes every state transition, so polling only has to cover
  // byte-level progress while something is actually running.
  const hasPendingTasks = state.tasks.some((task) =>
    PENDING_STATUSES.has(task.status),
  );
  useEffect(() => {
    if (!hasPendingTasks) return;
    const timer = window.setInterval(refresh, POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [hasPendingTasks, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      client.listMyCourses({
        availabilityFilter: 'Yes',
        signal: controller.signal,
      }),
      send<CourseTrackingSnapshot>({
        v: 1,
        type: 'courses.tracking.get',
        requestId: requestId(),
      }),
    ])
      .then(([courses, tracking]) => {
        dispatch({ type: 'courses', courses });
        dispatch({ type: 'tracking', tracked: tracking.trackedPk1s });
        if (!context) dispatch({ type: 'ready' });
        return tracking;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (!context) {
          dispatch({ type: 'failed', message: errorMessage(error) });
        } else {
          dispatch({
            type: 'notice',
            notice: { tone: 'error', message: errorMessage(error) },
          });
        }
      });
    return () => controller.abort();
  }, [client, context]);

  useEffect(() => {
    if (!context) return;

    const controller = new AbortController();
    void Promise.all([
      client.getCourse(context.coursePk1, controller.signal),
      client.loadCurrentContent(
        context.coursePk1,
        context.contentPk1,
        controller.signal,
      ),
    ])
      .then(([course, nodes]) => dispatch({ type: 'loaded', course, nodes }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          dispatch({ type: 'failed', message: errorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [client, context]);

  const currentTasks = useMemo(
    () =>
      context
        ? state.tasks.filter((task) => task.coursePk1 === context.coursePk1)
        : state.tasks,
    [context, state.tasks],
  );
  const keyIndex = useMemo(
    () => buildAttachmentKeyIndex(state.nodes),
    [state.nodes],
  );
  const allKeys = useMemo(
    () => collectAttachmentKeys(state.nodes),
    [state.nodes],
  );
  const allSelected =
    allKeys.length > 0 && allKeys.every((key) => state.selected.has(key));

  const enqueue = async (tasks: DownloadTaskInput[]): Promise<void> => {
    if (tasks.length === 0) {
      dispatch({
        type: 'notice',
        notice: { tone: 'error', message: '没有选择任何文件' },
      });
      return;
    }
    const result = await send<EnqueueResult>({
      v: 1,
      type: 'downloads.enqueue',
      requestId: requestId(),
      tasks,
    });
    dispatch({ type: 'tasks', tasks: result.tasks });
    dispatch({ type: 'notice', notice: enqueueNotice(result) });
  };

  // Operation failures surface as a dismissible notice; replacing `loadError`
  // here would tear down the already-loaded tree and the user's selection.
  const reportFailure = (error: unknown): void => {
    dispatch({
      type: 'notice',
      notice: { tone: 'error', message: errorMessage(error) },
    });
  };

  const syncCourse = useCallback(
    async (course: Course): Promise<EnqueueResult> => {
      const nodes = await client.loadCourseContent(course.pk1);
      return send<EnqueueResult>({
        v: 1,
        type: 'downloads.enqueue',
        requestId: requestId(),
        tasks: createFullDownloadPlan(
          {
            origin: CUHKSZ_ORIGIN,
            coursePk1: course.pk1,
            contentPk1: course.pk1,
          },
          course,
          nodes,
        ),
      });
    },
    [client],
  );

  const toggleTrack = (course: Course, tracked: boolean): void => {
    void (async () => {
      const snapshot = await send<CourseTrackingSnapshot>({
        v: 1,
        type: 'courses.tracking.set',
        requestId: requestId(),
        coursePk1: course.pk1,
        tracked,
        name: course.name,
      });
      dispatch({ type: 'tracking', tracked: snapshot.trackedPk1s });
      if (!tracked) return;

      dispatch({ type: 'busy', coursePk1: course.pk1 });
      const result = await syncCourse(course);
      dispatch({ type: 'tasks', tasks: result.tasks });
      dispatch({ type: 'notice', notice: enqueueNotice(result) });
    })()
      .catch(reportFailure)
      .finally(() => dispatch({ type: 'busy', coursePk1: null }));
  };

  const downloadWholeCourse = (course: Course): void => {
    dispatch({ type: 'busy', coursePk1: course.pk1 });
    void syncCourse(course)
      .then((result) => {
        dispatch({ type: 'tasks', tasks: result.tasks });
        dispatch({ type: 'notice', notice: enqueueNotice(result) });
      })
      .catch(reportFailure)
      .finally(() => dispatch({ type: 'busy', coursePk1: null }));
  };

  const syncTracked = useCallback(
    (courses: Course[]): void => {
      const selected = courses.filter((course) =>
        state.tracked.has(course.pk1),
      );
      if (selected.length === 0) return;
      dispatch({ type: 'syncing', value: true });
      void (async () => {
        let accepted = 0;
        let duplicates = 0;
        let lastTasks: DownloadTask[] = [];
        for (const course of selected) {
          const result = await syncCourse(course);
          accepted += result.accepted;
          duplicates += result.duplicates;
          lastTasks = result.tasks;
        }
        await send<CourseTrackingSnapshot>({
          v: 1,
          type: 'courses.tracking.homeSynced',
          requestId: requestId(),
        });
        dispatch({ type: 'tasks', tasks: lastTasks });
        dispatch({
          type: 'notice',
          notice: enqueueNotice({
            tasks: lastTasks,
            accepted,
            duplicates,
            rejected: 0,
          }),
        });
      })()
        .catch(reportFailure)
        .finally(() => dispatch({ type: 'syncing', value: false }));
    },
    [state.tracked, syncCourse],
  );

  const analyzeIncremental = useCallback(
    async (
      forceFullSync: boolean = false,
    ): Promise<{
      preview: DiffPreview;
      downloadableKeys: Set<string>;
    } | null> => {
      if (!context || !state.course) return null;

      const history = await send<CourseDownloadHistory>({
        v: 1,
        type: 'history.get',
        requestId: requestId(),
        coursePk1: context.coursePk1,
        contentPk1: context.contentPk1,
      });

      const snapshot = createContentSnapshot(
        context.coursePk1,
        context.contentPk1,
        state.nodes,
      );

      const diff = forceFullSync
        ? {
            added: snapshot.attachments,
            modified: [],
            removed: [],
            unchanged: [],
          }
        : detectDownloadDiff(snapshot, history);

      const preview = createDiffPreview(diff, state.nodes);
      const downloadableItems = filterDownloadableItems(preview);
      const downloadableKeys = new Set(
        downloadableItems.map(
          (item) =>
            `${item.fingerprint.contentPk1}:${item.fingerprint.attachmentPk1}`,
        ),
      );

      return { preview, downloadableKeys };
    },
    [context, state.course, state.nodes],
  );

  const recordHistory = useCallback(
    async (tasks: DownloadTaskInput[]): Promise<void> => {
      if (!context) return;

      const history = await send<CourseDownloadHistory>({
        v: 1,
        type: 'history.get',
        requestId: requestId(),
        coursePk1: context.coursePk1,
        contentPk1: context.contentPk1,
      });

      const now = Date.now();
      const records: DownloadHistoryRecord[] = tasks.map((task) => ({
        fingerprint: {
          attachmentPk1: task.attachmentPk1,
          contentPk1: task.contentPk1,
          fileName: task.sourceFileName,
          timestamp: now,
        },
        targetPath: task.targetPath,
        completedAt: now,
        success: true,
      }));

      let updatedHistory = addDownloadRecords(history, records);
      updatedHistory = pruneHistory(updatedHistory);

      await send({
        v: 1,
        type: 'history.save',
        requestId: requestId(),
        history: updatedHistory,
      });
    },
    [context],
  );

  const loadDDL = useCallback(async (): Promise<void> => {
    if (state.courses.length === 0) return;

    dispatch({ type: 'ddlLoading', value: true });

    try {
      const timeRange = createTimeRange({ weeksAhead: 4 });
      const controller = new AbortController();

      const courseItems = await Promise.all(
        state.courses.map(async (course) => {
          try {
            const items = await client.loadCalendarItems(
              course.pk1,
              timeRange.since,
              timeRange.until,
              'GradebookColumn',
              controller.signal,
            );
            return { course, items };
          } catch (error) {
            console.warn(`无法加载课程 ${course.name} 的 DDL:`, error);
            return { course, items: [] };
          }
        }),
      );

      const aggregated = aggregateDDL(courseItems, timeRange);
      dispatch({ type: 'ddlLoaded', assignments: aggregated.assignments });
    } catch (error) {
      console.error('加载 DDL 失败:', error);
      dispatch({ type: 'ddlLoading', value: false });
    }
  }, [state.courses, client]);

  useEffect(() => {
    if (
      state.viewMode === 'ddl' &&
      state.courses.length > 0 &&
      !state.ddlLastRefresh
    ) {
      void loadDDL();
    }
  }, [state.viewMode, state.courses.length, state.ddlLastRefresh, loadDDL]);

  const startDownload = (): void => {
    if (!context || !state.course) return;

    void (async () => {
      const result = await analyzeIncremental(false);
      if (!result) return;

      const { preview, downloadableKeys } = result;

      if (downloadableKeys.size === 0) {
        dispatch({ type: 'showDiff', preview });
        return;
      }

      const tasks = createDownloadPlan(
        context,
        state.course!,
        state.nodes,
        downloadableKeys,
      );

      await enqueue(tasks);
      await recordHistory(tasks);
    })().catch(reportFailure);
  };

  const startDownloadWithDiff = (): void => {
    if (!context || !state.course || !state.diffPreview) return;

    void (async () => {
      const downloadableItems = filterDownloadableItems(state.diffPreview!);
      const downloadableKeys = new Set(
        downloadableItems.map(
          (item) =>
            `${item.fingerprint.contentPk1}:${item.fingerprint.attachmentPk1}`,
        ),
      );

      const tasks = createDownloadPlan(
        context,
        state.course!,
        state.nodes,
        downloadableKeys,
      );

      await enqueue(tasks);
      await recordHistory(tasks);
      dispatch({ type: 'hideDiff' });
    })().catch(reportFailure);
  };

  const forceFullSync = (): void => {
    if (!context || !state.course) return;

    void (async () => {
      const result = await analyzeIncremental(true);
      if (!result) return;

      dispatch({ type: 'showDiff', preview: result.preview });
    })().catch(reportFailure);
  };

  const cancelDownload = (taskId: string): void => {
    void send<DownloadTask[]>({
      v: 1,
      type: 'downloads.cancel',
      requestId: requestId(),
      taskId,
    })
      .then((tasks) => dispatch({ type: 'tasks', tasks }))
      .catch(reportFailure);
  };

  const retryDownload = (task: DownloadTask): void => {
    const input: DownloadTaskInput = {
      origin: task.origin,
      coursePk1: task.coursePk1,
      contentPk1: task.contentPk1,
      attachmentPk1: task.attachmentPk1,
      sourceFileName: task.sourceFileName,
      targetPath: task.targetPath,
    };
    void enqueue([input]).catch(reportFailure);
  };

  const didHomeSync = useRef(false);
  useEffect(() => {
    if (didHomeSync.current) return;
    if (!isHome || state.loading || state.courses.length === 0) return;
    didHomeSync.current = true;
    if (state.tracked.size === 0) return;
    void send<CourseTrackingSnapshot>({
      v: 1,
      type: 'courses.tracking.get',
      requestId: requestId(),
    }).then((tracking) => {
      if (Date.now() - tracking.lastHomeSyncAt < HOME_SYNC_MIN_INTERVAL_MS) {
        return;
      }
      syncTracked(state.courses);
    });
  }, [isHome, state.courses, state.loading, state.tracked, syncTracked]);

  if (state.collapsed) {
    return (
      <button
        type="button"
        className="fixed top-24 right-0 rounded-l-xl bg-indigo-600 px-3 py-3 text-sm font-semibold text-white shadow-xl hover:bg-indigo-700"
        onClick={() => dispatch({ type: 'collapse', value: false })}
      >
        BB 下载
      </button>
    );
  }

  return (
    <aside className="fixed top-4 right-4 flex h-[calc(100vh-2rem)] w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
      <header className="flex shrink-0 items-start gap-3 bg-slate-950 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-indigo-300">
            Better Blackboard
          </p>
          <h1 className="truncate text-sm font-semibold">
            {context ? (state.course?.name ?? '课程附件') : '跟踪课程'}
          </h1>
        </div>
        <button
          type="button"
          aria-label="收起侧栏"
          className="rounded px-2 py-1 text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={() => dispatch({ type: 'collapse', value: true })}
        >
          —
        </button>
      </header>

      {state.notice && (
        <div
          role="status"
          className={`flex shrink-0 items-start gap-2 px-4 py-2 text-xs ${
            state.notice.tone === 'error'
              ? 'bg-red-50 text-red-800'
              : 'bg-indigo-50 text-indigo-800'
          }`}
        >
          <span className="min-w-0 flex-1 break-words">
            {state.notice.message}
          </span>
          <button
            type="button"
            aria-label="关闭提示"
            className="shrink-0 opacity-60 hover:opacity-100"
            onClick={() => dispatch({ type: 'notice', notice: null })}
          >
            ✕
          </button>
        </div>
      )}

      {state.loading && (
        <div className="min-h-0 flex-1 space-y-3 p-4">
          <div className="h-4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-slate-200" />
        </div>
      )}

      {state.loadError && (
        <div className="min-h-0 flex-1 p-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {state.loadError}
          </div>
        </div>
      )}

      {!state.loading && !state.loadError && !context && (
        <>
          <div className="flex shrink-0 border-b border-slate-200">
            <button
              type="button"
              className={`flex-1 px-4 py-2.5 text-sm font-medium ${
                state.viewMode === 'files'
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => dispatch({ type: 'setViewMode', mode: 'files' })}
            >
              课程跟踪
            </button>
            <button
              type="button"
              className={`flex-1 px-4 py-2.5 text-sm font-medium ${
                state.viewMode === 'ddl'
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => dispatch({ type: 'setViewMode', mode: 'ddl' })}
            >
              DDL聚合
            </button>
          </div>

          {state.viewMode === 'files' ? (
            <CourseTracker
              courses={state.courses}
              tracked={state.tracked}
              busyPk1={state.busyPk1}
              syncing={state.syncing}
              onToggle={toggleTrack}
              onSyncNow={() => syncTracked(state.courses)}
              onDownloadWholeCourse={downloadWholeCourse}
            />
          ) : (
            <div className="flex-1 overflow-hidden">
              <DDLSection
                assignments={state.ddlAssignments}
                loading={state.ddlLoading}
                onRefresh={loadDDL}
                lastRefresh={state.ddlLastRefresh}
              />
            </div>
          )}
        </>
      )}

      {!state.loading && !state.loadError && context && (
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="flex shrink-0 cursor-pointer items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={state.tracked.has(context.coursePk1)}
              disabled={state.busyPk1 !== null}
              onChange={(event) => {
                const course =
                  state.course ??
                  state.courses.find((item) => item.pk1 === context.coursePk1);
                if (!course) return;
                toggleTrack(course, event.target.checked);
              }}
            />
            跟踪本课，主菜单打开时自动补新文件
          </label>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <button
              type="button"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              onClick={() =>
                dispatch({
                  type: 'toggle',
                  keys: allKeys,
                  selected: !allSelected,
                })
              }
            >
              {allSelected ? '取消全选' : `全选 ${allKeys.length} 个文件`}
            </button>
            <span className="text-xs text-slate-500">
              已选 {state.selected.size}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {state.nodes.length > 0 ? (
              <ContentTree
                nodes={state.nodes}
                keyIndex={keyIndex}
                selected={state.selected}
                onToggle={(keys, selected) =>
                  dispatch({ type: 'toggle', keys, selected })
                }
              />
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                当前内容区没有可显示的项目
              </p>
            )}
          </div>
          {state.showingDiff && state.diffPreview ? (
            <div className="shrink-0 border-t border-slate-200 p-3">
              <DiffPreviewComponent
                preview={state.diffPreview}
                onDownload={startDownloadWithDiff}
                onCancel={() => dispatch({ type: 'hideDiff' })}
                onForceFullSync={forceFullSync}
              />
            </div>
          ) : (
            <div className="shrink-0 border-t border-slate-200 p-3">
              <button
                type="button"
                disabled={state.selected.size === 0}
                className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={startDownload}
              >
                增量下载
              </button>
            </div>
          )}
        </div>
      )}

      <DownloadPanel
        tasks={currentTasks}
        onCancel={cancelDownload}
        onRetry={retryDownload}
      />
    </aside>
  );
}
