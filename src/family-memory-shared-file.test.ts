import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FamilyMemoryStore } from './family-memory';

function createTempFilePath(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'family-memory-shared-file-'),
  );

  return path.join(directory, 'memory.json');
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('兩個獨立 Store 共用同一檔案時不應遺失彼此新增資料', () => {
  const filePath = createTempFilePath();
  const storeA = new FamilyMemoryStore(filePath);
  const storeB = new FamilyMemoryStore(filePath);

  storeA.addMemory({
    subject: '爸爸',
    content: '不吃香菜',
  });

  storeB.addMemory({
    subject: '媽媽',
    content: '喜歡無糖茶',
  });

  const reloaded = new FamilyMemoryStore(filePath);
  const memories = reloaded.listMemories();

  assert(
    memories.length === 2,
    `預期保留 2 筆記憶，實際為 ${memories.length} 筆`,
  );
  assert(
    memories.some((memory) => memory.content === '不吃香菜'),
    'Store B 寫入後不應覆蓋 Store A 的資料',
  );
  assert(
    memories.some((memory) => memory.content === '喜歡無糖茶'),
    'Store B 新增的資料應存在',
  );
});

console.log('Memory 2.0 多 Store 共用檔案競態測試完成');
