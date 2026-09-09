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

export function createDownloadPlan(
  context: CourseContext,
  course: Course,
  nodes: ContentNode[],
  selected: ReadonlySet<string>,
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

  walk(nodes, []);
  return tasks;
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
