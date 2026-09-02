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
    path.join(os.tmpdir(), 'afu-family-memory-input-'),
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

async function test(name: string, fn: () => void): Promise<void> {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('非法數值包含 Infinity 與 -Infinity 都會被拒絕', () => {
    const store = new FamilyMemoryStore(createTempPath());

    assertThrows(
      () =>
        store.addRecord({
          subject: '爸爸',
          category: '體重',
          value: Infinity,
        }),
      'Infinity 應該被拒絕',
    );

    assertThrows(
      () =>
        store.addRecord({
          subject: '爸爸',
          category: '體重',
          value: -Infinity,
        }),
      '-Infinity 應該被拒絕',
    );

    assertEqual(store.listRecords().length, 0, '非法數值不應寫入資料');
  });

  await test('拒絕非法數值後不應留下部分寫入', () => {
    const store = new FamilyMemoryStore(createTempPath());

    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    assertThrows(
      () =>
        store.addRecord({
          subject: '爸爸',
          category: '體重',
          value: Number.NaN,
          unit: 'kg',
          occurredAt: '2026-09-02T08:00:00+08:00',
        }),
      'NaN 應該被拒絕',
    );

    const records = store.listRecords({
      subject: '爸爸',
      category: '體重',
    });
    assertEqual(records.length, 1, '拒絕非法資料後不應增加紀錄');
    assertEqual(records[0].value, 60, '既有合法紀錄不應被破壞');
  });

  await test('可接受顯式 Date 物件並正確保存 occurredAt', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const occurredAt = new Date('2026-09-01T08:00:00+08:00');

    const record = store.addRecord({
      subject: '媽媽',
      category: '睡眠',
      value: 7.5,
      unit: '小時',
      occurredAt,
    });

    assertEqual(
      record.occurredAt,
      occurredAt.toISOString(),
      'Date 物件應轉換成 ISO 時間',
    );
  });

  await test('沒有 occurredAt 時會自動建立可解析的時間', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const before = Date.now();

    const record = store.addRecord({
      subject: '爸爸',
      category: '喝水',
      value: 500,
      unit: 'ml',
    });

    const occurredAt = new Date(record.occurredAt).getTime();
    const after = Date.now();

    assertTrue(Number.isFinite(occurredAt), '自動建立的 occurredAt 應為有效時間');
    assertTrue(
      occurredAt >= before - 1000 && occurredAt <= after + 1000,
      '自動建立的 occurredAt 應接近目前時間',
    );
  });

  await test('空白 unit 會視為沒有 unit', () => {
    const store = new FamilyMemoryStore(createTempPath());

    const record = store.addRecord({
      subject: '媽媽',
      category: '心情',
      value: 5,
      unit: '   ',
    });

    assertEqual(record.unit, undefined, '空白 unit 應正規化為 undefined');
  });

  console.log('');
  console.log('Memory 2.0 輸入資料完整性測試完成');
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
