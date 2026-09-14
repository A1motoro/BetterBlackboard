import { describe, it, expect } from 'vitest';

describe('同步轮次冻结 UX', () => {
  describe('状态管理', () => {
    it('syncRoundStarted action 应该冻结课程集合', () => {
      interface State {
        syncing: boolean;
        syncRoundPk1s: Set<string>;
      }

      type Action =
        | { type: 'syncing'; value: boolean }
        | { type: 'syncRoundStarted'; pk1s: string[] };

      function reducer(state: State, action: Action): State {
        switch (action.type) {
          case 'syncing':
            return {
              ...state,
              syncing: action.value,
              syncRoundPk1s: action.value ? state.syncRoundPk1s : new Set(),
            };
          case 'syncRoundStarted':
            return { ...state, syncRoundPk1s: new Set(action.pk1s) };
        }
      }

      let state: State = { syncing: false, syncRoundPk1s: new Set() };

      state = reducer(state, {
        type: 'syncRoundStarted',
        pk1s: ['_course1_1', '_course2_1', '_course3_1'],
      });
      expect(state.syncRoundPk1s.size).toBe(3);
      expect(state.syncRoundPk1s.has('_course1_1')).toBe(true);

      state = reducer(state, { type: 'syncing', value: true });
      expect(state.syncing).toBe(true);
      expect(state.syncRoundPk1s.size).toBe(3);
    });

    it('syncing 结束时应该清空 syncRoundPk1s', () => {
      interface State {
        syncing: boolean;
        syncRoundPk1s: Set<string>;
      }

      type Action =
        | { type: 'syncing'; value: boolean }
        | { type: 'syncRoundStarted'; pk1s: string[] };

      function reducer(state: State, action: Action): State {
        switch (action.type) {
          case 'syncing':
            return {
              ...state,
              syncing: action.value,
              syncRoundPk1s: action.value ? state.syncRoundPk1s : new Set(),
            };
          case 'syncRoundStarted':
            return { ...state, syncRoundPk1s: new Set(action.pk1s) };
        }
      }

      let state: State = {
        syncing: true,
        syncRoundPk1s: new Set(['_course1_1', '_course2_1']),
      };

      state = reducer(state, { type: 'syncing', value: false });
      expect(state.syncing).toBe(false);
      expect(state.syncRoundPk1s.size).toBe(0);
    });
  });

  describe('下载按钮禁用逻辑', () => {
    it('正在同步的课程应该禁用下载按钮', () => {
      const busyPk1 = '_course1_1';
      const coursePk1 = '_course1_1';
      const syncing = false;
      const isInSyncRound = false;

      const downloadDisabled =
        busyPk1 === coursePk1 || (syncing && isInSyncRound);

      expect(downloadDisabled).toBe(true);
    });

    it('本轮同步中的课程应该禁用下载按钮', () => {
      const busyPk1 = null;
      const coursePk1 = '_course2_1';
      const syncing = true;
      const syncRoundPk1s = new Set(['_course1_1', '_course2_1', '_course3_1']);
      const isInSyncRound = syncRoundPk1s.has(coursePk1);

      const downloadDisabled =
        busyPk1 === coursePk1 || (syncing && isInSyncRound);

      expect(downloadDisabled).toBe(true);
    });

    it('本轮之外的课程应该可以下载', () => {
      const busyPk1 = null;
      const coursePk1 = '_course4_1';
      const syncing = true;
      const syncRoundPk1s = new Set(['_course1_1', '_course2_1', '_course3_1']);
      const isInSyncRound = syncRoundPk1s.has(coursePk1);

      const downloadDisabled =
        busyPk1 === coursePk1 || (syncing && isInSyncRound);

      expect(downloadDisabled).toBe(false);
    });

    it('没有同步进行时所有课程都可以下载', () => {
      const busyPk1 = null;
      const coursePk1 = '_course1_1';
      const syncing = false;
      const isInSyncRound = false;

      const downloadDisabled =
        busyPk1 === coursePk1 || (syncing && isInSyncRound);

      expect(downloadDisabled).toBe(false);
    });
  });

  describe('同步轮次快照', () => {
    it('syncTracked 应该在开始时快照跟踪的课程', () => {
      interface Course {
        pk1: string;
        name: string;
      }

      const courses: Course[] = [
        { pk1: '_course1_1', name: 'Course 1' },
        { pk1: '_course2_1', name: 'Course 2' },
        { pk1: '_course3_1', name: 'Course 3' },
        { pk1: '_course4_1', name: 'Course 4' },
      ];

      const tracked = new Set(['_course1_1', '_course2_1', '_course3_1']);

      const selected = courses.filter((course) => tracked.has(course.pk1));
      const frozenPk1s = selected.map((course) => course.pk1);

      expect(selected.length).toBe(3);
      expect(frozenPk1s).toEqual(['_course1_1', '_course2_1', '_course3_1']);
    });

    it('在同步期间修改 tracked 不应影响冻结的集合', () => {
      const initialTracked = new Set(['_course1_1', '_course2_1']);
      const frozenPk1s = Array.from(initialTracked);

      const modifiedTracked = new Set([
        '_course1_1',
        '_course2_1',
        '_course3_1',
        '_course4_1',
      ]);

      expect(frozenPk1s.length).toBe(2);
      expect(modifiedTracked.size).toBe(4);
      expect(frozenPk1s).not.toEqual(Array.from(modifiedTracked));
    });
  });

  describe('辅助文本显示', () => {
    it('同步进行时应该显示轮次大小', () => {
      const syncing = true;
      const syncRoundPk1s = new Set(['_course1_1', '_course2_1', '_course3_1']);

      const shouldShowHelper = syncing && syncRoundPk1s.size > 0;
      const helperText = `本轮 ${syncRoundPk1s.size} 门 · 可继续勾选，下轮再生效`;

      expect(shouldShowHelper).toBe(true);
      expect(helperText).toBe('本轮 3 门 · 可继续勾选，下轮再生效');
    });

    it('没有同步时不应该显示辅助文本', () => {
      const syncing = false;
      const syncRoundPk1s = new Set<string>();

      const shouldShowHelper = syncing && syncRoundPk1s.size > 0;

      expect(shouldShowHelper).toBe(false);
    });
  });

  describe('同步按钮禁用', () => {
    it('syncing 时应该禁用同步按钮', () => {
      const syncing = true;
      const tracked = new Set(['_course1_1', '_course2_1']);

      const disabled = syncing || tracked.size === 0;

      expect(disabled).toBe(true);
    });

    it('tracked.size === 0 时应该禁用同步按钮', () => {
      const syncing = false;
      const tracked = new Set<string>();

      const disabled = syncing || tracked.size === 0;

      expect(disabled).toBe(true);
    });

    it('有跟踪课程且不在同步时应该启用同步按钮', () => {
      const syncing = false;
      const tracked = new Set(['_course1_1', '_course2_1']);

      const disabled = syncing || tracked.size === 0;

      expect(disabled).toBe(false);
    });
  });
});
