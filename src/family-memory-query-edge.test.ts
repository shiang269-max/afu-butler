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
    path.join(os.tmpdir(), 'afu-family-memory-query-edge-'),
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

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function main(): void {
  test('記憶查詢的空白條件不應意外過濾資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addMemory({ subject: '爸爸', content: '不吃香菜', tags: ['飲食'] });
    store.addMemory({ subject: '媽媽', content: '喜歡無糖茶', tags: ['飲料'] });

    assertEqual(
      store.listMemories({ subject: '   ' }).length,
      2,
      '空白 subject 應視為未指定',
    );
    assertEqual(
      store.listMemories({ keyword: '   ' }).length,
      2,
      '空白 keyword 應視為未指定',
    );
    assertEqual(
      store.listMemories({ tag: '   ' }).length,
      2,
      '空白 tag 應視為未指定',
    );
  });

  test('生活紀錄查詢的空白條件不應意外過濾資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '媽媽',
      category: '睡眠',
      value: 8,
      unit: '小時',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    assertEqual(
      store.listRecords({ subject: '   ' }).length,
      2,
      '空白 subject 應視為未指定',
    );
    assertEqual(
      store.listRecords({ category: '   ' }).length,
      2,
      '空白 category 應視為未指定',
    );
    assertEqual(
      store.listRecords({ unit: '   ' }).length,
      2,
      '空白 unit 應視為未指定',
    );
  });

  test('記憶查詢條件會正規化大小寫與前後空白', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addMemory({
      subject: 'Dad',
      content: 'Likes Beef',
      tags: ['Food'],
    });

    assertEqual(
      store.listMemories({ subject: ' dad ' }).length,
      1,
      'subject 正規化失敗',
    );
    assertEqual(
      store.listMemories({ keyword: ' BEEF ' }).length,
      1,
      'keyword 正規化失敗',
    );
    assertEqual(
      store.listMemories({ tag: ' FOOD ' }).length,
      1,
      'tag 正規化失敗',
    );
  });

  test('生活紀錄 category 與 unit 使用預期的匹配規則', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: 'Dad',
      category: 'Weight',
      value: 60,
      unit: 'KG',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    assertEqual(
      store.listRecords({ category: ' weight ' }).length,
      1,
      'category 應忽略大小寫與前後空白',
    );
    assertEqual(
      store.listRecords({ unit: ' kg ' }).length,
      1,
      'unit 應忽略大小寫與前後空白',
    );
    assertEqual(
      store.listRecords({ subject: ' da ' }).length,
      1,
      'subject 應支援包含式查詢',
    );
  });

  test('不存在的 ID 與不存在的條件應維持安全結果', () => {
    const store = new FamilyMemoryStore(createTempPath());

    assertEqual(store.getMemory('missing'), null, '不存在 ID 應回傳 null');
    assertEqual(
      store.updateMemory('missing', { content: 'x' }),
      null,
      '不存在 ID 更新應回傳 null',
    );
    assertEqual(
      store.forgetMemory('missing'),
      false,
      '不存在 ID 刪除應回傳 false',
    );
    assertEqual(
      store.listRecords({ category: '不存在' }).length,
      0,
      '不存在條件應回傳空陣列',
    );
    assertEqual(
      store.average({ category: '不存在' }).average,
      null,
      '不存在條件平均值應為 null',
    );
    assertEqual(
      store.trend({ category: '不存在' }).direction,
      '資料不足',
      '不存在條件趨勢應為資料不足',
    );
  });

  test('反向日期區間不應產生看似有效的統計資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 7,
      unit: '小時',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    const records = store.listRecords({
      from: '2026-09-02T00:00:00+08:00',
      to: '2026-09-01T00:00:00+08:00',
    });

    assertEqual(records.length, 0, 'from 晚於 to 時應沒有符合資料');
    assertEqual(
      store.average({
        from: '2026-09-02T00:00:00+08:00',
        to: '2026-09-01T00:00:00+08:00',
      }).count,
      0,
      '反向日期區間平均 count 應為 0',
    );
    assertEqual(
      store.trend({
        from: '2026-09-02T00:00:00+08:00',
        to: '2026-09-01T00:00:00+08:00',
      }).direction,
      '資料不足',
      '反向日期區間趨勢應為資料不足',
    );
  });

  test('無效日期條件目前會安全地視為無符合資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    assertEqual(
      store.listRecords({ from: 'not-a-date' }).length,
      0,
      '無效 from 應目前得到空結果',
    );
    assertEqual(
      store.listRecords({ to: 'not-a-date' }).length,
      0,
      '無效 to 應目前得到空結果',
    );
  });

  assertThrows(
    () => new FamilyMemoryStore(createTempPath()).addRecord({
      subject: '爸爸',
      category: '測試',
      occurredAt: 'not-a-date',
    }),
    '目前實作對非法 occurredAt 應該拋出錯誤',
  );

  console.log('');
  console.log('Memory 2.0 查詢邊界測試完成');
}

main();
