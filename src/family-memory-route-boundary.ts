import {
  FamilyMemoryExecutionResult,
  executeFamilyMemoryIntent,
} from './family-memory-intent-executor';
import {
  FamilyMemoryIntent,
  parseFamilyMemoryIntent,
} from './family-memory-intent';
import { FamilyMemoryIntegration } from './family-memory-integration';

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
  integration?: FamilyMemoryIntegration;
};

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

  const intent = parseFamilyMemoryIntent(text);
  if (intent.type === 'unknown') {
    return { type: 'not_handled', intent };
  }

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
