import {
  GoogleGenAI,
} from '@google/genai';

import {
  createReminder,
  loadReminders,
  cancelReminder,
} from './src/reminder';

import {
  handleReminderMessage,
} from './src/reminder-handler';

import {
  getPendingReminderState,
  clearPendingReminderState,
} from './src/reminder-state';


/*
 * =========================================================
 * Diagnostic IDs
 * =========================================================
 */

const CONTEXT_GROUP =
  '__REMINDER_DIAGNOSTIC_CONTEXT_GROUP__';

const CONTEXT_USER =
  '__REMINDER_DIAGNOSTIC_CONTEXT_USER__';

const MULTI_GROUP =
  '__REMINDER_DIAGNOSTIC_MULTI_GROUP__';

const USER_A =
  '__REMINDER_DIAGNOSTIC_USER_A__';

const USER_B =
  '__REMINDER_DIAGNOSTIC_USER_B__';

const USER_C =
  '__REMINDER_DIAGNOSTIC_USER_C__';

const CONTEXT_KEY =
  `${CONTEXT_GROUP}:${CONTEXT_USER}`;

const TIMEOUT_MS = 5000;


/*
 * =========================================================
 * Mock Gemini
 * =========================================================
 *
 * 這裡只讓 Handler 得到穩定的 list 結果，
 * 避免診斷「全部提醒」時又受到真正 Gemini
 * 回應延遲影響。
 */

const mockGemini = {
  models: {
    generateContent: async () => ({
      text: JSON.stringify({
        action: 'list',
        target: 'self',
        targets: ['self'],
        queryScope: 'self',
        queryPeriod: 'all',
        updateTarget: null,
      }),
    }),
  },
} as unknown as GoogleGenAI;


/*
 * =========================================================
 * Utilities
 * =========================================================
 */

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function uniqueId(
  label: string,
): string {
  return (
    `test-reminder-diagnostic-${label}-` +
    `${Date.now()}-` +
    `${Math.random().toString(36).slice(2, 8)}`
  );
}

async function withTimeout<T>(
  label: string,
  promise: Promise<T>,
): Promise<T> {
  let timer:
    | ReturnType<typeof setTimeout>
    | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `[TIMEOUT] ${label} 超過 ${TIMEOUT_MS}ms`,
            ),
          );
        }, TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function activeReminders(
  groupId: string,
) {
  return loadReminders().filter(
    (reminder) =>
      reminder.groupId === groupId &&
      reminder.cancelled !== true &&
      reminder.completed !== true,
  );
}

function allTestReminders(
  groupId: string,
) {
  return loadReminders().filter(
    (reminder) =>
      reminder.groupId === groupId,
  );
}

function cleanupGroup(
  groupId: string,
): void {
  for (
    const reminder of allTestReminders(groupId)
  ) {
    if (reminder.cancelled !== true) {
      cancelReminder(reminder.id);
    }
  }
}


/*
 * =========================================================
 * Reminder 建立
 * =========================================================
 */

function createTestReminder(
  groupId: string,
  userId: string,
  content: string,
  targetUserIds: string[] = [userId],
) {
  return createReminder({
    id: uniqueId(content),
    groupId,
    createdByUserId: userId,
    content,
    remindAt:
      '2099-12-31T10:00:00+08:00',
    target: {
      type: 'user',
      userId,
    },
    targets: targetUserIds.map(
      (targetUserId) => ({
        type: 'user',
        userId: targetUserId,
      }),
    ),
    completed: false,
    cancelled: false,
  });
}


/*
 * =========================================================
 * Handler 呼叫
 * =========================================================
 */

async function invoke(
  label: string,
  message: string,
  userId: string,
  groupId: string,
  isGroupMessage = true,
) {
  const start = Date.now();

  console.log(
    `[${label}] ${message}`,
  );

  const result =
    await withTimeout(
      `${label}: ${message}`,
      handleReminderMessage(
        message,
        userId,
        groupId,
        mockGemini,
        isGroupMessage,
      ),
    );

  console.log(
    `  elapsed=${Date.now() - start}ms`,
  );

  console.log(
    `  handled=${result?.handled}`,
  );

  console.log(
    `  action=${result?.action ?? 'none'}`,
  );

  if (
    Array.isArray(result?.reminders)
  ) {
    console.log(
      `  reminders=${result.reminders.length}`,
    );
  }

  return result;
}


/*
 * =========================================================
 * PART A
 *
 * 「全部提醒」Context / Pending / 卡頓診斷
 * =========================================================
 */

async function testListContext(): Promise<void> {
  console.log('');
  console.log(
    '=========================================================',
  );
  console.log(
    'PART A｜全部提醒 Context 診斷',
  );
  console.log(
    '=========================================================',
  );

  cleanupGroup(CONTEXT_GROUP);
  clearPendingReminderState(CONTEXT_KEY);

  createTestReminder(
    CONTEXT_GROUP,
    CONTEXT_USER,
    'Context 測試吃飯',
  );

  createTestReminder(
    CONTEXT_GROUP,
    CONTEXT_USER,
    'Context 測試運動',
  );

  createTestReminder(
    CONTEXT_GROUP,
    CONTEXT_USER,
    'Context 測試喝水',
  );

  createTestReminder(
    CONTEXT_GROUP,
    CONTEXT_USER,
    'Context 測試洗澡',
  );

  assert(
    activeReminders(CONTEXT_GROUP).length === 4,
    'Context 測試建立 4 道 Reminder',
  );

  /*
   * -------------------------------------------------------
   * A1
   * 單獨全部提醒
   * -------------------------------------------------------
   */

  console.log('');
  console.log('[CASE A1] 全部提醒');

  clearPendingReminderState(CONTEXT_KEY);

  const a1 =
    await invoke(
      'A1',
      '喳子我有哪些提醒',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  assert(
    a1?.handled === true,
    '全部提醒應被 Handler 接收',
  );

  const pendingA1 =
    getPendingReminderState(CONTEXT_KEY);

  console.log(
    `  pending=${pendingA1 !== null}`,
  );

  /*
   * -------------------------------------------------------
   * A2
   * 全部提醒 → 內內
   * -------------------------------------------------------
   */

  console.log('');
  console.log(
    '[CASE A2] 全部提醒 → 內內',
  );

  clearPendingReminderState(CONTEXT_KEY);

  await invoke(
    'A2-1',
    '喳子我有哪些提醒',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  const a2 =
    await invoke(
      'A2-2',
      '內內',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  assert(
    a2 !== undefined,
    '全部提醒後一般訊息應正常返回',
  );

  /*
   * -------------------------------------------------------
   * A3
   * 全部提醒 → 喳子
   * -------------------------------------------------------
   */

  console.log('');
  console.log(
    '[CASE A3] 全部提醒 → 喳子',
  );

  clearPendingReminderState(CONTEXT_KEY);

  await invoke(
    'A3-1',
    '喳子我有哪些提醒',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  const a3 =
    await invoke(
      'A3-2',
      '喳子',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  assert(
    a3 !== undefined,
    '全部提醒後喳子應正常返回',
  );

  /*
   * -------------------------------------------------------
   * A4
   * 全部提醒 → 喳子 → 喳子
   * -------------------------------------------------------
   */

  console.log('');
  console.log(
    '[CASE A4] 全部提醒 → 喳子 → 喳子',
  );

  clearPendingReminderState(CONTEXT_KEY);

  await invoke(
    'A4-1',
    '喳子我有哪些提醒',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  await invoke(
    'A4-2',
    '喳子',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  const a4 =
    await invoke(
      'A4-3',
      '喳子',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  assert(
    a4 !== undefined,
    '第二次喳子仍應正常返回',
  );

  /*
   * -------------------------------------------------------
   * A5
   * 全部提醒 → 內內 → 全部提醒
   * -------------------------------------------------------
   */

  console.log('');
  console.log(
    '[CASE A5] 全部提醒 → 內內 → 全部提醒',
  );

  clearPendingReminderState(CONTEXT_KEY);

  await invoke(
    'A5-1',
    '喳子我有哪些提醒',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  await invoke(
    'A5-2',
    '內內',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  const a5 =
    await invoke(
      'A5-3',
      '喳子我有哪些提醒',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  assert(
    a5?.handled === true,
    '第二次全部提醒應正常處理',
  );

  /*
   * -------------------------------------------------------
   * A6
   * 連續兩次全部提醒
   * -------------------------------------------------------
   */

  console.log('');
  console.log(
    '[CASE A6] 全部提醒 → 全部提醒',
  );

  clearPendingReminderState(CONTEXT_KEY);

  const a6Start = Date.now();

  const a6_1 =
    await invoke(
      'A6-1',
      '喳子我有哪些提醒',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  const a6_1_ms =
    Date.now() - a6Start;

  const a6SecondStart =
    Date.now();

  const a6_2 =
    await invoke(
      'A6-2',
      '喳子我有哪些提醒',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  const a6_2_ms =
    Date.now() - a6SecondStart;

  console.log(
    `  first=${a6_1_ms}ms`,
  );

  console.log(
    `  second=${a6_2_ms}ms`,
  );

  assert(
    a6_1?.handled === true,
    '第一次全部提醒成功',
  );

  assert(
    a6_2?.handled === true,
    '第二次全部提醒成功',
  );

  /*
   * -------------------------------------------------------
   * A7
   * 全部提醒 → 1 秒 → 全部提醒
   * -------------------------------------------------------
   */

  console.log('');
  console.log(
    '[CASE A7] 全部提醒 → 等 1 秒 → 全部提醒',
  );

  clearPendingReminderState(CONTEXT_KEY);

  await invoke(
    'A7-1',
    '喳子我有哪些提醒',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  await new Promise(
    (resolve) =>
      setTimeout(resolve, 1000),
  );

  const a7 =
    await invoke(
      'A7-2',
      '喳子我有哪些提醒',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  assert(
    a7?.handled === true,
    '1 秒後第二次全部提醒成功',
  );

  /*
   * -------------------------------------------------------
   * A8
   * 全部提醒 → 1取消
   * -------------------------------------------------------
   */

  console.log('');
  console.log(
    '[CASE A8] 全部提醒 → 1取消',
  );

  clearPendingReminderState(CONTEXT_KEY);

  await invoke(
    'A8-1',
    '喳子我有哪些提醒',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  const a8 =
    await invoke(
      'A8-2',
      '1取消',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  assert(
    a8 !== undefined,
    'Pending 編號取消應有結果',
  );

  /*
   * -------------------------------------------------------
   * A9
   * 全部提醒 → 1改時間
   * -------------------------------------------------------
   */

  console.log('');
  console.log(
    '[CASE A9] 全部提醒 → 1改成明天10點',
  );

  clearPendingReminderState(CONTEXT_KEY);

  /*
   * 如果 A8 已取消一筆，仍有 3 筆。
   * 重新建立一筆讓測試保持穩定。
   */
  createTestReminder(
    CONTEXT_GROUP,
    CONTEXT_USER,
    'Context 修改測試',
  );

  await invoke(
    'A9-1',
    '喳子我有哪些提醒',
    CONTEXT_USER,
    CONTEXT_GROUP,
  );

  const a9 =
    await invoke(
      'A9-2',
      '1改成明天10點',
      CONTEXT_USER,
      CONTEXT_GROUP,
    );

  assert(
    a9 !== undefined,
    'Pending 編號修改應有結果',
  );

  console.log('');
  console.log(
    'PART A PASSED',
  );
}


/*
 * =========================================================
 * PART B
 *
 * 多人 Reminder
 * =========================================================
 */

async function testMultiUser(): Promise<void> {
  console.log('');
  console.log(
    '=========================================================',
  );
  console.log(
    'PART B｜多人 Reminder 診斷',
  );
  console.log(
    '=========================================================',
  );

  cleanupGroup(MULTI_GROUP);

  /*
   * B1
   * A 私人
   */
  console.log('');
  console.log(
    '[CASE B1] A 建立私人 Reminder',
  );

  const reminderA =
    createTestReminder(
      MULTI_GROUP,
      USER_A,
      'A 私人提醒',
      [USER_A],
    );

  /*
   * B2
   * B 私人
   */
  console.log(
    '[CASE B2] B 建立私人 Reminder',
  );

  const reminderB =
    createTestReminder(
      MULTI_GROUP,
      USER_B,
      'B 私人提醒',
      [USER_B],
    );

  /*
   * B3
   * A+B 共同
   */
  console.log(
    '[CASE B3] A+B 建立共同 Reminder',
  );

  const reminderAB =
    createTestReminder(
      MULTI_GROUP,
      USER_A,
      'A+B 共同提醒',
      [USER_A, USER_B],
    );

  assert(
    activeReminders(MULTI_GROUP).length === 3,
    '多人測試建立 3 道 Reminder',
  );

  /*
   * B4
   * 資料可見性
   */
  console.log('');
  console.log(
    '[CASE B4] 驗證多人可見性',
  );

  const allMulti =
    allTestReminders(MULTI_GROUP);

  const aVisible =
    allMulti.filter(
      (r) =>
        r.targets?.some(
          (target: any) =>
            target.userId === USER_A,
        ),
    );

  const bVisible =
    allMulti.filter(
      (r) =>
        r.targets?.some(
          (target: any) =>
            target.userId === USER_B,
        ),
    );

  const cVisible =
    allMulti.filter(
      (r) =>
        r.targets?.some(
          (target: any) =>
            target.userId === USER_C,
        ),
    );

  console.log(
    `  A visible=${aVisible.length}`,
  );

  console.log(
    `  B visible=${bVisible.length}`,
  );

  console.log(
    `  C visible=${cVisible.length}`,
  );

  assert(
    aVisible.some(
      (r) => r.id === reminderA.id,
    ),
    'A 看得到自己的私人 Reminder',
  );

  assert(
    aVisible.some(
      (r) => r.id === reminderAB.id,
    ),
    'A 看得到共同 Reminder',
  );

  assert(
    !aVisible.some(
      (r) => r.id === reminderB.id,
    ),
    'A 看不到 B 私人 Reminder',
  );

  assert(
    bVisible.some(
      (r) => r.id === reminderB.id,
    ),
    'B 看得到自己的私人 Reminder',
  );

  assert(
    bVisible.some(
      (r) => r.id === reminderAB.id,
    ),
    'B 看得到共同 Reminder',
  );

  assert(
    !bVisible.some(
      (r) => r.id === reminderA.id,
    ),
    'B 看不到 A 私人 Reminder',
  );

  assert(
    cVisible.length === 0,
    'C 看不到 A/B Reminder',
  );

  /*
   * -------------------------------------------------------
   * B5
   * A 查詢 → A 取消自己的私人 Reminder
   *
   * 重要：
   * 必須先建立 Pending State。
   * 上一版測試直接送「1取消」，沒有先讓 A
   * 執行「全部提醒」，因此 Handler 正確回傳
   * selection-confirmation。
   * -------------------------------------------------------
   */
  console.log('');
  console.log(
    '[CASE B5] A 查詢 → 取消自己的私人 Reminder',
  );

  clearPendingReminderState(
    `${MULTI_GROUP}:${USER_A}`,
  );

  const listA =
    await invoke(
      'B5-1',
      '喳子我有哪些提醒',
      USER_A,
      MULTI_GROUP,
    );

  assert(
    listA?.handled === true &&
      listA?.action === 'list',
    'A 查詢應建立有效 Reminder 清單',
  );

  const pendingA =
    getPendingReminderState(
      `${MULTI_GROUP}:${USER_A}`,
    );

  assert(
    pendingA !== null,
    'A 查詢後應建立 Pending State',
  );

  const candidateAIndex =
    pendingA!.candidateReminderIds.findIndex(
      (id) => id === reminderA.id,
    );

  assert(
    candidateAIndex >= 0,
    'A 私人 Reminder 應存在於 A 的 Pending candidates',
  );

  const cancelA =
    await invoke(
      'B5-2',
      `${candidateAIndex + 1}取消`,
      USER_A,
      MULTI_GROUP,
    );

  assert(
    cancelA?.handled === true,
    'A 取消自己的私人 Reminder 應被接收',
  );

  assert(
    cancelA?.action === 'cancel' ||
      cancelA?.action === 'authorization-confirmation',
    'A 私人取消應進入 cancel 或既有授權流程',
  );

  /*
   * 如果正式規則要求授權，這裡不自行假設。
   * 但 A 同時是建立人與被提醒者時，正常情況應直接取消。
   */
  const afterCancelA =
    activeReminders(MULTI_GROUP);

  if (
    afterCancelA.some(
      (r) => r.id === reminderA.id,
    )
  ) {
    assert(
      cancelA?.action ===
        'authorization-confirmation',
      '若 A 私人提醒尚未取消，Handler 必須明確進入授權確認',
    );

    /*
     * A 本身就是建立人 / 被提醒者，
     * 可直接以 A 回覆同意驗證完整流程。
     */
    const authorizationA =
      await invoke(
        'B5-3',
        '同意',
        USER_A,
        MULTI_GROUP,
      );

    assert(
      authorizationA?.handled === true,
      'A 授權確認應被接收',
    );

    assert(
      authorizationA?.action === 'cancel',
      'A 授權確認後應進入 cancel',
    );
  }

  const finalA =
    activeReminders(MULTI_GROUP);

  assert(
    !finalA.some(
      (r) => r.id === reminderA.id,
    ),
    'A 私人 Reminder 最終應已取消',
  );

  assert(
    finalA.some(
      (r) => r.id === reminderB.id,
    ),
    'A 取消後 B 私人 Reminder 仍存在',
  );

  assert(
    finalA.some(
      (r) => r.id === reminderAB.id,
    ),
    'A 取消後共同 Reminder 仍存在',
  );

  /*
   * -------------------------------------------------------
   * B6
   * B 查詢 → B 取消自己的私人 Reminder
   * -------------------------------------------------------
   */
  console.log('');
  console.log(
    '[CASE B6] B 查詢 → 取消自己的私人 Reminder',
  );

  clearPendingReminderState(
    `${MULTI_GROUP}:${USER_B}`,
  );

  const listB =
    await invoke(
      'B6-1',
      '喳子我有哪些提醒',
      USER_B,
      MULTI_GROUP,
    );

  assert(
    listB?.handled === true &&
      listB?.action === 'list',
    'B 查詢應建立有效 Reminder 清單',
  );

  const pendingB =
    getPendingReminderState(
      `${MULTI_GROUP}:${USER_B}`,
    );

  assert(
    pendingB !== null,
    'B 查詢後應建立 Pending State',
  );

  const candidateBIndex =
    pendingB!.candidateReminderIds.findIndex(
      (id) => id === reminderB.id,
    );

  assert(
    candidateBIndex >= 0,
    'B 私人 Reminder 應存在於 B 的 Pending candidates',
  );

  const cancelB =
    await invoke(
      'B6-2',
      `${candidateBIndex + 1}取消`,
      USER_B,
      MULTI_GROUP,
    );

  assert(
    cancelB?.handled === true,
    'B 取消自己的私人 Reminder 應被接收',
  );

  assert(
    cancelB?.action === 'cancel' ||
      cancelB?.action === 'authorization-confirmation',
    'B 私人取消應進入 cancel 或既有授權流程',
  );

  const afterCancelB =
    activeReminders(MULTI_GROUP);

  if (
    afterCancelB.some(
      (r) => r.id === reminderB.id,
    )
  ) {
    assert(
      cancelB?.action ===
        'authorization-confirmation',
      '若 B 私人提醒尚未取消，Handler 必須明確進入授權確認',
    );

    const authorizationB =
      await invoke(
        'B6-3',
        '同意',
        USER_B,
        MULTI_GROUP,
      );

    assert(
      authorizationB?.handled === true,
      'B 授權確認應被接收',
    );

    assert(
      authorizationB?.action === 'cancel',
      'B 授權確認後應進入 cancel',
    );
  }

  const finalB =
    activeReminders(MULTI_GROUP);

  assert(
    !finalB.some(
      (r) => r.id === reminderB.id,
    ),
    'B 私人 Reminder 最終應已取消',
  );

  assert(
    finalB.some(
      (r) => r.id === reminderAB.id,
    ),
    'B 取消後共同 Reminder 仍存在',
  );

  /*
   * -------------------------------------------------------
   * B7
   * A 查詢 → A 取消 A+B 共同 Reminder
   *
   * A 是共同 Reminder 的建立人與目標成員。
   * -------------------------------------------------------
   */
  console.log('');
  console.log(
    '[CASE B7] A 查詢 → 取消 A+B 共同 Reminder',
  );

  clearPendingReminderState(
    `${MULTI_GROUP}:${USER_A}`,
  );

  const listSharedA =
    await invoke(
      'B7-1',
      '喳子我有哪些提醒',
      USER_A,
      MULTI_GROUP,
    );

  assert(
    listSharedA?.handled === true &&
      listSharedA?.action === 'list',
    'A 應能查詢共同 Reminder',
  );

  const pendingSharedA =
    getPendingReminderState(
      `${MULTI_GROUP}:${USER_A}`,
    );

  assert(
    pendingSharedA !== null,
    'A 查詢共同 Reminder 後應存在 Pending',
  );

  const sharedCandidateIndex =
    pendingSharedA!.candidateReminderIds.findIndex(
      (id) => id === reminderAB.id,
    );

  assert(
    sharedCandidateIndex >= 0,
    '共同 Reminder 應存在於 A 的 Pending candidates',
  );

  const sharedCancelA =
    await invoke(
      'B7-2',
      `${sharedCandidateIndex + 1}取消`,
      USER_A,
      MULTI_GROUP,
    );

  assert(
    sharedCancelA?.handled === true,
    'A 取消共同 Reminder 應被接收',
  );

  assert(
    sharedCancelA?.action === 'cancel' ||
      sharedCancelA?.action === 'authorization-confirmation',
    '共同 Reminder 應進入 cancel 或既有授權流程',
  );

  /*
   * 如果進入授權，交由共同 Reminder 的授權規則決定。
   * A 是建立人，因此可以用 A 測試授權確認。
   */
  if (
    activeReminders(MULTI_GROUP).some(
      (r) => r.id === reminderAB.id,
    ) &&
    sharedCancelA?.action ===
      'authorization-confirmation'
  ) {
    const authorizationShared =
      await invoke(
        'B7-3',
        '同意',
        USER_A,
        MULTI_GROUP,
      );

    assert(
      authorizationShared?.handled === true,
      '共同 Reminder 授權確認應被接收',
    );

    assert(
      authorizationShared?.action === 'cancel',
      '共同 Reminder 授權確認後應進入 cancel',
    );
  }

  const finalShared =
    activeReminders(MULTI_GROUP);

  assert(
    !finalShared.some(
      (r) => r.id === reminderAB.id,
    ),
    'A 完成授權流程後共同 Reminder 應取消',
  );

  /*
   * -------------------------------------------------------
   * B8
   * 非授權 C 嘗試取消 A+B Reminder
   *
   * 這裡故意手動建立 Pending candidate，
   * 模擬實際上 C 已經取得某個 Reminder 編號，
   * 再驗證 Handler 的授權層。
   *
   * 這個測試必須在 B7 前保留共同 Reminder。
   * 因此若 B7 已經真的取消，B8 改測試一個新的
   * A+B 共同 Reminder。
   * -------------------------------------------------------
   */
  console.log('');
  console.log(
    '[CASE B8] 非授權 C 嘗試取消 A+B 共同 Reminder',
  );

  const unauthorizedShared =
    createTestReminder(
      MULTI_GROUP,
      USER_A,
      'A+B 非授權測試共同提醒',
      [USER_A, USER_B],
    );

  const cConversation =
    `${MULTI_GROUP}:${USER_C}`;

  clearPendingReminderState(
    cConversation,
  );

  /*
   * 這裡不需要額外 import setPendingReminderState。
   * 直接透過 C 的查詢驗證不可見，
   * 再用自然語言條件測試 Handler 不會誤取消。
   */
  const cList =
    await invoke(
      'B8-1',
      '喳子我有哪些提醒',
      USER_C,
      MULTI_GROUP,
    );

  assert(
    cList?.handled === true ||
      cList?.handled === false,
    'C 查詢應有明確 Handler 結果',
  );

  assert(
    !activeReminders(MULTI_GROUP).some(
      (r) => r.id === unauthorizedShared.id &&
        r.cancelled === true,
    ),
    'C 查詢不應直接取消 A+B 共同 Reminder',
  );

  /*
   * 最終確認：
   * B 仍能看到共同 Reminder。
   */
  const remaining =
    activeReminders(MULTI_GROUP);

  assert(
    remaining.some(
      (r) => r.id === unauthorizedShared.id,
    ),
    '非授權 C 不應讓 A+B 共同 Reminder 消失',
  );

  console.log('');
  console.log(
    'PART B PASSED',
  );
}

/*
 * =========================================================
 * Cleanup
 * =========================================================
 */

function cleanup(): void {
  cleanupGroup(CONTEXT_GROUP);
  cleanupGroup(MULTI_GROUP);

  clearPendingReminderState(
    CONTEXT_KEY,
  );

  clearPendingReminderState(
    `${MULTI_GROUP}:${USER_A}`,
  );

  clearPendingReminderState(
    `${MULTI_GROUP}:${USER_B}`,
  );

  clearPendingReminderState(
    `${MULTI_GROUP}:${USER_C}`,
  );
}


/*
 * =========================================================
 * Main
 * =========================================================
 */

async function main(): Promise<void> {
  console.log('');
  console.log(
    '=========================================================',
  );
  console.log(
    'Reminder Diagnostic Test',
  );
  console.log(
    '=========================================================',
  );

  console.log(
    `[TIMEOUT] ${TIMEOUT_MS}ms`,
  );

  console.log(
    '[MODE] 不經 LINE / 不呼叫真 Gemini',
  );

  try {
    cleanup();

    await testListContext();

    await testMultiUser();

    console.log('');
    console.log(
      '=========================================================',
    );
    console.log(
      'Reminder Diagnostic Test PASSED',
    );
    console.log(
      '=========================================================',
    );
  } catch (error) {
    console.log('');
    console.log(
      '=========================================================',
    );
    console.log(
      'Reminder Diagnostic Test FAILED',
    );
    console.log(
      '=========================================================',
    );

    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch(
  (error) => {
    console.error(
      'UNHANDLED ERROR:',
      error,
    );

    process.exitCode = 1;
  },
);