import { describe, expect, it } from 'vitest';
import {
  attachmentKey,
  buildAttachmentKeyIndex,
  collectAttachmentKeys,
  createDownloadPlan,
} from '../src/core/download-plan';
import type {
  Attachment,
  ContentNode,
  Course,
  CourseContext,
} from '../src/core/types';

const context: CourseContext = {
  origin: 'https://bb.cuhk.edu.cn',
  coursePk1: '_1_1',
  contentPk1: '_root_1',
};

const course: Course = {
  pk1: '_1_1',
  batchUid: 'PHY1001',
  name: 'PHY1001:Mechanics',
  ultraStatus: 'Classic',
};

function fileNode(
  pk1: string,
  title: string,
  attachment: Attachment,
): ContentNode {
  return {
    pk1,
    title,
    handlerId: 'resource/x-bb-file',
    hasChildren: false,
    children: [],
    attachments: [attachment],
    unsupported: false,
  };
}

describe('createDownloadPlan', () => {
  it('只生成已选择附件并保留目录', () => {
    const attachment: Attachment = {
      pk1: '_att_1',
      contentPk1: '_file_1',
      fileName: 'Lecture.pdf',
    };
    const nodes: ContentNode[] = [
      {
        pk1: '_folder_1',
        title: 'Week 1',
        handlerId: 'resource/x-bb-folder',
        hasChildren: true,
        attachments: [],
        unsupported: false,
        children: [fileNode('_file_1', 'Lecture', attachment)],
      },
    ];

    const plan = createDownloadPlan(
      context,
      course,
      nodes,
      new Set([attachmentKey(attachment)]),
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]?.targetPath).toBe('BB/PHY1001_Mechanics/Week 1/Lecture.pdf');
  });

  it('拍平确定性的同名单文件目录', () => {
    const attachment: Attachment = {
      pk1: '_att_2',
      contentPk1: '_file_2',
      fileName: 'Chapter 1.pdf',
    };
    const nodes: ContentNode[] = [
      {
        pk1: '_folder_2',
        title: 'Chapter 1',
        handlerId: 'resource/x-bb-folder',
        hasChildren: true,
        attachments: [],
        unsupported: false,
        children: [fileNode('_file_2', 'Chapter 1', attachment)],
      },
    ];

    const [task] = createDownloadPlan(
      context,
      course,
      nodes,
      new Set([attachmentKey(attachment)]),
    );
    expect(task?.targetPath).toBe('BB/PHY1001_Mechanics/Chapter 1.pdf');
  });

  it('用 rootFolders 保留入口目录，避免同名文件互相覆盖', () => {
    const build = (folder: string, pk1: string) => {
      const attachment: Attachment = {
        pk1: `_att_${pk1}`,
        contentPk1: `_file_${pk1}`,
        fileName: 'slides.pdf',
      };
      const nodes = [fileNode(`_file_${pk1}`, 'Slides', attachment)];
      return createDownloadPlan(
        context,
        course,
        nodes,
        new Set([attachmentKey(attachment)]),
        [folder],
      );
    };

    expect(build('Week 1', '1')[0]?.targetPath).toBe(
      'BB/PHY1001_Mechanics/Week 1/slides.pdf',
    );
    expect(build('Week 2', '2')[0]?.targetPath).toBe(
      'BB/PHY1001_Mechanics/Week 2/slides.pdf',
    );
  });
});

describe('buildAttachmentKeyIndex', () => {
  it('每个节点都映射到自身子树的全部附件 key', () => {
    const leafAttachment: Attachment = {
      pk1: '_att_leaf',
      contentPk1: '_file_leaf',
      fileName: 'Deep.pdf',
    };
    const ownAttachment: Attachment = {
      pk1: '_att_own',
      contentPk1: '_folder_1',
      fileName: 'Syllabus.pdf',
    };
    const leaf = fileNode('_file_leaf', 'Deep', leafAttachment);
    const folder: ContentNode = {
      pk1: '_folder_1',
      title: 'Week 1',
      handlerId: 'resource/x-bb-folder',
      hasChildren: true,
      attachments: [ownAttachment],
      unsupported: false,
      children: [leaf],
    };

    const index = buildAttachmentKeyIndex([folder]);
    expect(index.get(folder)).toEqual([
      attachmentKey(ownAttachment),
      attachmentKey(leafAttachment),
    ]);
    expect(index.get(leaf)).toEqual([attachmentKey(leafAttachment)]);
    expect(index.get(folder)).toEqual(collectAttachmentKeys([folder]));
  });
});
