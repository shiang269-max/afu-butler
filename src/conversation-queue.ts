/*
 * 同一 conversationKey 的非同步處理序列化。
 *
 * 不同 conversation 可以並行；同一 conversation 必須依加入順序執行，
 * 避免同時讀取舊對話記憶而產生競態。
 */

const queues = new Map<string, Promise<void>>();

export function enqueueConversationTask(
  conversationKey: string,
  task: () => Promise<void>,
): Promise<void> {
  const previous = queues.get(conversationKey) || Promise.resolve();

  const current = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (queues.get(conversationKey) === current) {
        queues.delete(conversationKey);
      }
    });

  queues.set(conversationKey, current);
  return current;
}
