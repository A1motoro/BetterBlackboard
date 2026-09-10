import type { CourseTrackingSnapshot } from '../core/courses';

const STORAGE_KEY = 'courseTracking';

export class CourseTrackingStore {
  private tracked = new Set<string>();
  private names = new Map<string, string>();
  private paths = new Set<string>();
  private lastHomeSyncAt = 0;
  private ready?: Promise<void>;

  init(): Promise<void> {
    this.ready ??= this.load();
    return this.ready;
  }

  snapshot(): CourseTrackingSnapshot {
    return {
      trackedPk1s: [...this.tracked],
      names: Object.fromEntries(this.names),
      downloadedPaths: [...this.paths],
      lastHomeSyncAt: this.lastHomeSyncAt,
    };
  }

  isTracked(coursePk1: string): boolean {
    return this.tracked.has(coursePk1);
  }

  has(path: string): boolean {
    return this.paths.has(path);
  }

  async setTracked(
    coursePk1: string,
    tracked: boolean,
    name?: string,
  ): Promise<CourseTrackingSnapshot> {
    await this.init();
    if (tracked) {
      this.tracked.add(coursePk1);
      if (name) this.names.set(coursePk1, name);
    } else {
      this.tracked.delete(coursePk1);
    }
    await this.persist();
    return this.snapshot();
  }

  async remember(path: string): Promise<void> {
    await this.init();
    if (this.paths.has(path)) return;
    this.paths.add(path);
    await this.persist();
  }

  async markHomeSynced(at = Date.now()): Promise<CourseTrackingSnapshot> {
    await this.init();
    this.lastHomeSyncAt = at;
    await this.persist();
    return this.snapshot();
  }

  private async load(): Promise<void> {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY] as
      Partial<CourseTrackingSnapshot> | undefined;
    if (!raw || typeof raw !== 'object') return;
    this.tracked = new Set(
      Array.isArray(raw.trackedPk1s) ? raw.trackedPk1s.filter(isString) : [],
    );
    this.paths = new Set(
      Array.isArray(raw.downloadedPaths)
        ? raw.downloadedPaths.filter(isString)
        : [],
    );
    this.lastHomeSyncAt =
      typeof raw.lastHomeSyncAt === 'number' ? raw.lastHomeSyncAt : 0;
    this.names = new Map(
      Object.entries(raw.names ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }

  private persist(): Promise<void> {
    return browser.storage.local.set({ [STORAGE_KEY]: this.snapshot() });
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
