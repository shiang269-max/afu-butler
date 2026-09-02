import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { FamilyMemoryStore } from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { routeFamilyMemoryMessage } from './family-memory-route-boundary';

function createIntegration(): FamilyMemoryIntegration {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-memory-route-'));
  const store = new FamilyMemoryStore(path.join(dir, 'memory.json'));
  return new FamilyMemoryIntegration(store);
}

const FATHER_USER_ID = 'U59a66400a022a3ca71623a459b47ca56';

describe('Memory 2.0 Route Boundary', () => {
  it('既有功能已認領時 Memory 不得解析或執行', () => {
    const integration = createIntegration();
    const result = routeFamilyMemoryMessage('幫我開一個投票：晚餐吃什麼', {
      existingFunctionMatched: true,
      integration,
    });

    expect(result.type).toBe('skipped_existing_function');
    expect(integration.listMemories()).toHaveLength(0);
  });

  it('既有 Reminder 已認領時 Memory 不得搶走訊息', () => {
    const integration = createIntegration();
    const result = routeFamilyMemoryMessage('提醒我明天買牛奶', {
      existingFunctionMatched: true,
      integration,
    });

    expect(result.type).toBe('skipped_existing_function');
    expect(integration.listMemories()).toHaveLength(0);
  });

  it('既有 Location 已認領時 Memory 不得搶走訊息', () => {
    const integration = createIntegration();
    const result = routeFamilyMemoryMessage('幫我找附近的咖啡廳', {
      existingFunctionMatched: true,
      integration,
    });

    expect(result.type).toBe('skipped_existing_function');
    expect(integration.listMemories()).toHaveLength(0);
  });

  it('既有 Function Help 已認領時 Memory 不得搶走訊息', () => {
    const integration = createIntegration();
    const result = routeFamilyMemoryMessage('有哪些功能', {
      existingFunctionMatched: true,
      integration,
    });

    expect(result.type).toBe('skipped_existing_function');
    expect(integration.listMemories()).toHaveLength(0);
  });

  it('沒有既有功能認領時才允許 Memory 執行', () => {
    const integration = createIntegration();
    const result = routeFamilyMemoryMessage('記住爸爸不吃香菜', {
      existingFunctionMatched: false,
      integration,
    });

    expect(result.type).toBe('executed');
    expect(integration.listMemories()).toHaveLength(1);
  });

  it('「我」應依 LINE userId 解析成爸爸', () => {
    const integration = createIntegration();
    const result = routeFamilyMemoryMessage('記住我愛喝茶', {
      existingFunctionMatched: false,
      actorUserId: FATHER_USER_ID,
      integration,
    });

    expect(result.type).toBe('executed');
    if (result.type !== 'executed') return;

    const memories = integration.listMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].subject).toBe('爸爸');
    expect(memories[0].content).toBe('愛喝茶');
  });

  it('阿福自然查詢可進入 Memory', () => {
    const integration = createIntegration();
    integration.addMemory({
      subject: '媽媽',
      content: '喜歡無糖茶',
    });

    const result = routeFamilyMemoryMessage('阿福，媽媽喜歡什麼', {
      existingFunctionMatched: false,
      actorUserId: FATHER_USER_ID,
      integration,
    });

    expect(result.type).toBe('executed');
    if (result.type !== 'executed') return;

    expect(result.intent.type).toBe('query_memory');
    expect(result.result.type).toBe('memories_found');
  });

  it('沒有阿福的自然查詢不得進入 Memory', () => {
    const integration = createIntegration();
    const result = routeFamilyMemoryMessage('媽媽喜歡什麼', {
      existingFunctionMatched: false,
      actorUserId: FATHER_USER_ID,
      integration,
    });

    expect(result.type).toBe('not_handled');
  });

  it('未知語句不得進入 Memory 執行', () => {
    const integration = createIntegration();
    const result = routeFamilyMemoryMessage('明天天氣怎麼樣', {
      existingFunctionMatched: false,
      integration,
    });

    expect(result.type).toBe('not_handled');
    expect(integration.listMemories()).toHaveLength(0);
  });

  it('沒有 Integration 時不得靜默執行 Memory', () => {
    expect(() =>
      routeFamilyMemoryMessage('記住爸爸不吃香菜', {
        existingFunctionMatched: false,
      }),
    ).toThrow(/Integration/);
  });
});
