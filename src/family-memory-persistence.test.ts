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
    path.join(os.tmpdir(), 'afu-family-memory-persistence-'),
  );
  return path.join(directory, 'family-memory.json');
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
  test('修改記憶後重新載入仍保留更新結果', () => {
    const filePath = createTempPath();
    const firstStore = new FamilyMemoryStore(filePath);
    const memory = firstStore.addMemory({
      subject: '媽媽',
      content: '喜歡無糖茶',
      tags: ['飲食'],
    });

    const updated = firstStore.updateMemory(memory.id, {
      subject: '媽媽',
      content: '喜歡無糖綠茶',
      tags: ['飲食', '飲料'],
    });

    assertTrue(updated !== null, 'updateMemory 應成功');

    const secondStore = new FamilyMemoryStore(filePath);
    const reloaded = secondStore.getMemory(memory.id);
    assertTrue(reloaded !== null, '重新載入後應仍存在該記憶');
    assertEqual(reloaded?.content, '喜歡無糖綠茶', '更新內容未持久化');
    assertEqual(reloaded?.tags.length, 2, '更新 tags 未持久化');
  });

  test('忘記記憶後重新載入仍維持刪除結果', () => {
    const filePath = createTempPath();
    const firstStore = new FamilyMemoryStore(filePath);
    const memory = firstStore.addMemory({
      subject: '爸爸',
      content: '不吃香菜',
    });

    assertEqual(firstStore.forgetMemory(memory.id), true, 'forgetMemory 應成功');

    const secondStore = new FamilyMemoryStore(filePath);
    assertEqual(
      secondStore.getMemory(memory.id),
      null,
      '刪除結果未持久化',
    );
    assertEqual(secondStore.listMemories().length, 0, '重新載入後不應殘留記憶');
  });

  test('clearAll 後重新載入仍維持空資料', () => {
    const filePath = createTempPath();
    const firstStore = new FamilyMemoryStore(filePath);
    firstStore.addMemory({ subject: '爸爸', content: '測試記憶' });
    firstStore.addRecord({
      subject: '爸爸',
      category: '測試',
      value: 1,
      unit: '次',
    });

    firstStore.clearAll();

    const secondStore = new FamilyMemoryStore(filePath);
    assertEqual(secondStore.listMemories().length, 0, 'clearAll 後記憶未持久化清除');
    assertEqual(secondStore.listRecords().length, 0, 'clearAll 後紀錄未持久化清除');
  });

  console.log('');
  console.log('Memory 2.0 更新與清除持久化測試完成');
}

main();
