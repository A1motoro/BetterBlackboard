import { describe, expect, it } from 'vitest';
import {
  buildTargetPath,
  sanitizeSegment,
  shouldFlattenSingleFileFolder,
} from '../src/core/naming';

describe('sanitizeSegment', () => {
  it('替换跨平台非法字符并压缩空白', () => {
    expect(sanitizeSegment(' PHY1001:Mechanics  L01. ')).toBe(
      'PHY1001_Mechanics L01',
    );
  });

  it('处理 Windows 保留名与空目录段', () => {
    expect(sanitizeSegment('CON.pdf')).toBe('_CON.pdf');
    expect(sanitizeSegment('..')).toBe('_');
  });

  it('确定性截断长文件名并保留扩展名', () => {
    const input = `${'章节'.repeat(80)}.pdf`;
    const first = sanitizeSegment(input);
    expect(first).toBe(sanitizeSegment(input));
    expect(first.endsWith('.pdf')).toBe(true);
    expect(Array.from(first).length).toBeLessThanOrEqual(100);
  });
});

describe('folder flattening', () => {
  it('仅拍平唯一且同名的单文件目录', () => {
    expect(
      shouldFlattenSingleFileFolder('Chapter 1', 'chapter   1.pdf', 1, 0),
    ).toBe(true);
    expect(shouldFlattenSingleFileFolder('Chapter 1', 'notes.pdf', 1, 0)).toBe(
      false,
    );
    expect(
      shouldFlattenSingleFileFolder('Chapter 1', 'Chapter 1.pdf', 2, 0),
    ).toBe(false);
  });
});

describe('buildTargetPath', () => {
  it('生成 BB 下的安全相对路径', () => {
    expect(
      buildTargetPath('PHY1001:Mechanics', ['Week 1'], 'Lecture?.pdf'),
    ).toBe('BB/PHY1001_Mechanics/Week 1/Lecture_.pdf');
  });
});
