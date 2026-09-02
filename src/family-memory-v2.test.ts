import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FamilyMemoryStore } from './family-memory';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}\n預期：${String(expected)}\n實際：${String(actual)}`,
    );
  }
}

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempPath(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'afu-family-memory-v2-'),
  );
  return path.join(directory, 'family-memory.json');
}

function assertThrows(fn: () => unknown, message: string): void {
  let thrown = false;

  try {
    fn();
  } catch {
    thrown = true;
  }

  assertTrue(thrown, message);
}

async function main(): Promise<void> {
  const store = new FamilyMemoryStore(createTempPath());

  store.addRecord({
    subject: '爸爸',
    category: '體重',
    value: 60,
    unit: 'kg',
    occurredAt: '2026-09-01T08:00:00+08:00',
  });
  store.addRecord({
    subject: '爸爸',
    category: '體重',
    value: 132,
    unit: 'lb',
    occurredAt: '2026-09-02T08:00:00+08:00',
  });

  assertThrows(
    () => store.average({ subject: '爸爸', category: '體重' }),
    '不同 unit 的資料不可直接計算平均值',
  );
  assertThrows(
    () => store.trend({ subject: '爸爸', category: '體重' }),
    '不同 unit 的資料不可直接計算趨勢',
  );

  const kgAverage = store.average({
    subject: '爸爸',
    category: '體重',
    unit: 'KG',
  });
  assertEqual(kgAverage.count, 1, '指定 unit 後平均值 count 錯誤');
  assertEqual(kgAverage.average, 60, '指定 unit 後平均值錯誤');
  assertEqual(kgAverage.unit, 'kg', '指定 unit 後 unit 錯誤');

  const kgTrend = store.trend({
    subject: '爸爸',
    category: '體重',
    unit: 'kg',
  });
  assertEqual(kgTrend.count, 1, '指定 unit 後趨勢 count 錯誤');
  assertEqual(kgTrend.direction, '資料不足', '單筆 unit 趨勢應為資料不足');

  store.addRecord({
    subject: '媽媽',
    category: '心情',
    value: 5,
    occurredAt: '2026-09-01T08:00:00+08:00',
  });
  store.addRecord({
    subject: '媽媽',
    category: '心情',
    value: 7,
    occurredAt: '2026-09-02T08:00:00+08:00',
  });

  const unitlessAverage = store.average({
    subject: '媽媽',
    category: '心情',
  });
  assertEqual(unitlessAverage.count, 2, '無 unit 數值資料平均 count 錯誤');
  assertEqual(unitlessAverage.average, 6, '無 unit 數值資料平均值錯誤');
  assertEqual(unitlessAverage.unit, undefined, '無 unit 平均結果不應產生 unit');

  console.log('');
  console.log('Memory 2.0 單位一致性測試完成');
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
