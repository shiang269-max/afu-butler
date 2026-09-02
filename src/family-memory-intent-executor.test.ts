import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { FamilyMemoryStore } from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { parseFamilyMemoryIntent } from './family-memory-intent';
import { executeFamilyMemoryIntent } from './family-memory-intent-executor';

describe('Memory 2.0 Intent Integration 執行層', () => {
  let tempDir: string | undefined;

  function createIntegration(): FamilyMemoryIntegration {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'family-memory-intent-executor-'),
    );
    const store = new FamilyMemoryStore(
      path.join(tempDir, 'family-memory.json'),
    );
    return new FamilyMemoryIntegration(store);
  }

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('add_memory 必須經過 Integration 執行', () => {
    const integration = createIntegration();
    const intent = parseFamilyMemoryIntent('記住爸爸不吃香菜');
    const result = executeFamilyMemoryIntent(intent, integration);

    expect(result?.type).toBe('memory_added');
    if (result?.type !== 'memory_added') return;
    expect(result.memory.subject).toBe('爸爸');
  });

  it('query_memory 透過 Integration 取得資料', () => {
    const integration = createIntegration();
    executeFamilyMemoryIntent(
      parseFamilyMemoryIntent('記住爸爸不吃香菜'),
      integration,
    );
    const intent = parseFamilyMemoryIntent('阿福，幫我查爸爸的記憶');
    const result = executeFamilyMemoryIntent(intent, integration);

    expect(result?.type).toBe('memories_found');
    if (result?.type !== 'memories_found') return;
    expect(result.memories).toHaveLength(1);
  });

  it('add_record 與 average 透過 Integration 執行', () => {
    const integration = createIntegration();
    executeFamilyMemoryIntent(
      parseFamilyMemoryIntent('爸爸今天體重 70 公斤'),
      integration,
    );
    executeFamilyMemoryIntent(
      parseFamilyMemoryIntent('爸爸今天體重 72 公斤'),
      integration,
    );

    const average = executeFamilyMemoryIntent(
      parseFamilyMemoryIntent('阿福，平均爸爸的體重'),
      integration,
    );

    expect(average?.type).toBe('average');
    if (average?.type !== 'average') return;
    expect(average.result.count).toBe(2);
    expect(average.result.average).toBe(71);
    expect(average.result.unit).toBe('公斤');
  });

  it('forget_memory 零筆時不得刪除', () => {
    const integration = createIntegration();
    const before = integration.listMemories().length;
    const intent = parseFamilyMemoryIntent('阿福，忘記姐姐吃辣');
    const result = executeFamilyMemoryIntent(intent, integration);

    expect(result?.type).toBe('not_found');
    expect(integration.listMemories()).toHaveLength(before);
  });

  it('forget_memory 多筆命中時必須拒絕直接刪除', () => {
    const integration = createIntegration();
    integration.addMemory({ subject: '媽媽', content: '喜歡茶' });
    integration.addMemory({ subject: '媽媽', content: '喜歡水果' });

    const intent = parseFamilyMemoryIntent('阿福，忘記媽媽');
    const result = executeFamilyMemoryIntent(intent, integration);

    expect(result?.type).toBe('ambiguous_forget');
    expect(integration.listMemories({ subject: '媽媽' })).toHaveLength(2);
  });

  it('forget_memory 單筆命中才允許刪除', () => {
    const integration = createIntegration();
    const target = integration.addMemory({
      subject: '哥哥',
      content: '不喝咖啡',
    });
    const intent = parseFamilyMemoryIntent('阿福，忘記哥哥不喝咖啡');
    const result = executeFamilyMemoryIntent(intent, integration);

    expect(result?.type).toBe('memory_forgotten');
    expect(integration.getMemory(target.id)).toBeNull();
  });

  it('unknown 不得觸發任何 Integration 操作', () => {
    const integration = createIntegration();
    const before = integration.listMemories().length;
    const intent = parseFamilyMemoryIntent('明天天氣怎麼樣');
    const result = executeFamilyMemoryIntent(intent, integration);

    expect(result).toBeNull();
    expect(integration.listMemories()).toHaveLength(before);
  });
});
