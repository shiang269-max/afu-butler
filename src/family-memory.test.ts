import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FamilyMemoryStore,
  type FamilyMemory,
  type LifeRecord,
} from './family-memory';

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

function assertClose(
  actual: number | null,
  expected: number,
  message: string,
): void {
  if (actual === null || Math.abs(actual - expected) > 1e-9) {
    throw new Error(
      `${message}\n預期：${expected}\n實際：${String(actual)}`,
    );
  }
}

async function test(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function createTempPath(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'afu-family-memory-'),
  );
  return path.join(directory, 'family-memory.json');
}

function assertMemoryShape(memory: FamilyMemory): void {
  assertTrue(memory.id.startsWith('mem_'), '記憶 ID 格式錯誤');
  assertTrue(Boolean(memory.createdAt), '記憶 createdAt 不存在');
  assertTrue(Boolean(memory.updatedAt), '記憶 updatedAt 不存在');
}

function assertRecordShape(record: LifeRecord): void {
  assertTrue(record.id.startsWith('rec_'), '生活紀錄 ID 格式錯誤');
  assertTrue(Boolean(record.createdAt), '生活紀錄 createdAt 不存在');
  assertTrue(Boolean(record.occurredAt), '生活紀錄 occurredAt 不存在');
}

async function main(): Promise<void> {
  await test('建立空的家庭記憶 Store', () => {
    const filePath = createTempPath();
    const store = new FamilyMemoryStore(filePath);

    assertEqual(store.listMemories().length, 0, '初始記憶應為空');
    assertEqual(store.listRecords().length, 0, '初始生活紀錄應為空');
    assertEqual(store.getFilePath(), filePath, '資料檔路徑錯誤');
  });

  await test('新增與查詢記憶', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const memory = store.addMemory({
      subject: '爸爸',
      content: '不吃香菜',
      tags: ['飲食', '家庭'],
    });

    assertMemoryShape(memory);
    assertEqual(memory.subject, '爸爸', 'subject 錯誤');
    assertEqual(memory.content, '不吃香菜', 'content 錯誤');
    assertEqual(memory.tags.length, 2, 'tags 數量錯誤');

    const all = store.listMemories();
    assertEqual(all.length, 1, '記憶數量錯誤');
    assertEqual(all[0].id, memory.id, '查詢到的記憶 ID 錯誤');
  });

  await test('記憶查詢支援人物、關鍵字與標籤', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addMemory({
      subject: '爸爸',
      content: '不吃香菜，喜歡牛肉',
      tags: ['飲食'],
    });
    store.addMemory({
      subject: '媽媽',
      content: '喜歡無糖茶',
      tags: ['飲食', '偏好'],
    });
    store.addMemory({
      subject: '弟弟',
      content: '喜歡打籃球',
      tags: ['興趣'],
    });

    assertEqual(
      store.listMemories({ subject: '爸' }).length,
      1,
      '人物查詢失敗',
    );
    assertEqual(
      store.listMemories({ keyword: '牛肉' }).length,
      1,
      '關鍵字查詢失敗',
    );
    assertEqual(
      store.listMemories({ tag: '飲食' }).length,
      2,
      '標籤查詢失敗',
    );
    assertEqual(
      store.listMemories({ tag: '飲食', subject: '媽媽' }).length,
      1,
      '複合查詢失敗',
    );
  });

  await test('取得、修改與忘記記憶', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const memory = store.addMemory({
      subject: '媽媽',
      content: '喜歡無糖茶',
      tags: ['飲食'],
    });

    assertEqual(store.getMemory(memory.id)?.content, '喜歡無糖茶', 'getMemory 失敗');
    assertEqual(store.getMemory('not-found'), null, '不存在的記憶應回傳 null');

    const updated = store.updateMemory(memory.id, {
      content: '喜歡無糖綠茶',
      tags: ['飲食', '飲料'],
    });
    assertTrue(updated !== null, 'updateMemory 應成功');
    assertEqual(updated?.content, '喜歡無糖綠茶', '修改內容失敗');
    assertEqual(updated?.tags.length, 2, '修改標籤失敗');
    assertTrue(
      updated !== null && updated.updatedAt >= updated.createdAt,
      'updatedAt 應存在且不早於 createdAt',
    );

    assertEqual(
      store.updateMemory('not-found', { content: 'x' }),
      null,
      '修改不存在記憶應回傳 null',
    );
    assertEqual(store.forgetMemory(memory.id), true, 'forgetMemory 應成功');
    assertEqual(store.getMemory(memory.id), null, '忘記後不應再查到記憶');
    assertEqual(store.forgetMemory(memory.id), false, '重複忘記應回傳 false');
  });

  await test('新增生活紀錄與基本查詢', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const record = store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 7.5,
      unit: '小時',
      content: '昨晚睡得不錯',
      occurredAt: '2026-08-30T23:00:00+08:00',
    });

    assertRecordShape(record);
    assertEqual(record.subject, '爸爸', '生活紀錄 subject 錯誤');
    assertEqual(record.category, '睡眠', '生活紀錄 category 錯誤');
    assertEqual(record.value, 7.5, '生活紀錄 value 錯誤');
    assertEqual(record.unit, '小時', '生活紀錄 unit 錯誤');
    assertEqual(record.content, '昨晚睡得不錯', '生活紀錄 content 錯誤');

    assertEqual(store.listRecords().length, 1, '生活紀錄數量錯誤');
    assertEqual(
      store.listRecords({ subject: '爸爸', category: '睡眠' }).length,
      1,
      '生活紀錄人物／分類查詢失敗',
    );
    assertEqual(
      store.listRecords({ category: '運動' }).length,
      0,
      '不存在的分類應為空',
    );
  });

  await test('生活紀錄依 occurredAt 排序與日期篩選', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 70,
      unit: 'kg',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 71,
      unit: 'kg',
      occurredAt: '2026-08-30T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 70.5,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    const records = store.listRecords({
      subject: '爸爸',
      category: '體重',
    });
    assertEqual(records.length, 3, '體重紀錄數量錯誤');
    assertEqual(records[0].value, 71, '最早紀錄排序錯誤');
    assertEqual(records[2].value, 70, '最新紀錄排序錯誤');

    const filtered = store.listRecords({
      category: '體重',
      from: '2026-09-01T00:00:00+08:00',
      to: '2026-09-02T23:59:59+08:00',
    });
    assertEqual(filtered.length, 2, '日期篩選數量錯誤');
  });

  await test('平均值計算', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 6,
      unit: '小時',
      occurredAt: '2026-08-30T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 8,
      unit: '小時',
      occurredAt: '2026-08-31T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      content: '沒有數值的紀錄',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    const result = store.average({
      subject: '爸爸',
      category: '睡眠',
    });
    assertEqual(result.count, 2, '平均值 count 應只計算有 value 的紀錄');
    assertClose(result.average, 7, '平均值計算錯誤');
    assertEqual(result.unit, '小時', '平均值 unit 錯誤');

    const empty = store.average({ category: '不存在' });
    assertEqual(empty.count, 0, '沒有資料時 count 應為 0');
    assertEqual(empty.average, null, '沒有資料時 average 應為 null');
  });

  await test('趨勢計算', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 72,
      unit: 'kg',
      occurredAt: '2026-08-30T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 71,
      unit: 'kg',
      occurredAt: '2026-08-31T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 70,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    const result = store.trend({
      subject: '爸爸',
      category: '體重',
    });
    assertEqual(result.count, 3, '趨勢 count 錯誤');
    assertEqual(result.first?.value, 72, '趨勢 first 錯誤');
    assertEqual(result.latest?.value, 70, '趨勢 latest 錯誤');
    assertEqual(result.change, -2, '趨勢 change 錯誤');
    assertEqual(result.direction, '下降', '趨勢方向錯誤');

    const insufficient = store.trend({ category: '不存在' });
    assertEqual(insufficient.count, 0, '無資料趨勢 count 錯誤');
    assertEqual(insufficient.direction, '資料不足', '無資料應為資料不足');

    store.addRecord({
      subject: '媽媽',
      category: '心情',
      value: 5,
      unit: '分',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    const one = store.trend({ subject: '媽媽', category: '心情' });
    assertEqual(one.count, 1, '單筆趨勢 count 錯誤');
    assertEqual(one.change, null, '單筆趨勢 change 應為 null');
    assertEqual(one.direction, '資料不足', '單筆趨勢應為資料不足');
  });

  await test('非法數值會被拒絕', () => {
    const store = new FamilyMemoryStore(createTempPath());
    let thrown = false;

    try {
      store.addRecord({
        subject: '爸爸',
        category: '體重',
        value: Number.NaN,
      });
    } catch {
      thrown = true;
    }

    assertTrue(thrown, 'NaN 應該被拒絕');
    assertEqual(store.listRecords().length, 0, '非法紀錄不應寫入資料');
  });

  await test('JSON 持久化與重新載入', () => {
    const filePath = createTempPath();
    const firstStore = new FamilyMemoryStore(filePath);
    const memory = firstStore.addMemory({
      subject: '爸爸',
      content: '週日晚上一起吃飯',
      tags: ['習慣'],
    });
    const record = firstStore.addRecord({
      subject: '爸爸',
      category: '起床時間',
      value: 7,
      unit: '點',
      occurredAt: '2026-09-01T07:00:00+08:00',
    });

    assertTrue(fs.existsSync(filePath), 'JSON 資料檔應該存在');

    const secondStore = new FamilyMemoryStore(filePath);
    assertEqual(secondStore.listMemories().length, 1, '重新載入後記憶遺失');
    assertEqual(secondStore.getMemory(memory.id)?.content, '週日晚上一起吃飯', '重新載入記憶內容錯誤');
    assertEqual(secondStore.listRecords().length, 1, '重新載入後生活紀錄遺失');
    assertEqual(secondStore.listRecords()[0].id, record.id, '重新載入紀錄 ID 錯誤');
  });

  await test('clearAll 清除記憶與生活紀錄', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addMemory({ subject: '爸爸', content: '測試記憶' });
    store.addRecord({ subject: '爸爸', category: '測試', value: 1 });

    store.clearAll();

    assertEqual(store.listMemories().length, 0, 'clearAll 後記憶應為空');
    assertEqual(store.listRecords().length, 0, 'clearAll 後生活紀錄應為空');
  });

  console.log('');
  console.log('家庭記憶 Core 測試全部通過');
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
