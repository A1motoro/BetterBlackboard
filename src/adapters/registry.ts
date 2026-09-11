import type { SchoolAdapter } from './types';
import { cuhkszAdapter } from './cuhksz';

/**
 * Registry of all supported school adapters.
 *
 * To add a new school:
 * 1. Create an adapter file implementing SchoolAdapter
 * 2. Import and add it to this array
 * 3. Add the school's origin to wxt.config.ts optional_host_permissions
 * 4. Add test fixtures and documentation
 */
export const ALL_ADAPTERS: readonly SchoolAdapter[] = [cuhkszAdapter];

/**
 * Find the adapter that matches a given URL.
 * @param url The URL to match
 * @returns The matching adapter, or null if no adapter matches
 */
export function findAdapter(url: URL | string): SchoolAdapter | null {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  return ALL_ADAPTERS.find((adapter) => adapter.matches(parsed)) ?? null;
}

/**
 * Get an adapter by its ID.
 * @param id The adapter ID
 * @returns The adapter, or null if not found
 */
export function getAdapterById(id: string): SchoolAdapter | null {
  return ALL_ADAPTERS.find((adapter) => adapter.id === id) ?? null;
}

/**
 * Get all allowed origins from registered adapters.
 * Used for permission validation and origin allowlisting.
 * @returns Array of allowed origins
 */
export function getAllowedOrigins(): string[] {
  return ALL_ADAPTERS.map((adapter) => adapter.origin);
}

/**
 * Check if an origin is allowed by any registered adapter.
 * @param origin The origin to check (must include protocol, no trailing slash)
 * @returns true if the origin is allowed
 */
export function isOriginAllowed(origin: string): boolean {
  return getAllowedOrigins().includes(origin);
}
