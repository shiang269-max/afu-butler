const MAX_MEMORY_MESSAGES = 18;

export type MemoryMessage = {
  role: 'user' | 'assistant';
  text: string;
};

const conversationMemory = new Map<string, MemoryMessage[]>();


export function getConversationKey(event: any): string {
  if (event.source.type === 'group') {
    return `group:${event.source.groupId}`;
  }

  if (event.source.type === 'user') {
    return `user:${event.source.userId}`;
  }

  return 'unknown';
}


export function addToMemory(
  conversationKey: string,
  role: 'user' | 'assistant',
  text: string,
): void {
  const history = conversationMemory.get(conversationKey) || [];

  history.push({
    role,
    text,
  });

  while (history.length > MAX_MEMORY_MESSAGES) {
    history.shift();
  }

  conversationMemory.set(conversationKey, history);
}


export function getMemory(
  conversationKey: string,
): MemoryMessage[] {
  return conversationMemory.get(conversationKey) || [];
}


export function buildConversationPrompt(
  history: MemoryMessage[],
  currentMessage: string,
): string {
  let prompt = '';

  if (history.length > 0) {
    prompt += '以下是最近的聊天內容，請自然地參考這些上下文：\n\n';

    for (const message of history) {
      const speaker =
        message.role === 'user' ? '使用者' : '大內總管';

      prompt += `${speaker}：${message.text}\n`;
    }

    prompt += '\n';
  }

  prompt += `使用者現在說：${currentMessage}`;

  return prompt;
}