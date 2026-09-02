import { describe, expect, it } from 'vitest';
import { resolveFamilyMemorySubject } from './family-memory-subject';

describe('Memory 2.0 發話者身份解析', () => {
  const fatherUserId = 'U59a66400a022a3ca71623a459b47ca56';

  it('我應解析成實際發話者爸爸', () => {
    expect(
      resolveFamilyMemorySubject('我', fatherUserId),
    ).toBe('爸爸');
  });

  it('未指定人物應解析成實際發話者爸爸', () => {
    expect(
      resolveFamilyMemorySubject(undefined, fatherUserId),
    ).toBe('爸爸');
  });

  it('明確指定媽媽不得被發話者覆蓋', () => {
    expect(
      resolveFamilyMemorySubject('媽媽', fatherUserId),
    ).toBe('媽媽');
  });

  it('未知 userId 不應猜測身份', () => {
    expect(
      resolveFamilyMemorySubject('我', 'unknown-user'),
    ).toBe('我');
  });
});
