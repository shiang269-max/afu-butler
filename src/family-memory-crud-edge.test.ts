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
    path.join(os.tmpdir(), 'afu-family-memory-crud-edge-'),
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
  await test('更新記憶時只修改指定欄位', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const created = store.addMemory({
      subject: '爸爸',
      content: '不吃香菜',
      tags: ['飲食'],
    });
    const originalUpdatedAt = created.updatedAt;

    const updated = store.updateMemory(created.id, {
      content: '不吃香菜，喜歡牛肉',
    });

    assertTrue(updated !== null, '更新應成功');
    assertEqual(updated?.subject, '爸爸', '未指定 subject 不應被修改');
    assertEqual(updated?.content, '不吃香菜，喜歡牛肉', 'content 更新錯誤');
    assertEqual(updated?.tags.length, 1, '未指定 tags 不應被修改');
    assertTrue(
      updated !== null && updated.updatedAt >= originalUpdatedAt,
      '更新後 updatedAt 應維持有效時間',
    );
  });

  await test('更新記憶時 tags 會依現行規則正規化', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const created = store.addMemory({
      subject: '媽媽',
      content: '喜歡茶',
      tags: ['飲料'],
    });

    const updated = store.updateMemory(created.id, {
      tags: [' 飲料 ', '', ' 偏好 '],
    });

    assertTrue(updated !== null, '更新應成功');
    assertEqual(updated?.tags.length, 2, '空白 tag 應被移除');
    assertEqual(updated?.tags[0], '飲料', 'tag 前後空白應被移除');
    assertEqual(updated?.tags[1], '偏好', 'tag 正規化錯誤');
  });

  await test('忘記其中一筆記憶不應影響其他記憶', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const first = store.addMemory({
      subject: '爸爸',
      content: '第一筆',
    });
    const second = store.addMemory({
      subject: '媽媽',
      content: '第二筆',
    });

    assertEqual(store.forgetMemory(first.id), true, '刪除第一筆應成功');
    assertEqual(store.getMemory(first.id), null, '第一筆應不存在');
    assertEqual(store.getMemory(second.id)?.content, '第二筆', '其他記憶不應受影響');
    assertEqual(store.listMemories().length, 1, '刪除後應剩一筆記憶');
  });

  await test('updateMemory 與 forgetMemory 對空白 ID 應維持安全結果', () => {
    const store = new FamilyMemoryStore(createTempPath());

    assertEqual(
      store.updateMemory('   ', { content: 'x' }),
      null,
      '空白 ID 更新應回傳 null',
    );
    assertEqual(
      store.forgetMemory('   '),
      false,
      '空白 ID 刪除應回傳 false',
    );
  });

  await test('新增記憶前的輸入物件不會在後續被 Core 依賴', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const tags = ['飲食'];
    const input = {
      subject: '爸爸',
      content: '不吃香菜',
      tags,
    };

    const created = store.addMemory(input);
    tags.push('外部後續修改');
    input.subject = '外部後續修改';
    input.content = '外部後續修改';

    const stored = store.getMemory(created.id);
    assertTrue(stored !== null, '應能取得新增的記憶');
    assertEqual(stored?.subject, '爸爸', '輸入物件後續修改不應影響 subject');
    assertEqual(stored?.content, '不吃香菜', '輸入物件後續修改不應影響 content');
    assertEqual(stored?.tags.length, 1, '輸入物件後續修改不應影響 tags');
  });

  await test('addRecord 的輸入物件後續修改不會污染 Core', () => {
    const store = new FamilyMemoryStore(createTempPath());
    const input = {
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      content: '正常',
      occurredAt: '2026-09-01T08:00:00+08:00',
    };

    const created = store.addRecord(input);
    input.subject = '外部修改';
    input.category = '外部修改';
    input.value = 999;
    input.unit = 'lb';
    input.content = '外部修改';
    input.occurredAt = '2027-01-01T00:00:00+08:00';

    const stored = store.listRecords();
    assertEqual(stored.length, 1, '應仍只有一筆紀錄');
    assertEqual(stored[0].id, created.id, '紀錄 ID 應維持不變');
    assertEqual(stored[0].subject, '爸爸', 'subject 不應被外部修改');
    assertEqual(stored[0].category, '體重', 'category 不應被外部修改');
    assertEqual(stored[0].value, 60, 'value 不應被外部修改');
    assertEqual(stored[0].unit, 'kg', 'unit 不應被外部修改');
    assertEqual(stored[0].content, '正常', 'content 不應被外部修改');
  });

  await test('非法 Date 不應建立看似有效的生活紀錄', () => {
    const store = new FamilyMemoryStore(createTempPath());

    assertThrows(
      () =>
        store.addRecord({
          subject: '爸爸',
          category: '睡眠',
          value: 7,
          occurredAt: 'not-a-date',
        }),
      '非法 occurredAt 應該產生錯誤',
    );
    assertEqual(store.listRecords().length, 0, '非法時間不應寫入資料');
  });

  console.log('');
  console.log('Memory 2.0 CRUD 與輸入隔離測試完成');
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
