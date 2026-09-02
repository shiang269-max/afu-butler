import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FamilyMemoryStore } from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';

function createTestFilePath(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'afu-family-memory-concurrency-'),
  );
  return path.join(directory, 'family-memory.json');
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

function run(name: string, test: () => void): void {
  try {
    test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('同一 Integration 連續寫入不應遺失資料', () => {
  const integration = new FamilyMemoryIntegration(
    new FamilyMemoryStore(createTestFilePath()),
  );

  for (let index = 0; index < 50; index += 1) {
    integration.addMemory({
      subject: `成員${index}`,
      content: `記憶${index}`,
    });
  }

  assertEqual(
    integration.listMemories().length,
    50,
    '連續寫入後應保留全部記憶',
  );
});

run('同一 Integration 的快速讀寫操作不應互相污染', () => {
  const filePath = createTestFilePath();
  const integration = new FamilyMemoryIntegration(
    new FamilyMemoryStore(filePath),
  );

  const first = integration.addMemory({
    subject: '爸爸',
    content: '原始記憶',
  });

  const returned = integration.getMemory(first.id);
  assert(returned !== null, '應能取得剛建立的記憶');

  returned!.content = '外部修改';

  const updated = integration.updateMemory(first.id, {
    content: '正式更新',
  });

  assertEqual(
    updated?.content,
    '正式更新',
    '正式更新不應受到外部回傳物件修改影響',
  );

  const reloaded = new FamilyMemoryStore(filePath);
  assertEqual(
    reloaded.getMemory(first.id)?.content,
    '正式更新',
    '重新載入後應保留最後一次正式更新',
  );
});

run('多個 Integration 共用同一 Store 時操作應維持一致', () => {
  const store = new FamilyMemoryStore(createTestFilePath());
  const first = new FamilyMemoryIntegration(store);
  const second = new FamilyMemoryIntegration(store);

  const firstMemory = first.addMemory({
    subject: '爸爸',
    content: '記憶 A',
  });
  const secondMemory = second.addMemory({
    subject: '媽媽',
    content: '記憶 B',
  });

  assertEqual(
    first.listMemories().length,
    2,
    '第一個 Integration 應看到完整資料',
  );
  assertEqual(
    second.listMemories().length,
    2,
    '第二個 Integration 應看到完整資料',
  );
  assert(
    first.getMemory(firstMemory.id) !== null,
    '第一筆記憶應存在',
  );
  assert(
    second.getMemory(secondMemory.id) !== null,
    '第二筆記憶應存在',
  );
});

run('統計讀取不應修改原始生活紀錄', () => {
  const integration = new FamilyMemoryIntegration(
    new FamilyMemoryStore(createTestFilePath()),
  );

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

  const before = integration.listRecords({
    subject: '爸爸',
    category: '睡眠',
  });
  const average = integration.average({
    subject: '爸爸',
    category: '睡眠',
  });
  const trend = integration.trend({
    subject: '爸爸',
    category: '睡眠',
  });
  const after = integration.listRecords({
    subject: '爸爸',
    category: '睡眠',
  });

  assertEqual(average.average, 7.5, '平均值應正確');
  assertEqual(trend.change, 1, '趨勢變化應正確');
  assertEqual(
    JSON.stringify(after),
    JSON.stringify(before),
    '統計操作前後生活紀錄應保持一致',
  );
});

console.log('Memory 2.0 競態與狀態隔離測試完成');
