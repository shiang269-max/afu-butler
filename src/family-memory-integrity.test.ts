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
    path.join(os.tmpdir(), 'afu-family-memory-integrity-'),
  );
  return path.join(directory, 'family-memory.json');
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
  await test('新增記憶的回傳物件不應污染 Core 內部資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const created = store.addMemory({
      subject: '爸爸',
      content: '不吃香菜',
      tags: ['飲食'],
    });

    created.subject = '被修改的爸爸';
    created.tags.push('外部修改');

    const stored = store.getMemory(created.id);
    assertTrue(stored !== null, '應該仍能取得原記憶');
    assertEqual(stored?.subject, '爸爸', '外部修改不應改變 subject');
    assertEqual(stored?.tags.length, 1, '外部修改不應改變 tags');
  });

  await test('查詢記憶的回傳陣列不應污染 Core 內部資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addMemory({
      subject: '媽媽',
      content: '喜歡無糖茶',
      tags: ['飲料'],
    });

    const memories = store.listMemories();
    memories[0].content = '被外部修改';
    memories[0].tags.push('外部修改');
    memories.length = 0;

    const stored = store.listMemories();
    assertEqual(stored.length, 1, '外部修改不應改變內部記憶數量');
    assertEqual(stored[0].content, '喜歡無糖茶', '外部修改不應改變內容');
    assertEqual(stored[0].tags.length, 1, '外部修改不應改變 tags');
  });

  await test('新增生活紀錄的回傳物件不應污染 Core 內部資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const created = store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    created.value = 999;
    created.unit = 'lb';

    const records = store.listRecords({
      subject: '爸爸',
      category: '體重',
    });
    assertEqual(records.length, 1, '應該仍只有一筆生活紀錄');
    assertEqual(records[0].value, 60, '外部修改不應改變 value');
    assertEqual(records[0].unit, 'kg', '外部修改不應改變 unit');
  });

  await test('查詢生活紀錄的回傳陣列不應污染 Core 內部資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 7.5,
      unit: '小時',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    const records = store.listRecords();
    records[0].value = 1;
    records[0].category = '被修改';
    records.length = 0;

    const stored = store.listRecords();
    assertEqual(stored.length, 1, '外部修改不應改變內部紀錄數量');
    assertEqual(stored[0].value, 7.5, '外部修改不應改變 value');
    assertEqual(stored[0].category, '睡眠', '外部修改不應改變 category');
  });

  console.log('');
  console.log('Memory 2.0 資料隔離測試完成');
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
