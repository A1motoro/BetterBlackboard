import { describe, it, expect } from 'vitest';
import type { Attachment, ContentNode } from '../src/core/types';
import {
  computeAttachmentFingerprint,
  collectAttachmentFingerprints,
  createContentSnapshot,
  fingerprintsEqual,
  fingerprintKey,
  buildFingerprintIndex,
} from '../src/core/fingerprint';

describe('fingerprint', () => {
  const mockAttachment: Attachment = {
    pk1: '_att_123_1',
    contentPk1: '_content_456_1',
    fileName: 'lecture1.pdf',
    mimeType: 'application/pdf',
  };

  describe('computeAttachmentFingerprint', () => {
    it('should create fingerprint with all fields', () => {
      const fp = computeAttachmentFingerprint(mockAttachment);

      expect(fp.attachmentPk1).toBe('_att_123_1');
      expect(fp.contentPk1).toBe('_content_456_1');
      expect(fp.fileName).toBe('lecture1.pdf');
      expect(fp.mimeType).toBe('application/pdf');
      expect(fp.timestamp).toBeGreaterThan(0);
    });

    it('should handle attachment without mimeType', () => {
      const attachment: Attachment = {
        pk1: '_att_999_1',
        contentPk1: '_content_999_1',
        fileName: 'unknown.bin',
      };

      const fp = computeAttachmentFingerprint(attachment);

      expect(fp.mimeType).toBeUndefined();
      expect(fp.fileName).toBe('unknown.bin');
    });
  });

  describe('collectAttachmentFingerprints', () => {
    it('should collect fingerprints from flat node list', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_node_1_1',
          title: 'Node 1',
          handlerId: 'resource/x-bb-file',
          hasChildren: false,
          children: [],
          attachments: [mockAttachment],
          unsupported: false,
        },
        {
          pk1: '_node_2_1',
          title: 'Node 2',
          handlerId: 'resource/x-bb-file',
          hasChildren: false,
          children: [],
          attachments: [
            {
              pk1: '_att_789_1',
              contentPk1: '_content_789_1',
              fileName: 'lecture2.pdf',
            },
          ],
          unsupported: false,
        },
      ];

      const fingerprints = collectAttachmentFingerprints(nodes);

      expect(fingerprints).toHaveLength(2);
      expect(fingerprints[0]?.fileName).toBe('lecture1.pdf');
      expect(fingerprints[1]?.fileName).toBe('lecture2.pdf');
    });

    it('should collect fingerprints from nested tree', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_folder_1_1',
          title: 'Week 1',
          handlerId: 'resource/x-bb-folder',
          hasChildren: true,
          children: [
            {
              pk1: '_file_1_1',
              title: 'Lecture',
              handlerId: 'resource/x-bb-file',
              hasChildren: false,
              children: [],
              attachments: [mockAttachment],
              unsupported: false,
            },
          ],
          attachments: [],
          unsupported: false,
        },
      ];

      const fingerprints = collectAttachmentFingerprints(nodes);

      expect(fingerprints).toHaveLength(1);
      expect(fingerprints[0]?.fileName).toBe('lecture1.pdf');
    });

    it('should handle empty tree', () => {
      const fingerprints = collectAttachmentFingerprints([]);
      expect(fingerprints).toHaveLength(0);
    });

    it('should handle nodes with multiple attachments', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_doc_1_1',
          title: 'Document',
          handlerId: 'resource/x-bb-document',
          hasChildren: false,
          children: [],
          attachments: [
            mockAttachment,
            {
              pk1: '_att_456_1',
              contentPk1: '_content_456_1',
              fileName: 'lecture1-slides.pdf',
            },
          ],
          unsupported: false,
        },
      ];

      const fingerprints = collectAttachmentFingerprints(nodes);

      expect(fingerprints).toHaveLength(2);
    });
  });

  describe('createContentSnapshot', () => {
    it('should create snapshot with all metadata', () => {
      const nodes: ContentNode[] = [
        {
          pk1: '_node_1_1',
          title: 'Test Node',
          handlerId: 'resource/x-bb-file',
          hasChildren: false,
          children: [],
          attachments: [mockAttachment],
          unsupported: false,
        },
      ];

      const snapshot = createContentSnapshot(
        '_course_123_1',
        '_root_456_1',
        nodes,
      );

      expect(snapshot.coursePk1).toBe('_course_123_1');
      expect(snapshot.rootContentPk1).toBe('_root_456_1');
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.attachments).toHaveLength(1);
    });
  });

  describe('fingerprintsEqual', () => {
    it('should return true for identical fingerprints', () => {
      const fp1 = computeAttachmentFingerprint(mockAttachment);
      const fp2 = computeAttachmentFingerprint(mockAttachment);

      expect(fingerprintsEqual(fp1, fp2)).toBe(true);
    });

    it('should return false if fileName differs', () => {
      const fp1 = computeAttachmentFingerprint(mockAttachment);
      const fp2 = computeAttachmentFingerprint({
        ...mockAttachment,
        fileName: 'different.pdf',
      });

      expect(fingerprintsEqual(fp1, fp2)).toBe(false);
    });

    it('should return false if mimeType differs', () => {
      const fp1 = computeAttachmentFingerprint(mockAttachment);
      const fp2 = computeAttachmentFingerprint({
        ...mockAttachment,
        mimeType: 'text/plain',
      });

      expect(fingerprintsEqual(fp1, fp2)).toBe(false);
    });

    it('should ignore timestamp differences', () => {
      const fp1 = computeAttachmentFingerprint(mockAttachment);
      const fp2 = { ...fp1, timestamp: fp1.timestamp + 1000 };

      expect(fingerprintsEqual(fp1, fp2)).toBe(true);
    });

    it('should handle undefined mimeType correctly', () => {
      const attachment1: Attachment = {
        pk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'file.txt',
      };
      const attachment2: Attachment = {
        pk1: '_att_1_1',
        contentPk1: '_content_1_1',
        fileName: 'file.txt',
        mimeType: 'text/plain',
      };

      const fp1 = computeAttachmentFingerprint(attachment1);
      const fp2 = computeAttachmentFingerprint(attachment2);

      expect(fingerprintsEqual(fp1, fp2)).toBe(false);
    });
  });

  describe('fingerprintKey', () => {
    it('should generate unique key from contentPk1 and attachmentPk1', () => {
      const fp = computeAttachmentFingerprint(mockAttachment);
      const key = fingerprintKey(fp);

      expect(key).toBe('_content_456_1:_att_123_1');
    });

    it('should be consistent for same fingerprint', () => {
      const fp = computeAttachmentFingerprint(mockAttachment);
      const key1 = fingerprintKey(fp);
      const key2 = fingerprintKey(fp);

      expect(key1).toBe(key2);
    });
  });

  describe('buildFingerprintIndex', () => {
    it('should create map keyed by fingerprintKey', () => {
      const fingerprints = [
        computeAttachmentFingerprint(mockAttachment),
        computeAttachmentFingerprint({
          pk1: '_att_789_1',
          contentPk1: '_content_789_1',
          fileName: 'lecture2.pdf',
        }),
      ];

      const index = buildFingerprintIndex(fingerprints);

      expect(index.size).toBe(2);
      expect(index.has('_content_456_1:_att_123_1')).toBe(true);
      expect(index.has('_content_789_1:_att_789_1')).toBe(true);
    });

    it('should handle empty array', () => {
      const index = buildFingerprintIndex([]);
      expect(index.size).toBe(0);
    });

    it('should use last fingerprint if duplicate keys exist', () => {
      const fp1 = computeAttachmentFingerprint(mockAttachment);
      const fp2 = {
        ...fp1,
        fileName: 'updated.pdf',
        timestamp: fp1.timestamp + 1000,
      };

      const index = buildFingerprintIndex([fp1, fp2]);

      expect(index.size).toBe(1);
      const stored = index.get(fingerprintKey(fp1));
      expect(stored?.fileName).toBe('updated.pdf');
    });
  });
});
