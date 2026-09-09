import { describe, expect, it } from 'vitest';
import { attachmentKey, createDownloadPlan } from '../src/core/download-plan';
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
});
