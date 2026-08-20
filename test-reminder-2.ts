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
  setPendingReminderState,
  getPendingReminderState,
  clearPendingReminderState,
} from './src/reminder-state';


/*
 * =========================================================
 * Reminder 2.0 Regression Test
 * =========================================================
 *
 * 目前只測試已確認存在的 Reminder 正式功能。
 *
 * 不測試：
 *
 * - Duplicate
 * - 尚未確認為正式功能的操作
 *
 * 測試重點：
 *
 * 1. Reminder 建立
 * 2. Reminder 持久化
 * 3. Reminder 查詢
 * 4. Pending State
 * 5. 單筆取消
 * 6. 多筆取消
 * 7. 單筆修改
 * 8. 授權流程
 * 9. Stale Pending
 * 10. Pending TTL
 */


/*
 * =========================================================
 * 測試環境
 * =========================================================
 */

const TEST_GROUP_ID =
  '__REMINDER_2_TEST_GROUP__';

const TEST_USER_ID =
  'U59a66400a022a3ca71623a459b47ca56';

const TEST_MOTHER_ID =
  'U9c98637a20f237e5d5ea41e146daa55f';

const TEST_BROTHER_ID =
  'Ufa6b0fd0882910db320f311c4061dff8';

const conversationKey =
  `${TEST_GROUP_ID}:${TEST_USER_ID}`;


/*
 * =========================================================
 * Assertion
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

  console.log(
    `  ✓ ${message}`,
  );
}


/*
 * =========================================================
 * Mock Gemini
 * =========================================================
 *
 * Reminder 核心 Regression 不依賴真正 Gemini API。
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
 * 測試 Reminder 建立
 * =========================================================
 */

function createTestReminder(
  id: string,
  content: string,
  createdByUserId = TEST_USER_ID,
  targetUserId = TEST_USER_ID,
) {

  return createReminder({
    id,

    groupId:
      TEST_GROUP_ID,

    createdByUserId,

    content,

    /*
     * 避免 Scheduler 在測試期間觸發。
     */
    remindAt:
      '2099-12-31T10:00:00+08:00',

    target: {
      type: 'user',
      userId: targetUserId,
    },

    targets: [
      {
        type: 'user',
        userId: targetUserId,
      },
    ],

    completed: false,

    cancelled: false,
  });
}


/*
 * =========================================================
 * 測試資料
 * =========================================================
 */

function getTestReminders() {

  return loadReminders().filter(
    (reminder) =>
      reminder.groupId === TEST_GROUP_ID,
  );
}


function getActiveTestReminders() {

  return getTestReminders().filter(
    (reminder) =>
      reminder.cancelled !== true &&
      reminder.completed !== true,
  );
}


/*
 * =========================================================
 * Cleanup
 * =========================================================
 *
 * 不刪除歷史資料。
 *
 * 只將目前測試資料標記 cancelled，
 * 避免影響正式 Reminder。
 */

function cleanup(): void {

  for (
    const reminder of getTestReminders()
  ) {

    if (
      reminder.cancelled !== true
    ) {

      cancelReminder(
        reminder.id,
      );
    }
  }

  clearPendingReminderState(
    conversationKey,
  );
}


/*
 * =========================================================
 * Unique ID
 * =========================================================
 */

function uniqueId(
  label: string,
): string {

  return (
    `test-reminder-2-${label}-` +
    `${Date.now()}-` +
    `${Math.random().toString(36).slice(2, 8)}`
  );
}


/*
 * =========================================================
 * TEST 1
 * 建立兩筆 Reminder
 * =========================================================
 */

async function testCreate(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 1] 建立兩筆測試 Reminder',
  );


  const reminder1Id =
    uniqueId('create-1');

  const reminder2Id =
    uniqueId('create-2');


  const created1 =
    createTestReminder(
      reminder1Id,
      'Reminder 2.0 建立測試一',
    );


  const created2 =
    createTestReminder(
      reminder2Id,
      'Reminder 2.0 建立測試二',
    );


  const persisted =
    getTestReminders();


  assert(
    persisted.some(
      (item) =>
        item.id === created1.id,
    ),
    '第一筆 Reminder 建立成功並完成持久化驗證',
  );


  assert(
    persisted.some(
      (item) =>
        item.id === created2.id,
    ),
    '第二筆 Reminder 建立成功並完成持久化驗證',
  );


  assert(
    persisted.find(
      (item) =>
        item.id === created1.id,
    )?.content ===
      'Reminder 2.0 建立測試一',
    '第一筆 Reminder 內容正確',
  );


  assert(
    persisted.find(
      (item) =>
        item.id === created2.id,
    )?.content ===
      'Reminder 2.0 建立測試二',
    '第二筆 Reminder 內容正確',
  );
}


/*
 * =========================================================
 * TEST 2
 * 查詢 Reminder + Pending State
 * =========================================================
 */

async function testListAndPending(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 2] 查詢 Reminder 與 Pending State',
  );


  const reminder1Id =
    uniqueId('list-1');

  const reminder2Id =
    uniqueId('list-2');


  createTestReminder(
    reminder1Id,
    'Reminder 2.0 查詢測試一',
  );

  createTestReminder(
    reminder2Id,
    'Reminder 2.0 查詢測試二',
  );


  const result =
    await handleReminderMessage(
      '喳子我有哪些提醒',
      TEST_USER_ID,
      TEST_GROUP_ID,
      mockGemini,
      true,
    );


  assert(
    result.handled === true,
    '查詢指令被 Handler 正確接收',
  );


  assert(
    result.action === 'list',
    'Handler 正確判定為 list',
  );


  assert(
    Array.isArray(
      result.reminders,
    ),
    '查詢結果包含 reminders',
  );


  assert(
    (result.reminders?.length ?? 0) >= 2,
    '查詢結果包含兩筆測試 Reminder',
  );


  assert(
    result.reminders?.some(
      (item) =>
        item.id === reminder1Id,
    ) === true,
    '查詢結果包含第一筆 Reminder',
  );


  assert(
    result.reminders?.some(
      (item) =>
        item.id === reminder2Id,
    ) === true,
    '查詢結果包含第二筆 Reminder',
  );


  const pending =
    getPendingReminderState(
      conversationKey,
    );


  assert(
    pending !== null,
    '查詢後成功建立 Pending State',
  );


  assert(
    pending?.candidateReminderIds.includes(
      reminder1Id,
    ) === true,
    'Pending State 包含第一筆 Reminder',
  );


  assert(
    pending?.candidateReminderIds.includes(
      reminder2Id,
    ) === true,
    'Pending State 包含第二筆 Reminder',
  );
}


/*
 * =========================================================
 * TEST 3
 * 單筆編號取消
 * =========================================================
 */

async function testSingleCancelSelection(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 3] 單筆編號取消：1取消',
  );


  const reminder1Id =
    uniqueId('single-cancel');

  const reminder2Id =
    uniqueId('single-keep');


  createTestReminder(
    reminder1Id,
    '單筆取消測試',
  );

  createTestReminder(
    reminder2Id,
    '單筆保留測試',
  );


  await handleReminderMessage(
    '喳子我有哪些提醒',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    true,
  );


  const result =
    await handleReminderMessage(
      '1取消',
      TEST_USER_ID,
      TEST_GROUP_ID,
      mockGemini,
      false,
    );


  assert(
    result.handled === true,
    '1取消被 Pending State 接收',
  );


  assert(
    result.action === 'cancel',
    '1取消正確進入 cancel',
  );


  const first =
    getTestReminders().find(
      (item) =>
        item.id === reminder1Id,
    );


  const second =
    getTestReminders().find(
      (item) =>
        item.id === reminder2Id,
    );


  assert(
    first?.cancelled === true,
    '被選取的 Reminder 已標記 cancelled',
  );


  assert(
    second?.cancelled !== true,
    '未被選取的 Reminder 沒有被誤取消',
  );


  const active =
    getActiveTestReminders();


  assert(
    !active.some(
      (item) =>
        item.id === reminder1Id,
    ),
    '被取消 Reminder 不再屬於有效 Reminder',
  );


  assert(
    active.some(
      (item) =>
        item.id === reminder2Id,
    ),
    '未被選取 Reminder 仍屬於有效 Reminder',
  );


  assert(
    getPendingReminderState(
      conversationKey,
    ) === null,
    '取消完成後 Pending State 已清除',
  );
}


/*
 * =========================================================
 * TEST 4
 * 取消後重新查詢
 * =========================================================
 */

async function testCancelThenQuery(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 4] 取消後重新查詢',
  );


  const cancelId =
    uniqueId('query-cancel');

  const keepId =
    uniqueId('query-keep');


  createTestReminder(
    cancelId,
    '取消後不應出現',
  );

  createTestReminder(
    keepId,
    '取消後仍應出現',
  );


  const before =
    getTestReminders();


  assert(
    before.some(
      (item) =>
        item.id === cancelId,
    ),
    '取消前測試 Reminder 存在',
  );


  assert(
    before.some(
      (item) =>
        item.id === keepId,
    ),
    '保留 Reminder 存在',
  );


  const cancelled =
    cancelReminder(
      cancelId,
    );


  assert(
    cancelled === true,
    '資料層成功取消 Reminder',
  );


  clearPendingReminderState(
    conversationKey,
  );


  const afterCancel =
    loadReminders().find(
      (item) =>
        item.id === cancelId,
    );


  assert(
    afterCancel?.cancelled === true,
    '取消狀態已持久化',
  );


  const result =
    await handleReminderMessage(
      '喳子我有哪些提醒',
      TEST_USER_ID,
      TEST_GROUP_ID,
      mockGemini,
      true,
    );


  assert(
    result.action === 'list',
    '取消後再次查詢仍正確判定為 list',
  );


  assert(
    result.reminders?.some(
      (item) =>
        item.id === keepId,
    ) === true,
    '有效 Reminder 仍可被查詢',
  );


  assert(
    result.reminders?.some(
      (item) =>
        item.id === cancelId,
    ) !== true,
    '已取消 Reminder 不再出現在有效查詢結果',
  );
}


/*
 * =========================================================
 * TEST 5
 * 單筆編號修改時間
 * =========================================================
 *
 * 正式 LINE 已確認：
 *
 * 1改成今天晚上7點
 *
 * 可以正常修改。
 *
 * 因此這裡直接驗證：
 *
 * Handler
 * → update
 * → Reminder State
 * → 持久化
 */

async function testSingleUpdate(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 5] 單筆編號修改時間',
  );


  const updateId =
    uniqueId('update');


  createTestReminder(
    updateId,
    '單筆修改時間測試',
  );


  await handleReminderMessage(
    '喳子我有哪些提醒',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    true,
  );


  const before =
    loadReminders().find(
      (item) =>
        item.id === updateId,
    );


  assert(
    before !== undefined,
    '修改前 Reminder 存在',
  );


  const beforeRemindAt =
    before?.remindAt;


  const result =
    await handleReminderMessage(
      '1改成今天晚上7點',
      TEST_USER_ID,
      TEST_GROUP_ID,
      mockGemini,
      false,
    );


  assert(
    result.handled === true,
    '編號修改被 Handler 接收',
  );


  assert(
    result.action === 'update',
    '編號修改正確進入 update',
  );


  const after =
    loadReminders().find(
      (item) =>
        item.id === updateId,
    );


  assert(
    after !== undefined,
    '修改後 Reminder 仍存在於資料層',
  );


  assert(
    after?.remindAt !== beforeRemindAt,
    'Reminder remindAt 已真正發生修改',
  );


  assert(
    after?.remindAt !==
      '2099-12-31T10:00:00+08:00',
    'Reminder remindAt 已不再是修改前時間',
  );


  assert(
    getPendingReminderState(
      conversationKey,
    ) === null,
    '修改完成後 Pending State 已清除',
  );


  const reloaded =
    loadReminders().find(
      (item) =>
        item.id === updateId,
    );


  assert(
    reloaded?.remindAt ===
      after?.remindAt,
    '修改後 remindAt 重新讀取仍保持一致',
  );
}


/*
 * =========================================================
 * TEST 6
 * 多筆編號取消
 * ========================================================= */

async function testMultiCancel(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 6] 多筆編號取消',
  );


  const ids = [
    uniqueId('multi-1'),
    uniqueId('multi-2'),
    uniqueId('multi-3'),
  ];


  ids.forEach(
    (id, index) =>
      createTestReminder(
        id,
        `多筆取消測試 ${index + 1}`,
      ),
  );


  await handleReminderMessage(
    '喳子我有哪些提醒',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    true,
  );


  const result =
    await handleReminderMessage(
      '1、2取消',
      TEST_USER_ID,
      TEST_GROUP_ID,
      mockGemini,
      false,
    );


  assert(
    result.handled === true,
    '多筆取消被 Handler 接收',
  );


  assert(
    result.action === 'cancel' ||
      result.action === 'authorization-confirmation',
    '多筆取消進入取消或授權確認流程',
  );


  const states =
    ids.map(
      (id) =>
        getTestReminders().find(
          (item) =>
            item.id === id,
        ),
    );


  const cancelledCount =
    states.filter(
      (item) =>
        item?.cancelled === true,
    ).length;


  assert(
    cancelledCount === 2,
    '多筆取消剛好取消指定的兩筆 Reminder',
  );


  assert(
    states[2]?.cancelled !== true,
    '第三筆未被選取 Reminder 沒有被誤取消',
  );


  assert(
    getActiveTestReminders().some(
      (item) =>
        item.id === ids[2],
    ),
    '第三筆 Reminder 仍屬於有效 Reminder',
  );
}


/*
 * =========================================================
 * TEST 7
 * 非授權成員取消 → 授權確認 → 同意
 * ========================================================= */

async function testAuthorization(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 7] 非授權成員取消 → 授權確認',
  );


  const reminder =
    createTestReminder(
      uniqueId('authorization'),
      '授權取消測試',
      TEST_MOTHER_ID,
      TEST_MOTHER_ID,
    );


  const nonAuthorizedUser =
    TEST_BROTHER_ID;


  const nonAuthorizedConversation =
    `${TEST_GROUP_ID}:${nonAuthorizedUser}`;


  setPendingReminderState({
    conversationKey:
      nonAuthorizedConversation,

    userId:
      nonAuthorizedUser,

    groupId:
      TEST_GROUP_ID,

    action:
      'cancel',

    candidateReminderIds: [
      reminder.id,
    ],
  });


  const request =
    await handleReminderMessage(
      '1取消',
      nonAuthorizedUser,
      TEST_GROUP_ID,
      mockGemini,
      false,
    );


  assert(
    request.handled === true,
    '非授權成員取消請求被接收',
  );


  assert(
    request.action ===
      'authorization-confirmation',
    '非授權成員進入 authorization-confirmation',
  );


  assert(
    getTestReminders().find(
      (item) =>
        item.id === reminder.id,
    )?.cancelled !== true,
    '尚未取得授權前 Reminder 沒有被取消',
  );


  const authorization =
    await handleReminderMessage(
      '同意',
      TEST_MOTHER_ID,
      TEST_GROUP_ID,
      mockGemini,
      false,
    );


  assert(
    authorization.handled === true,
    '授權人回覆同意被接收',
  );


  assert(
    authorization.action === 'cancel',
    '授權確認後進入 cancel',
  );


  assert(
    getTestReminders().find(
      (item) =>
        item.id === reminder.id,
    )?.cancelled === true,
    '授權確認後 Reminder 才被取消',
  );


  clearPendingReminderState(
    nonAuthorizedConversation,
  );
}


/*
 * =========================================================
 * TEST 8
 * 非授權成員取消 → 授權拒絕
 * ========================================================= */

async function testAuthorizationNo(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 8] 授權取消 → 拒絕',
  );


  const reminder =
    createTestReminder(
      uniqueId('authorization-no'),
      '授權拒絕測試',
      TEST_MOTHER_ID,
      TEST_MOTHER_ID,
    );


  const nonAuthorizedUser =
    TEST_BROTHER_ID;


  const nonAuthorizedConversation =
    `${TEST_GROUP_ID}:${nonAuthorizedUser}`;


  setPendingReminderState({
    conversationKey:
      nonAuthorizedConversation,

    userId:
      nonAuthorizedUser,

    groupId:
      TEST_GROUP_ID,

    action:
      'cancel',

    candidateReminderIds: [
      reminder.id,
    ],
  });


  const request =
    await handleReminderMessage(
      '1取消',
      nonAuthorizedUser,
      TEST_GROUP_ID,
      mockGemini,
      false,
    );


  assert(
    request.action ===
      'authorization-confirmation',
    '非授權成員進入授權確認',
  );


  const rejection =
    await handleReminderMessage(
      '不要',
      TEST_MOTHER_ID,
      TEST_GROUP_ID,
      mockGemini,
      false,
    );


  assert(
    rejection.handled === true,
    '授權拒絕被接收',
  );


  assert(
    rejection.cancelled === false,
    '拒絕授權後沒有取消 Reminder',
  );


  assert(
    getTestReminders().find(
      (item) =>
        item.id === reminder.id,
    )?.cancelled !== true,
    '拒絕授權後 Reminder 仍保留',
  );


  clearPendingReminderState(
    nonAuthorizedConversation,
  );
}


/*
 * =========================================================
 * TEST 9
 * Stale Pending
 *
 * 重點：
 *
 * 不檢查測試群組是否「完全沒有資料」。
 *
 * 因為 Cleanup 採用 cancelled 標記，
 * 歷史測試資料仍會保留在 reminders.json。
 *
 * 正確驗證方式：
 *
 * 建立一筆目前有效的控制 Reminder，
 * 建立一個不存在的 Pending Candidate，
 * 執行操作後確認控制 Reminder 完全沒有被誤傷。
 * =========================================================
 */

async function testStalePending(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 9] Pending State 候選已不存在',
  );


  const controlId =
    uniqueId('stale-control');


  createTestReminder(
    controlId,
    'Stale Pending 控制測試',
  );


  const before =
    loadReminders().find(
      (item) =>
        item.id === controlId,
    );


  assert(
    before !== undefined,
    'Stale Pending 控制 Reminder 建立成功',
  );


  const staleId =
    uniqueId('stale-missing');


  setPendingReminderState({
    conversationKey,

    userId:
      TEST_USER_ID,

    groupId:
      TEST_GROUP_ID,

    action:
      'cancel',

    candidateReminderIds: [
      staleId,
    ],
  });


  const result =
    await handleReminderMessage(
      '1取消',
      TEST_USER_ID,
      TEST_GROUP_ID,
      mockGemini,
      false,
    );


  assert(
    result.handled === true,
    '不存在的候選操作被 Handler 接收並安全處理',
  );


  assert(
    getPendingReminderState(
      conversationKey,
    ) === null,
    '不存在的候選被處理後 Pending State 已清除',
  );


  const after =
    loadReminders().find(
      (item) =>
        item.id === controlId,
    );


  assert(
    after !== undefined,
    '控制 Reminder 仍存在於資料層',
  );


  assert(
    after?.cancelled !== true,
    'Stale Pending 沒有誤取消其他有效 Reminder',
  );


  assert(
    after?.completed !== true,
    'Stale Pending 沒有誤修改其他 Reminder 的完成狀態',
  );


  assert(
    after?.content ===
      before?.content,
    'Stale Pending 沒有誤修改其他 Reminder 內容',
  );


  assert(
    after?.remindAt ===
      before?.remindAt,
    'Stale Pending 沒有誤修改其他 Reminder 時間',
  );
}


/*
 * =========================================================
 * TEST 10
 * Pending State TTL
 * ========================================================= */

async function testPendingExpiry(): Promise<void> {

  cleanup();

  console.log(
    '[TEST 10] Pending State TTL',
  );


  setPendingReminderState({
    conversationKey,

    userId:
      TEST_USER_ID,

    groupId:
      TEST_GROUP_ID,

    action:
      'cancel',

    candidateReminderIds: [
      uniqueId('ttl'),
    ],
  });


  assert(
    getPendingReminderState(
      conversationKey,
    ) !== null,
    'Pending State 建立成功',
  );


  const originalNow =
    Date.now;


  try {

    Date.now = () =>
      originalNow() +
      11 * 60 * 1000;


    assert(
      getPendingReminderState(
        conversationKey,
      ) === null,
      '超過 TTL 後 Pending State 自動失效',
    );

  } finally {

    Date.now =
      originalNow;
  }
}


/*
 * =========================================================
 * Test Suite
 * =========================================================
 */

async function main(): Promise<void> {

  console.log('');

  console.log(
    '=========================================================',
  );

  console.log(
    'Reminder 2.0 Regression Test',
  );

  console.log(
    '=========================================================',
  );

  console.log('');


  const tests: Array<[
    string,
    () => Promise<void>,
  ]> = [

    [
      'TEST 1 建立 Reminder',
      testCreate,
    ],

    [
      'TEST 2 查詢／Pending',
      testListAndPending,
    ],

    [
      'TEST 3 單筆取消',
      testSingleCancelSelection,
    ],

    [
      'TEST 4 取消後查詢',
      testCancelThenQuery,
    ],

    [
      'TEST 5 單筆修改時間',
      testSingleUpdate,
    ],

    [
      'TEST 6 多筆取消',
      testMultiCancel,
    ],

    [
      'TEST 7 授權確認',
      testAuthorization,
    ],

    [
      'TEST 8 授權拒絕',
      testAuthorizationNo,
    ],

    [
      'TEST 9 Stale Pending',
      testStalePending,
    ],

    [
      'TEST 10 Pending TTL',
      testPendingExpiry,
    ],
  ];


  const failures: string[] = [];


  for (
    const [name, test] of tests
  ) {

    try {

      await test();

      console.log(
        `  ✓ ${name} 完成`,
      );

    } catch (error) {

      const message =
        error instanceof Error
          ? error.message
          : String(error);


      failures.push(
        `${name}: ${message}`,
      );


      console.error(
        `  ✗ ${name}`,
      );

      console.error(
        `    ${message}`,
      );

    } finally {

      cleanup();

      console.log('');
    }
  }


  console.log(
    '=========================================================',
  );


  if (failures.length) {

    console.error(
      'Reminder 2.0 Regression Test FAILED',
    );

    console.error('');

    console.error(
      `失敗項目：${failures.length}`,
    );


    for (
      const failure of failures
    ) {

      console.error(
        `- ${failure}`,
      );
    }

  } else {

    console.log(
      'Reminder 2.0 Regression Test PASSED',
    );
  }


  console.log(
    '=========================================================',
  );

  console.log('');


  if (failures.length) {
    process.exitCode = 1;
  }
}


/*
 * =========================================================
 * Entry
 * =========================================================
 */

main().catch(
  (error) => {

    console.error('');

    console.error(
      '=========================================================',
    );

    console.error(
      'Reminder 2.0 Regression Test CRASHED',
    );

    console.error(
      '=========================================================',
    );

    console.error(
      error,
    );

    console.error('');

    cleanup();

    process.exitCode = 1;
  },
);