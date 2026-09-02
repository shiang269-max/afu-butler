import { mayBeReminder } from './reminder-handler';

export type ExistingFunctionMatch = {
  matched: boolean;
  reason?:
    | 'vote'
    | 'reminder'
    | 'location'
    | 'function-help';
};

/**
 * Family Memory 不負責重新判斷既有功能是否執行成功。
 *
 * 這個 Guard 只接受既有路由已經產生的 handled 訊號，
 * 不執行 Vote / Reminder / Location / Function Help。
 *
 * 正式接線時，index.ts 應在既有 Handler 完成後，
 * 將實際 handled 結果交給這裡，再決定 Memory 是否可以接手。
 */
export function detectExistingFunctionMatch(
  _text: string,
  signals: {
    voteHandled?: boolean;
    reminderHandled?: boolean;
    locationHandled?: boolean;
    functionHelpHandled?: boolean;
  } = {},
): ExistingFunctionMatch {
  if (signals.voteHandled) {
    return { matched: true, reason: 'vote' };
  }

  if (signals.reminderHandled) {
    return { matched: true, reason: 'reminder' };
  }

  if (signals.locationHandled) {
    return { matched: true, reason: 'location' };
  }

  if (signals.functionHelpHandled) {
    return { matched: true, reason: 'function-help' };
  }

  return { matched: false };
}

/**
 * Reminder 的初步保守訊號僅供未來接線端做額外防護。
 * 不代表 Reminder 已實際 handled。
 */
export function hasReminderLikeSignal(text: string): boolean {
  return mayBeReminder(text);
}
