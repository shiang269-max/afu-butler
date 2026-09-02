import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FamilyMemoryStore,
  FamilyMemory,
} from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { parseFamilyMemoryIntent } from './family-memory-intent';
import { executeFamilyMemoryIntent } from './family-memory-intent-executor';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
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

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'family-memory-intent-executor-'),
);
const store = new FamilyMemoryStore(
  path.join(tempDir, 'family-memory.json'),
);
const integration = new FamilyMemoryIntegration(store);

try {
  test('add_memory 必須經過 Integration 執行', () => {
    const intent = parseFamilyMemoryIntent('記住爸爸不吃香菜');
    const result = executeFamilyMemoryIntent(intent, integration);

    assert(result?.type === 'memory_added', '應為 memory_added');
    if (result?.type !== 'memory_added') return;
    assert(result.memory.subject === '爸爸', 'subject 應正確');
  });

  test('query_memory 透過 Integration 取得資料', () => {
    const intent = parseFamilyMemoryIntent('幫我查爸爸的記憶');
    const result = executeFamilyMemoryIntent(intent, integration);

    assert(result?.type === 'memories_found', '應為 memories_found');
    if (result?.type !== 'memories_found') return;
    assert(result.memories.length === 1, '應找到 1 筆');
  });

  test('add_record 與 average 透過 Integration 執行', () => {
    executeFamilyMemoryIntent(
      parseFamilyMemoryIntent('爸爸今天體重 70 公斤'),
      integration,
    );
    executeFamilyMemoryIntent(
      parseFamilyMemoryIntent('爸爸今天體重 72 公斤'),
      integration,
    );

    const average = executeFamilyMemoryIntent(
      parseFamilyMemoryIntent('爸爸平均體重'),
      integration,
    );

    assert(average?.type === 'average', '應為 average');
    if (average?.type !== 'average') return;
    assert(average.result.count === 2, '平均資料筆數應為 2');
    assert(average.result.average === 71, '平均值應為 71');
    assert(average.result.unit === '公斤', 'unit 應為公斤');
  });

  test('forget_memory 零筆時不得刪除', () => {
    const intent = parseFamilyMemoryIntent('忘記姐姐吃辣');
    const result = executeFamilyMemoryIntent(intent, integration);

    assert(result?.type === 'not_found', '應為 not_found');
    assert(integration.listMemories().length === 3, '資料不應被誤刪');
  });

  test('forget_memory 多筆命中時必須拒絕直接刪除', () => {
    integration.addMemory({ subject: '媽媽', content: '喜歡茶' });
    integration.addMemory({ subject: '媽媽', content: '喜歡水果' });

    const intent = parseFamilyMemoryIntent('忘記媽媽');
    const result = executeFamilyMemoryIntent(intent, integration);

    assert(result?.type === 'ambiguous_forget', '應為 ambiguous_forget');
    assert(integration.listMemories({ subject: '媽媽' }).length === 2, '多筆資料都應保留');
  });

  test('forget_memory 單筆命中才允許刪除', () => {
    const target = integration.addMemory({ subject: '哥哥', content: '不喝咖啡' });
    const intent = parseFamilyMemoryIntent('忘記哥哥不喝咖啡');
    const result = executeFamilyMemoryIntent(intent, integration);

    assert(result?.type === 'memory_forgotten', '應為 memory_forgotten');
    assert(integration.getMemory(target.id) === null, '目標記憶應已刪除');
  });

  test('unknown 不得觸發任何 Integration 操作', () => {
    const before = integration.listMemories().length;
    const intent = parseFamilyMemoryIntent('明天天氣怎麼樣');
    const result = executeFamilyMemoryIntent(intent, integration);

    assert(result === null, 'unknown 應回傳 null');
    assert(integration.listMemories().length === before, '資料不應改變');
  });
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('Memory 2.0 Intent Integration 執行層測試完成');
