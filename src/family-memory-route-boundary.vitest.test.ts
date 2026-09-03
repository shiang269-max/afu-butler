import { describe, expect, it } from 'vitest';

import { FamilyMemoryStore } from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { routeFamilyMemoryMessage } from './family-memory-route-boundary';

function createIntegration(): FamilyMemoryIntegration {
  return new FamilyMemoryIntegration(new FamilyMemoryStore());
}

describe('Family Memory route boundary', () => {
  it('does not consume pending memory when another function already matched', () => {
    const actorUserId = 'actor-1';
    const integration = createIntegration();
    integration.addMemory({ subject: '爸爸', content: '喜歡咖啡' });

    const listed = routeFamilyMemoryMessage(
      '阿福爸爸喜歡什麼',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(listed.type).toBe('executed');

    const skipped = routeFamilyMemoryMessage(
      '取消 1',
      { existingFunctionMatched: true, actorUserId, integration },
    );
    expect(skipped.type).toBe('skipped_existing_function');

    const cancelled = routeFamilyMemoryMessage(
      '取消 1',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(cancelled.type).toBe('executed');
  });

  it('keeps ambiguous forget results selectable by the next turn', () => {
    const actorUserId = 'actor-2';
    const integration = createIntegration();
    integration.addMemory({ subject: '媽媽', content: '喜歡火鍋' });
    integration.addMemory({ subject: '媽媽', content: '喜歡咖啡' });

    const ambiguous = routeFamilyMemoryMessage(
      '阿福，忘記媽媽喜歡',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(ambiguous.type).toBe('executed');
    if (ambiguous.type !== 'executed') return;
    expect(ambiguous.result.type).toBe('ambiguous_forget');

    const cancelled = routeFamilyMemoryMessage(
      '取消 1',
      { existingFunctionMatched: false, actorUserId, integration },
    );
    expect(cancelled.type).toBe('executed');
    expect(integration.listMemories({ subject: '媽媽' })).toHaveLength(1);
  });
});
