import { describe, expect, it } from 'vitest';

import { claimWebhookEvent } from './webhook-event-dedup';

describe('webhook-event-dedup', () => {
  it('同一 webhookEventId 只能成功領取一次', () => {
    expect(claimWebhookEvent('01TESTEVENT000000000000000001')).toBe(true);
    expect(claimWebhookEvent('01TESTEVENT000000000000000001')).toBe(false);
  });

  it('不同 webhookEventId 可以各自領取', () => {
    expect(claimWebhookEvent('01TESTEVENT000000000000000002')).toBe(true);
    expect(claimWebhookEvent('01TESTEVENT000000000000000003')).toBe(true);
  });

  it('沒有 event id 時不阻擋既有流程', () => {
    expect(claimWebhookEvent(undefined)).toBe(true);
  });
});
