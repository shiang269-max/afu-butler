import { describe, it, expect } from 'vitest';
import { buildFamilyMemoryResponse } from './family-memory-response';

describe('Memory 2.0 Response Adapter', () => {
  it('新增記憶回覆清楚顯示內容', () => {
    const reply = buildFamilyMemoryResponse({
      type: 'memory_added',
      memory: {
        id: 'm1',
        subject: '爸爸',
        content: '不吃香菜',
        tags: ['飲食'],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    });

    expect(reply).toContain('爸爸');
    expect(reply).toContain('不吃香菜');
  });

  it('查詢記憶以編號列出', () => {
    const reply = buildFamilyMemoryResponse({
      type: 'memories_found',
      memories: [
        {
          id: 'm1',
          subject: '爸爸',
          content: '不吃香菜',
          tags: [],
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'm2',
          subject: '媽媽',
          content: '喜歡無糖茶',
          tags: [],
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });

    expect(reply).toContain('1. 爸爸：不吃香菜');
    expect(reply).toContain('2. 媽媽：喜歡無糖茶');
  });

  it('沒有足夠平均資料時不假造數值', () => {
    const reply = buildFamilyMemoryResponse({
      type: 'average',
      result: {
        count: 0,
        average: null,
      },
    });

    expect(reply).toContain('沒有足夠的數值紀錄');
  });

  it('趨勢不足時不假造方向', () => {
    const reply = buildFamilyMemoryResponse({
      type: 'trend',
      result: {
        count: 1,
        first: null,
        latest: null,
        change: null,
        direction: '資料不足',
      },
    });

    expect(reply).toContain('沒有足夠的數值紀錄');
  });

  it('多筆忘記候選不得直接刪除', () => {
    const reply = buildFamilyMemoryResponse({
      type: 'ambiguous_forget',
      memories: [
        {
          id: 'm1',
          subject: '爸爸',
          content: '喜歡咖啡',
          tags: [],
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'm2',
          subject: '媽媽',
          content: '喜歡咖啡',
          tags: [],
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });

    expect(reply).toContain('找到多筆可能的記憶');
    expect(reply).toContain('1.');
    expect(reply).toContain('2.');
  });
});
