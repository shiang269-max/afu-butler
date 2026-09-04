import { describe, expect, it } from 'vitest';
import { enqueueConversationTask } from './conversation-queue';

describe('conversation-queue', () => {
  it('同一 conversation 依序執行', async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;

    const first = enqueueConversationTask('conversation-a', async () => {
      events.push('first-start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first-end');
    });

    const second = enqueueConversationTask('conversation-a', async () => {
      events.push('second');
    });

    await Promise.resolve();
    expect(events).toEqual(['first-start']);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(['first-start', 'first-end', 'second']);
  });

  it('不同 conversation 可以並行', async () => {
    const events: string[] = [];

    const first = enqueueConversationTask('conversation-b', async () => {
      events.push('b');
    });

    const second = enqueueConversationTask('conversation-c', async () => {
      events.push('c');
    });

    await Promise.all([first, second]);

    expect(events.sort()).toEqual(['b', 'c']);
  });
});
