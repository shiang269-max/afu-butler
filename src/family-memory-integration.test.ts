import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FamilyMemoryStore,
} from './family-memory';
import {
  FamilyMemoryIntegration,
} from './family-memory-integration';

function createTestStore(): FamilyMemoryStore {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'afu-family-memory-integration-'),
  );
  return new FamilyMemoryStore(
    path.join(directory, 'family-memory.json'),
  );
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}\n實際：${String(actual)}\n預期：${String(expected)}`,
    );
  }
}

function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\n實際：${JSON.stringify(actual)}\n預期：${JSON.stringify(expected)}`,
    );
  }
}

function run(name: string, test: () => void): void {
  try {
    test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('整合邊界可獨立新增、查詢與修改記憶', () => {
  const integration = new FamilyMemoryIntegration(createTestStore());

  const created = integration.addMemory({
    subject: '爸爸',
    content: '不吃香菜',
    tags: ['飲食'],
  });

  assert(created.id.length > 0, '應建立記憶 ID');
  assertEqual(
    integration.listMemories({ subject: '爸爸' }).length,
    1,
    '應能透過整合邊界查詢記憶',
  );

  const updated = integration.updateMemory(created.id, {
    content: '不吃香菜，也不吃芹菜',
  });

  assertEqual(
    updated?.content,
    '不吃香菜，也不吃芹菜',
    '應能透過整合邊界修改記憶',
  );
});

run('整合邊界可獨立處理生活紀錄與統計', () => {
  const integration = new FamilyMemoryIntegration(createTestStore());

  integration.addRecord({
    subject: '爸爸',
    category: '睡眠',
    value: 7,
    unit: '小時',
    occurredAt: '2026-09-01T00:00:00.000Z',
  });
  integration.addRecord({
    subject: '爸爸',
    category: '睡眠',
    value: 8,
    unit: '小時',
    occurredAt: '2026-09-02T00:00:00.000Z',
  });

  assertEqual(
    integration.listRecords({ subject: '爸爸', category: '睡眠' }).length,
    2,
    '應能透過整合邊界查詢生活紀錄',
  );
  assertEqual(
    integration.average({ subject: '爸爸', category: '睡眠' }).average,
    7.5,
    '應能透過整合邊界取得平均值',
  );
  assertEqual(
    integration.trend({ subject: '爸爸', category: '睡眠' }).direction,
    '上升',
    '應能透過整合邊界取得趨勢',
  );
});

run('整合邊界不繞過 Core 的資料隔離', () => {
  const store = createTestStore();
  const integration = new FamilyMemoryIntegration(store);

  const created = integration.addMemory({
    subject: '媽媽',
    content: '喜歡無糖茶',
    tags: ['飲品'],
  });

  created.content = '外部修改不應回寫';
  created.tags.push('外部標籤');

  const stored = integration.getMemory(created.id);

  assertEqual(
    stored?.content,
    '喜歡無糖茶',
    '整合層回傳物件不應污染 Core',
  );
  assertDeepEqual(
    stored?.tags,
    ['飲品'],
    '整合層回傳陣列不應污染 Core',
  );
});

run('刪除操作只影響指定記憶', () => {
  const integration = new FamilyMemoryIntegration(createTestStore());

  const first = integration.addMemory({
    subject: '爸爸',
    content: '記憶 A',
  });
  const second = integration.addMemory({
    subject: '媽媽',
    content: '記憶 B',
  });

  assertEqual(integration.forgetMemory(first.id), true, '應能刪除指定記憶');
  assertEqual(integration.getMemory(first.id), null, '指定記憶應已刪除');
  assertEqual(
    integration.getMemory(second.id)?.content,
    '記憶 B',
    '其他記憶不得受到刪除影響',
  );
});

console.log('Memory 2.0 Integration Boundary 測試完成');
