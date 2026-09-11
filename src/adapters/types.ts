import type { Course } from '../core/types';

/**
 * SchoolAdapter defines the contract for adding Blackboard support for a new school.
 *
 * Each school adapter encapsulates:
 * - URL matching (identifying whether a page belongs to this school)
 * - Course context parsing (extracting course/content IDs from URLs)
 * - API configuration (base path for REST API endpoints)
 * - Naming conventions (how to name course folders)
 * - Optional fallback resource extraction (HTML scraping if REST API is insufficient)
 *
 * ## Adding a New School
 *
 * 1. Create a new adapter file in `src/adapters/` (e.g., `myschool.ts`)
 * 2. Implement the `SchoolAdapter` interface
 * 3. Register the adapter in `src/adapters/registry.ts`
 * 4. Add the school's origin to `optional_host_permissions` in `wxt.config.ts`
 * 5. Add test fixtures for the school's API responses
 * 6. Document any known limitations or API quirks
 *
 * ## Example
 *
 * ```ts
 * export const mySchoolAdapter: SchoolAdapter = {
 *   id: 'myschool',
 *   displayName: 'My School',
 *   origin: 'https://bb.myschool.edu',
 *   matches: (url) => url.origin === 'https://bb.myschool.edu',
 *   apiBasePath: '/learn/api/public/v1',
 *   parseCourseContext: (url) => {
 *     const coursePk1 = url.searchParams.get('course_id');
 *     const contentPk1 = url.searchParams.get('content_id');
 *     if (!coursePk1 || !contentPk1) return null;
 *     return { origin: url.origin, coursePk1, contentPk1 };
 *   },
 *   courseFolderName: (course) => sanitizeSegment(course.name),
 * };
 * ```
 *
 * ## Notes
 *
 * - `matches()` must be deterministic and fast (called on every page load)
 * - `parseCourseContext()` should return `null` for non-course pages (home, settings, etc.)
 * - `apiBasePath` is typically `/learn/api/public/v1` for standard Blackboard instances
 * - `extractFallbackResources()` is optional; only implement if REST API is insufficient
 * - Never hardcode credentials or session tokens in adapters
 * - All adapters must support the same REST API contract (see infrastructure/blackboard/client.ts)
 */
export interface SchoolAdapter {
  /**
   * Unique identifier for this adapter.
   * Used for configuration storage and logging.
   * Must be lowercase ASCII and URL-safe.
   */
  id: string;

  /**
   * Human-readable name displayed in UI.
   */
  displayName: string;

  /**
   * The canonical origin of the school's Blackboard instance.
   * Used for permission requests and URL validation.
   * Must include protocol (https://) and no trailing slash.
   */
  origin: string;

  /**
   * Check if a given URL belongs to this school's Blackboard instance.
   * @param url The URL to test
   * @returns true if this adapter should handle the URL
   */
  matches(url: URL): boolean;

  /**
   * Base path for Blackboard REST API endpoints.
   * Typically `/learn/api/public/v1` for standard instances.
   */
  apiBasePath: string;

  /**
   * Parse course context from a Blackboard content page URL.
   * @param url The page URL
   * @returns CourseContext if the URL is a valid course content page, null otherwise
   */
  parseCourseContext(url: URL): CourseContext | null;

  /**
   * Generate the folder name for a course.
   * The returned string should already be sanitized for filesystem use.
   * @param course The course object
   * @returns Folder name for the course
   */
  courseFolderName(course: Course): string;

  /**
   * Optional: Extract download resources from HTML body content.
   * Only implement this if the REST API does not provide sufficient attachment metadata.
   * @param node The content node with HTML body
   * @returns Array of resources found in the HTML
   */
  extractFallbackResources?(node: {
    pk1: string;
    title: string;
    body?: string;
  }): Array<{
    url: string;
    fileName: string;
  }>;
}

/**
 * CourseContext identifies a specific course content page.
 */
export interface CourseContext {
  origin: string;
  coursePk1: string;
  contentPk1: string;
}
