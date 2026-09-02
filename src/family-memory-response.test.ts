import {
  buildFamilyMemoryResponse,
} from './family-memory-response';

function assert(
  condition: unknown,
  message: string,
): void {
  if (!condition) {
    throw new Error(message);
  }
}

function test(
  name: string,
  run: () => void,
): void {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('新增記憶回覆清楚顯示內容', () => {
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

  assert(
    reply.includes('爸爸') && reply.includes('不吃香菜'),
    '新增記憶回覆應包含 subject / content',
  );
});

test('查詢記憶以編號列出', () => {
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

  assert(
    reply.includes('1. 爸爸：不吃香菜') &&
      reply.includes('2. 媽媽：喜歡無糖茶'),
    '查詢結果應列出編號與內容',
  );
});

test('沒有足夠平均資料時不假造數值', () => {
  const reply = buildFamilyMemoryResponse({
    type: 'average',
    result: {
      count: 0,
      average: null,
    },
  });

  assert(
    reply.includes('沒有足夠的數值紀錄'),
    '平均值不足時應明確表示資料不足',
  );
});

test('趨勢不足時不假造方向', () => {
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

  assert(
    reply.includes('沒有足夠的數值紀錄'),
    '趨勢不足時應明確表示資料不足',
  );
});

test('多筆忘記候選不得直接刪除', () => {
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

  assert(
    reply.includes('找到多筆可能的記憶') &&
      reply.includes('1.') &&
      reply.includes('2.'),
    '多筆刪除候選應改為列出候選，不得假裝已刪除',
  );
});

console.log('Memory 2.0 Response Adapter 測試完成');
