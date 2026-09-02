import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FamilyMemoryStore } from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { routeFamilyMemoryMessage } from './family-memory-route-boundary';

function createIntegration(): FamilyMemoryIntegration {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'afu-memory-edit-'));
  return new FamilyMemoryIntegration(
    new FamilyMemoryStore(path.join(directory, 'family-memory.json')),
  );
}

describe('Family Memory edit flow', () => {
  it('records the mentioned family member rather than the actor', () => {
    const integration = createIntegration();
    const actorUserId = 'dad-user';

    const addChild = routeFamilyMemoryMessage(
      '阿福記住辰喜歡吃肉',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    const addSelf = routeFamilyMemoryMessage(
      '阿福記住我喜歡喝茶',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    const addMom = routeFamilyMemoryMessage(
      '阿福記住媽媽喜歡吃火鍋',
      { existingFunctionMatched: false, actorUserId, integration },
    );

    expect(addChild.type).toBe('executed');
    expect(addSelf.type).toBe('executed');
    expect(addMom.type).toBe('executed');

    const memories = integration.listMemories();
    expect(memories.map((memory) => memory.subject)).toEqual([
      '辰',
      '爸爸',
      '媽媽',
    ]);
  });

  it('allows modify or cancel only on the immediate next turn', () => {
    const integration = createIntegration();
    const actorUserId = 'dad-user';

    integration.addMemory({ subject: '爸爸', content: '喜歡喝咖啡' });
    integration.addMemory({ subject: '爸爸', content: '喜歡吃牛肉麵' });

    const listed = routeFamilyMemoryMessage(
      '阿福爸爸喜歡什麼',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(listed.type).toBe('executed');

    const modified = routeFamilyMemoryMessage(
      '修改 2 為 喜歡吃壽司',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(modified.type).toBe('executed');
    if (modified.type === 'executed') {
      expect(modified.result.type).toBe('memory_updated');
    }

    const cancelled = routeFamilyMemoryMessage(
      '取消 1',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(cancelled.type).toBe('not_handled');

    const listedAgain = routeFamilyMemoryMessage(
      '阿福爸爸喜歡什麼',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(listedAgain.type).toBe('executed');

    const cancelledNow = routeFamilyMemoryMessage(
      '取消 1',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(cancelledNow.type).toBe('executed');
    if (cancelledNow.type === 'executed') {
      expect(cancelledNow.result.type).toBe('memory_forgotten');
    }
  });

  it('clears pending state when another message arrives', () => {
    const integration = createIntegration();
    const actorUserId = 'dad-user';

    integration.addMemory({ subject: '爸爸', content: '喜歡咖啡' });

    routeFamilyMemoryMessage(
      '阿福爸爸喜歡什麼',
      { existingFunctionMatched: false, actorUserId, integration },
    );

    const normalMessage = routeFamilyMemoryMessage(
      '今天天氣不錯',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(normalMessage.type).toBe('not_handled');

    const lateCancel = routeFamilyMemoryMessage(
      '取消 1',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(lateCancel.type).toBe('not_handled');
  });

  it('isolates pending operations by actor user id', () => {
    const integration = createIntegration();
    integration.addMemory({ subject: '爸爸', content: '喜歡咖啡' });

    routeFamilyMemoryMessage(
      '阿福爸爸喜歡什麼',
      { existingFunctionMatched: false, actorUserId: 'dad-user', integration },
    );

    const otherActor = routeFamilyMemoryMessage(
      '取消 1',
      { existingFunctionMatched: false, actorUserId: 'mom-user', integration },
    );

    expect(otherActor.type).toBe('not_handled');
    expect(integration.listMemories()).toHaveLength(1);
  });
});
