import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FamilyMemoryStore } from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { buildFamilyMemoryAiContext } from './family-memory-ai-context';

describe('Family Memory → AI Context', () => {
  it('提供已保存的家庭記憶與生活紀錄，且不修改資料', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-memory-ai-context-'));
    const integration = new FamilyMemoryIntegration(new FamilyMemoryStore(path.join(dir, 'memory.json')));

    integration.addMemory({ subject: '辰', content: '喜歡吃肉' });
    integration.addMemory({ subject: '媽媽', content: '喜歡吃火鍋' });
    integration.addRecord({ subject: '爸爸', category: '體重', value: 70, unit: '公斤', occurredAt: '2026-09-02T20:00:00+08:00' });

    const context = buildFamilyMemoryAiContext(integration);

    expect(context).toContain('辰：喜歡吃肉');
    expect(context).toContain('媽媽：喜歡吃火鍋');
    expect(context).toContain('爸爸｜體重：70 公斤');
    expect(integration.listMemories()).toHaveLength(2);
    expect(integration.listRecords()).toHaveLength(1);
  });
});
