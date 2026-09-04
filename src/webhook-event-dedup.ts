/*
 * LINE Webhook Event 去重。
 *
 * webhookEventId 在 LINE 重送同一事件時保持不變，因此同一程序內
 * 只允許第一個事件進入實際處理流程。
 */

const EVENT_TTL_MS = 10 * 60 * 1000;

const processedEvents = new Map<string, number>();

function cleanup(now: number): void {
  for (const [eventId, expiresAt] of processedEvents) {
    if (expiresAt <= now) {
      processedEvents.delete(eventId);
    }
  }
}

export function claimWebhookEvent(eventId: string | undefined): boolean {
  if (!eventId) {
    return true;
  }

  const now = Date.now();
  cleanup(now);

  if (processedEvents.has(eventId)) {
    return false;
  }

  processedEvents.set(eventId, now + EVENT_TTL_MS);
  return true;
}
