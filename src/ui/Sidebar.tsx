import { useEffect, useMemo, useReducer } from 'react';
import { parseCourseContext } from '../adapters/cuhksz';
import {
  collectAttachmentKeys,
  createDownloadPlan,
} from '../core/download-plan';
import {
  BbError,
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
  requestId,
  type DownloadSnapshotEvent,
  type ExtensionRequest,
  type ExtensionResponse,
} from '../infrastructure/messages';
import { ContentTree } from './ContentTree';
import { DownloadPanel } from './DownloadPanel';

interface State {
  loading: boolean;
  collapsed: boolean;
  nodes: ContentNode[];
  selected: Set<string>;
  tasks: DownloadTask[];
  course: Course | null;
  error: string | null;
}

type Action =
  | { type: 'loaded'; course: Course; nodes: ContentNode[] }
  | { type: 'failed'; message: string }
  | { type: 'toggle'; keys: string[]; selected: boolean }
  | { type: 'tasks'; tasks: DownloadTask[] }
  | { type: 'collapse'; value: boolean };

const initialState: State = {
  loading: true,
  collapsed: false,
  nodes: [],
  selected: new Set(),
  tasks: [],
  course: null,
  error: null,
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
        error: null,
      };
    case 'failed':
      return { ...state, loading: false, error: action.message };
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
  }
}

async function send<T>(message: ExtensionRequest): Promise<T> {
  const response: ExtensionResponse<T> =
    await browser.runtime.sendMessage(message);
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

export function Sidebar() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const context = useMemo(
    () => parseCourseContext(new URL(window.location.href)),
    [],
  );

  useEffect(() => {
    const listener = (message: unknown) => {
      const event = message as Partial<DownloadSnapshotEvent>;
      if (
        event.v === 1 &&
        event.type === 'downloads.snapshot' &&
        Array.isArray(event.tasks)
      ) {
        dispatch({ type: 'tasks', tasks: event.tasks });
      }
    };
    browser.runtime.onMessage.addListener(listener);

    const refresh = () => {
      void send<DownloadTask[]>({
        v: 1,
        type: 'downloads.snapshot.get',
        requestId: requestId(),
      })
        .then((tasks) => dispatch({ type: 'tasks', tasks }))
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 1_200);

    return () => {
      window.clearInterval(timer);
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    if (!context) {
      dispatch({
        type: 'failed',
        message:
          '请打开包含 course_id 和 content_id 的 Blackboard 课程内容页。',
      });
      return;
    }

    const controller = new AbortController();
    const transport = new FallbackApiTransport(
      new FetchApiTransport(context.origin),
      new BackgroundApiTransport(context.origin),
    );
    const client = new BlackboardClient(transport);

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
  }, [context]);

  const currentTasks = context
    ? state.tasks.filter((task) => task.coursePk1 === context.coursePk1)
    : [];
  const allKeys = collectAttachmentKeys(state.nodes);
  const allSelected =
    allKeys.length > 0 && allKeys.every((key) => state.selected.has(key));

  const enqueue = async (tasks: DownloadTaskInput[]): Promise<void> => {
    if (tasks.length === 0) return;
    const snapshot = await send<DownloadTask[]>({
      v: 1,
      type: 'downloads.enqueue',
      requestId: requestId(),
      tasks,
    });
    dispatch({ type: 'tasks', tasks: snapshot });
  };

  const startDownload = async (): Promise<void> => {
    if (!context || !state.course) return;
    await enqueue(
      createDownloadPlan(context, state.course, state.nodes, state.selected),
    ).catch((error: unknown) =>
      dispatch({ type: 'failed', message: errorMessage(error) }),
    );
  };

  const cancelDownload = async (taskId: string): Promise<void> => {
    const snapshot = await send<DownloadTask[]>({
      v: 1,
      type: 'downloads.cancel',
      requestId: requestId(),
      taskId,
    });
    dispatch({ type: 'tasks', tasks: snapshot });
  };

  const retryDownload = async (task: DownloadTask): Promise<void> => {
    const input: DownloadTaskInput = {
      origin: task.origin,
      coursePk1: task.coursePk1,
      contentPk1: task.contentPk1,
      attachmentPk1: task.attachmentPk1,
      sourceFileName: task.sourceFileName,
      targetPath: task.targetPath,
    };
    await enqueue([input]);
  };

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
    <aside className="fixed top-4 right-4 flex max-h-[calc(100vh-2rem)] w-[390px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
      <header className="flex items-start gap-3 bg-slate-950 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-indigo-300">
            Better Blackboard
          </p>
          <h1 className="truncate text-sm font-semibold">
            {state.course?.name ?? '课程附件'}
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

      {state.loading && (
        <div className="space-y-3 p-4">
          <div className="h-4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-slate-200" />
        </div>
      )}

      {state.error && (
        <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </div>
      )}

      {!state.loading && !state.error && (
        <>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
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
          <div className="border-t border-slate-200 p-3">
            <button
              type="button"
              disabled={state.selected.size === 0}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              onClick={startDownload}
            >
              下载所选文件
            </button>
          </div>
        </>
      )}

      <DownloadPanel
        tasks={currentTasks}
        onCancel={(taskId) => void cancelDownload(taskId)}
        onRetry={(task) => void retryDownload(task)}
      />
    </aside>
  );
}
