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

export type FamilyMemoryRouteResult =
  | {
      type: 'skipped_existing_function';
    }
  | {
      type: 'executed';
      intent: FamilyMemoryIntent;
      result: FamilyMemoryExecutionResult;
    }
  | {
      type: 'not_handled';
      intent: FamilyMemoryIntent;
    };

export type FamilyMemoryRouteOptions = {
  existingFunctionMatched: boolean;
  actorUserId?: string;
  integration?: FamilyMemoryIntegration;
};

function resolveActorSubject(
  intent: FamilyMemoryIntent,
  actorUserId?: string,
): FamilyMemoryIntent {
  const resolveSubject = (
    subject: string | undefined,
  ): string | undefined => {
    const styleTarget =
      resolveFamilyTitle(subject || '');

    if (styleTarget) {
      return styleTarget.member.primaryNames[0]
        || styleTarget.member.identity;
    }

    return resolveFamilyMemorySubject(
      subject,
      actorUserId,
    );
  };

  if (intent.type === 'add_memory') {
    return {
      ...intent,
      input: {
        ...intent.input,
        subject: resolveSubject(intent.input.subject)
          || intent.input.subject,
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

  if (
    intent.type === 'add_record' ||
    intent.type === 'list_records' ||
    intent.type === 'average' ||
    intent.type === 'trend'
  ) {
    if (intent.type === 'add_record') {
      return {
        ...intent,
        input: {
          ...intent.input,
          subject:
            resolveSubject(intent.input.subject)
            || intent.input.subject,
        },
      };
    }

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

/**
 * Family Memory 與既有總管功能之間的安全邊界。
 *
 * 既有功能一旦已經認領訊息，Memory 不得再解析或執行同一則訊息。
 * 因此這個邊界必須由既有路由先決定 existingFunctionMatched，
 * Memory 本身不反向猜測 Vote / Reminder / Location / Function Help。
 */
export function routeFamilyMemoryMessage(
  text: string,
  options: FamilyMemoryRouteOptions,
): FamilyMemoryRouteResult {
  if (options.existingFunctionMatched) {
    return { type: 'skipped_existing_function' };
  }

  const parsedIntent = parseFamilyMemoryIntent(text);
  if (parsedIntent.type === 'unknown') {
    return { type: 'not_handled', intent: parsedIntent };
  }

  const intent = resolveActorSubject(
    parsedIntent,
    options.actorUserId,
  );

  const integration = options.integration;
  if (!integration) {
    throw new Error('執行 Family Memory 必須提供 Integration');
  }

  const result = executeFamilyMemoryIntent(intent, integration);
  if (!result) {
    return { type: 'not_handled', intent };
  }

  return {
    type: 'executed',
    intent,
    result,
  };
}
