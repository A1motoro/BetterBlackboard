import type {
  Attachment,
  ContentNode,
  Course,
  CourseContext,
  DownloadTaskInput,
} from './types';
import {
  buildTargetPath,
  sanitizeSegment,
  shouldFlattenSingleFileFolder,
} from './naming';

export function attachmentKey(attachment: Attachment): string {
  return `${attachment.contentPk1}:${attachment.pk1}`;
}

/**
 * `nodes` are the children of the entry content item, so its own title has to
 * be supplied via `rootFolders` to keep sibling folders from colliding.
 */
export function createDownloadPlan(
  context: CourseContext,
  course: Course,
  nodes: ContentNode[],
  selected: ReadonlySet<string>,
  rootFolders: readonly string[] = [],
): DownloadTaskInput[] {
  const tasks: DownloadTaskInput[] = [];

  const walk = (items: ContentNode[], folders: string[]): void => {
    for (const node of items) {
      for (const attachment of node.attachments) {
        if (!selected.has(attachmentKey(attachment))) continue;
        tasks.push({
          origin: context.origin,
          coursePk1: context.coursePk1,
          contentPk1: attachment.contentPk1,
          attachmentPk1: attachment.pk1,
          sourceFileName: attachment.fileName,
          targetPath: buildTargetPath(
            sanitizeSegment(course.name),
            folders,
            attachment.fileName,
          ),
        });
      }

      if (node.children.length === 0) continue;
      const onlyChild = node.children[0];
      const shouldFlatten =
        onlyChild !== undefined &&
        onlyChild.attachments.length === 1 &&
        shouldFlattenSingleFileFolder(
          node.title,
          onlyChild.attachments[0]?.fileName ?? '',
          node.children.length,
          node.children.filter((child) => child.children.length > 0).length,
        );
      walk(node.children, shouldFlatten ? folders : [...folders, node.title]);
    }
  };

  walk(nodes, [...rootFolders]);
  return tasks;
}

export function createFullDownloadPlan(
  context: CourseContext,
  course: Course,
  nodes: ContentNode[],
): DownloadTaskInput[] {
  return createDownloadPlan(
    context,
    course,
    nodes,
    new Set(collectAttachmentKeys(nodes)),
  );
}

export function excludeKnownPaths(
  tasks: DownloadTaskInput[],
  knownPaths: ReadonlySet<string>,
): DownloadTaskInput[] {
  return tasks.filter((task) => !knownPaths.has(task.targetPath));
}

export function collectAttachmentKeys(nodes: ContentNode[]): string[] {
  const keys: string[] = [];
  const walk = (items: ContentNode[]): void => {
    for (const node of items) {
      keys.push(...node.attachments.map(attachmentKey));
      walk(node.children);
    }
  };
  walk(nodes);
  return keys;
}

/**
 * Precomputes each node's subtree keys once per load; resolving them during
 * render instead makes selection O(n^2) over the whole tree.
 */
export function buildAttachmentKeyIndex(
  nodes: ContentNode[],
): Map<ContentNode, string[]> {
  const index = new Map<ContentNode, string[]>();

  const walk = (node: ContentNode): string[] => {
    const keys = node.attachments.map(attachmentKey);
    for (const child of node.children) keys.push(...walk(child));
    index.set(node, keys);
    return keys;
  };

  for (const node of nodes) walk(node);
  return index;
}
