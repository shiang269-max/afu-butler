import {
  FamilyMemoryExecutionResult,
  executeFamilyMemoryIntent,
} from './family-memory-intent-executor';
import {
  FamilyMemoryIntent,
  parseFamilyMemoryIntent,
} from './family-memory-intent';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { resolveFamilyMemorySubject } from './family-memory-subject';
import { resolveFamilyTitle } from './family-title-resolver';
import {
  consumePendingFamilyMemory,
  setPendingFamilyMemory,
} from './family-memory-pending';

export type FamilyMemoryRouteResult =
  | { type: 'skipped_existing_function' }
  | {
      type: 'executed';
      intent: FamilyMemoryIntent;
      result: FamilyMemoryExecutionResult;
    }
  | { type: 'not_handled'; intent: FamilyMemoryIntent };

export type FamilyMemoryRouteOptions = {
  existingFunctionMatched: boolean;
  actorUserId?: string;
  integration?: FamilyMemoryIntegration;
};

function normalizeStyleFamilyTitle(text: string): string {
  const target = resolveFamilyTitle(text);
  if (!target) return text;

  const primaryName = target.member.primaryNames[0] || target.member.identity;
  if (!primaryName) return text;

  return text.split(target.title).join(primaryName);
}

function resolveActorSubject(
  intent: FamilyMemoryIntent,
  actorUserId?: string,
): FamilyMemoryIntent {
  const resolveSubject = (subject: string | undefined): string | undefined => {
    const styleTarget = resolveFamilyTitle(subject || '');
    if (styleTarget) {
      return styleTarget.member.primaryNames[0] || styleTarget.member.identity;
    }

    return resolveFamilyMemorySubject(subject, actorUserId);
  };

  if (intent.type === 'add_memory') {
    return {
      ...intent,
      input: {
        ...intent.input,
        subject: resolveSubject(intent.input.subject) || intent.input.subject,
      },
    };
  }

  if (intent.type === 'query_memory' || intent.type === 'forget_memory') {
    return {
      ...intent,
      query: {
        ...intent.query,
        subject: resolveSubject(intent.query.subject),
      },
    };
  }

  if (intent.type === 'add_record') {
    return {
      ...intent,
      input: {
        ...intent.input,
        subject: resolveSubject(intent.input.subject) || intent.input.subject,
      },
    };
  }

  if (
    intent.type === 'list_records' ||
    intent.type === 'average' ||
    intent.type === 'trend'
  ) {
    return {
      ...intent,
      query: {
        ...intent.query,
        subject: resolveSubject(intent.query.subject),
      },
    };
  }

  return intent;
}

function parsePendingMemoryAction(
  text: string,
  memories: Array<{ id: string }>,
): FamilyMemoryIntent | null {
  const normalized = text.trim();

  const cancelMatch = normalized.match(/^(?:取消|刪除)\s*(\d+)$/u);
  if (cancelMatch) {
    const index = Number(cancelMatch[1]) - 1;
    const memory = memories[index];
    return memory
      ? { type: 'cancel_pending_memory', input: { id: memory.id } }
      : null;
  }

  const updateMatch = normalized.match(
    /^修改\s*(\d+)\s*(?:(?:為|成|改成)\s*)?(.+)$/u,
  );
  if (updateMatch) {
    const index = Number(updateMatch[1]) - 1;
    const memory = memories[index];
    const content = updateMatch[2].trim();

    if (memory && content) {
      return {
        type: 'update_memory',
        input: { id: memory.id, content },
      };
    }
  }

  return null;
}

/**
 * Family Memory 與既有總管功能之間的安全邊界。
 *
 * 既有功能一旦已經認領訊息，Memory 不得再解析或執行同一則訊息。
 * 下一句修改／取消狀態只在本次 route invocation 消費一次。
 */
export function routeFamilyMemoryMessage(
  text: string,
  options: FamilyMemoryRouteOptions,
): FamilyMemoryRouteResult {
  const pending = options.actorUserId
    ? consumePendingFamilyMemory(options.actorUserId)
    : null;

  if (pending && options.existingFunctionMatched) {
    return { type: 'skipped_existing_function' };
  }

  if (options.existingFunctionMatched) {
    return { type: 'skipped_existing_function' };
  }

  const integration = options.integration;
  if (!integration) {
    throw new Error('執行 Family Memory 必須提供 Integration');
  }

  if (pending) {
    const pendingIntent = parsePendingMemoryAction(text, pending.memories);
    if (pendingIntent) {
      const result = executeFamilyMemoryIntent(pendingIntent, integration);
      if (result) {
        return { type: 'executed', intent: pendingIntent, result };
      }
    }
  }

  const normalizedText = normalizeStyleFamilyTitle(text);
  const parsedIntent = parseFamilyMemoryIntent(normalizedText);

  if (parsedIntent.type === 'unknown') {
    return { type: 'not_handled', intent: parsedIntent };
  }

  const intent = resolveActorSubject(parsedIntent, options.actorUserId);
  const result = executeFamilyMemoryIntent(intent, integration);
  if (!result) return { type: 'not_handled', intent };

  if (intent.type === 'query_memory' && result.type === 'memories_found') {
    setPendingFamilyMemory(options.actorUserId || '', result.memories.slice(0, 10));
  }

  return { type: 'executed', intent, result };
}