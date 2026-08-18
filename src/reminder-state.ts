/*
 * =========================================================
 * Reminder State
 * =========================================================
 *
 * 負責跨訊息的 Reminder 待確認狀態。
 *
 * 這個模組只保存短暫的對話狀態。
 *
 * 不負責：
 *
 * - Reminder 資料
 * - Gemini
 * - LINE
 * - Scheduler
 */

/*
 * =========================================================
 * Pending Reminder Action
 * =========================================================
 */

export type ReminderPendingAction =
  | 'cancel'
  | 'update'
  | 'duplicate';


/*
 * =========================================================
 * Pending Reminder
 * =========================================================
 */

export interface PendingReminderState {

  conversationKey: string;

  userId: string;

  groupId: string;

  action: ReminderPendingAction;

  /*
   * 上一次操作涉及的 Reminder。
   *
   * 注意：
   * 這裡只保存「候選 ID」，
   * 不保存模糊查詢結果。
   *
   * 真正執行操作前，
   * Handler 必須重新從目前有效 Reminder
   * 驗證這些 ID 是否仍存在。
   */

  candidateReminderIds: string[];

  /*
   * 是否為需要明確確認的操作。
   */

  requiresConfirmation?: boolean;

  /*
   * 是否允許使用簡短確認詞：
   *
   * 要
   * 好
   * 確定
   * 是
   */

  confirmationRequired?: boolean;

  /*
   * 使用者原始操作。
   */

  originalRequest?: string;

  /*
   * 建立時間。
   */

  createdAt: number;

  /*
   * 過期時間。
   */

  expiresAt: number;
}


/*
 * =========================================================
 * 狀態保存
 * =========================================================
 *
 * 這不是永久資料。
 *
 * Reminder 本身不受影響。
 * =========================================================
 */

const pendingStates =
  new Map<
    string,
    PendingReminderState
  >();


/*
 * =========================================================
 * 預設有效時間
 * =========================================================
 *
 * 10 分鐘。
 *
 * 避免使用者隔很久後說：
 *
 * 「第一個」
 *
 * 系統卻誤套到舊操作。
 * =========================================================
 */

const STATE_TTL_MS =
  10 * 60 * 1000;


/*
 * =========================================================
 * 建立 Pending State
 * =========================================================
 */

export function setPendingReminderState(
  state: Omit<
    PendingReminderState,
    'createdAt' | 'expiresAt'
  >,
): void {

  const now =
    Date.now();

  pendingStates.set(
    state.conversationKey,
    {
      ...state,

      createdAt:
        now,

      expiresAt:
        now +
        STATE_TTL_MS,
    },
  );
}


/*
 * =========================================================
 * 取得 Pending State
 * =========================================================
 */

export function getPendingReminderState(
  conversationKey: string,
): PendingReminderState | null {

  const state =
    pendingStates.get(
      conversationKey,
    );

  if (!state) {
    return null;
  }

  if (
    Date.now() >
    state.expiresAt
  ) {

    pendingStates.delete(
      conversationKey,
    );

    return null;
  }

  return state;
}


/*
 * =========================================================
 * 清除 Pending State
 * =========================================================
 */

export function clearPendingReminderState(
  conversationKey: string,
): void {

  pendingStates.delete(
    conversationKey,
  );
}


/*
 * =========================================================
 * 更新 Pending State 有效時間
 * =========================================================
 */

export function refreshPendingReminderState(
  conversationKey: string,
): boolean {

  const state =
    pendingStates.get(
      conversationKey,
    );

  if (!state) {
    return false;
  }

  const now =
    Date.now();

  if (
    now >
    state.expiresAt
  ) {

    pendingStates.delete(
      conversationKey,
    );

    return false;
  }

  state.expiresAt =
    now +
    STATE_TTL_MS;

  return true;
}


/*
 * =========================================================
 * 判斷是否存在有效 Pending State
 * =========================================================
 */

export function hasPendingReminderState(
  conversationKey: string,
): boolean {

  return (
    getPendingReminderState(
      conversationKey,
    ) !== null
  );
}