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
});
