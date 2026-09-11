import { describe, expect, it } from 'vitest';
import {
  ALL_ADAPTERS,
  findAdapter,
  getAdapterById,
  getAllowedOrigins,
  isOriginAllowed,
} from '../../src/adapters/registry';
import { cuhkszAdapter } from '../../src/adapters/cuhksz';

describe('Adapter Registry', () => {
  it('包含已注册的 adapters', () => {
    expect(ALL_ADAPTERS.length).toBeGreaterThan(0);
    expect(ALL_ADAPTERS).toContain(cuhkszAdapter);
  });

  it('所有 adapters 都有唯一 ID', () => {
    const ids = ALL_ADAPTERS.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('所有 adapters 都有有效 origin', () => {
    for (const adapter of ALL_ADAPTERS) {
      expect(adapter.origin).toMatch(/^https:\/\//);
      expect(adapter.origin).not.toMatch(/\/$/);
    }
  });

  describe('findAdapter', () => {
    it('通过 URL 找到匹配的 adapter', () => {
      const url = new URL('https://bb.cuhk.edu.cn/webapps/portal/');
      const adapter = findAdapter(url);
      expect(adapter).toBe(cuhkszAdapter);
    });

    it('接受字符串 URL', () => {
      const adapter = findAdapter('https://bb.cuhk.edu.cn/path');
      expect(adapter).toBe(cuhkszAdapter);
    });

    it('不匹配未注册的 origin', () => {
      const url = new URL('https://unknown.edu/path');
      const adapter = findAdapter(url);
      expect(adapter).toBeNull();
    });

    it('不匹配 http (非 https) URL', () => {
      const url = new URL('http://bb.cuhk.edu.cn/path');
      const adapter = findAdapter(url);
      expect(adapter).toBeNull();
    });
  });

  describe('getAdapterById', () => {
    it('通过 ID 找到 adapter', () => {
      const adapter = getAdapterById('cuhksz');
      expect(adapter).toBe(cuhkszAdapter);
    });

    it('不存在的 ID 返回 null', () => {
      const adapter = getAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });
  });

  describe('getAllowedOrigins', () => {
    it('返回所有已注册 adapters 的 origins', () => {
      const origins = getAllowedOrigins();
      expect(origins).toContain('https://bb.cuhk.edu.cn');
      expect(origins.length).toBe(ALL_ADAPTERS.length);
    });

    it('所有 origins 都以 https:// 开头', () => {
      const origins = getAllowedOrigins();
      for (const origin of origins) {
        expect(origin).toMatch(/^https:\/\//);
      }
    });
  });

  describe('isOriginAllowed', () => {
    it('允许已注册的 origin', () => {
      expect(isOriginAllowed('https://bb.cuhk.edu.cn')).toBe(true);
    });

    it('拒绝未注册的 origin', () => {
      expect(isOriginAllowed('https://unknown.edu')).toBe(false);
    });

    it('拒绝 http (非 https)', () => {
      expect(isOriginAllowed('http://bb.cuhk.edu.cn')).toBe(false);
    });

    it('拒绝带路径的 origin', () => {
      expect(isOriginAllowed('https://bb.cuhk.edu.cn/path')).toBe(false);
    });

    it('拒绝带尾部斜杠的 origin', () => {
      expect(isOriginAllowed('https://bb.cuhk.edu.cn/')).toBe(false);
    });
  });
});
