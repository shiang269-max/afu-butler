import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FamilyMemoryStore } from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { routeFamilyMemoryMessage } from './family-memory-route-boundary';

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

function createIntegration(): FamilyMemoryIntegration {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-memory-route-'));
  const store = new FamilyMemoryStore(path.join(dir, 'memory.json'));
  return new FamilyMemoryIntegration(store);
}

test('既有功能已認領時 Memory 不得解析或執行', () => {
  const integration = createIntegration();
  const result = routeFamilyMemoryMessage('幫我開一個投票：晚餐吃什麼', {
    existingFunctionMatched: true,
    integration,
  });

  assert(result.type === 'skipped_existing_function', '應跳過 Memory');
  assert(integration.listMemories().length === 0, '不得寫入 Memory');
});

test('既有 Reminder 已認領時 Memory 不得搶走訊息', () => {
  const integration = createIntegration();
  const result = routeFamilyMemoryMessage('提醒我明天買牛奶', {
    existingFunctionMatched: true,
    integration,
  });

  assert(result.type === 'skipped_existing_function', '應跳過 Memory');
  assert(integration.listMemories().length === 0, '不得寫入 Memory');
});

test('既有 Location 已認領時 Memory 不得搶走訊息', () => {
  const integration = createIntegration();
  const result = routeFamilyMemoryMessage('幫我找附近的咖啡廳', {
    existingFunctionMatched: true,
    integration,
  });

  assert(result.type === 'skipped_existing_function', '應跳過 Memory');
  assert(integration.listMemories().length === 0, '不得寫入 Memory');
});

test('既有 Function Help 已認領時 Memory 不得搶走訊息', () => {
  const integration = createIntegration();
  const result = routeFamilyMemoryMessage('有哪些功能', {
    existingFunctionMatched: true,
    integration,
  });

  assert(result.type === 'skipped_existing_function', '應跳過 Memory');
  assert(integration.listMemories().length === 0, '不得寫入 Memory');
});

test('沒有既有功能認領時才允許 Memory 執行', () => {
  const integration = createIntegration();
  const result = routeFamilyMemoryMessage('記住爸爸不吃香菜', {
    existingFunctionMatched: false,
    integration,
  });

  assert(result.type === 'executed', '應由 Memory 執行');
  assert(integration.listMemories().length === 1, '應新增一筆 Memory');
});

test('未知語句不得進入 Memory 執行', () => {
  const integration = createIntegration();
  const result = routeFamilyMemoryMessage('明天天氣怎麼樣', {
    existingFunctionMatched: false,
    integration,
  });

  assert(result.type === 'not_handled', '應保持未處理');
  assert(integration.listMemories().length === 0, '不得寫入 Memory');
});

test('沒有 Integration 時不得靜默執行 Memory', () => {
  let threw = false;

  try {
    routeFamilyMemoryMessage('記住爸爸不吃香菜', {
      existingFunctionMatched: false,
    });
  } catch (error) {
    threw = error instanceof Error && error.message.includes('Integration');
  }

  assert(threw, '應明確要求 Integration');
});

console.log('Memory 2.0 Route Boundary 測試完成');
