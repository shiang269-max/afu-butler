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


function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }

  console.log(`  ✓ ${message}`);
}


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


function createTestReminder(
  id: string,
  content: string,
  createdByUserId = TEST_USER_ID,
  targetUserId = TEST_USER_ID,
) {
  return createReminder({
    id,
    groupId: TEST_GROUP_ID,
    createdByUserId,
    content,
    remindAt: '2099-12-31T10:00:00+08:00',
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


function cleanup(): void {
  for (const reminder of getTestReminders()) {
    if (reminder.cancelled !== true) {
      cancelReminder(reminder.id);
    }
  }

  clearPendingReminderState(
    conversationKey,
  );
}


function uniqueId(label: string): string {
  return `test-reminder-2-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}


async function testCreateAndList(): Promise<void> {
  cleanup();

  console.log('[TEST 1] 建立兩筆測試 Reminder');

  const reminder1Id = uniqueId('cancel');
  const reminder2Id = uniqueId('update');

  const created1 = createTestReminder(
    reminder1Id,
    'Reminder 2.0 取消測試',
  );

  const created2 = createTestReminder(
    reminder2Id,
    'Reminder 2.0 修改前內容',
  );

  const persisted = getTestReminders();

  assert(
    persisted.some((item) => item.id === created1.id),
    '第一筆 Reminder 建立成功並完成持久化驗證',
  );

  assert(
    persisted.some((item) => item.id === created2.id),
    '第二筆 Reminder 建立成功並完成持久化驗證',
  );

  console.log('[TEST 2] 查詢 Reminder');

  const result = await handleReminderMessage(
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
    Array.isArray(result.reminders),
    '查詢結果包含 reminders',
  );

  assert(
    (result.reminders?.length ?? 0) >= 2,
    '查詢結果包含兩筆測試 Reminder',
  );

  assert(
    result.reminders?.some((item) => item.id === reminder1Id) === true,
    '查詢結果包含第一筆測試 Reminder',
  );

  assert(
    result.reminders?.some((item) => item.id === reminder2Id) === true,
    '查詢結果包含第二筆測試 Reminder',
  );

  const pending = getPendingReminderState(conversationKey);

  assert(
    pending !== null,
    '查詢後成功建立 Pending State',
  );

  assert(
    pending?.candidateReminderIds.includes(reminder1Id) === true,
    'Pending State 包含第一筆 Reminder',
  );

  assert(
    pending?.candidateReminderIds.includes(reminder2Id) === true,
    'Pending State 包含第二筆 Reminder',
  );
}


async function testSingleCancelSelection(): Promise<void> {
  cleanup();

  console.log('[TEST 3] 單筆編號取消：1取消');

  const reminder1Id = uniqueId('single-cancel');
  const reminder2Id = uniqueId('single-keep');

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

  const list = await handleReminderMessage(
    '1取消',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    false,
  );

  assert(
    list.handled === true,
    '1取消被 Pending State 接收',
  );

  assert(
    list.action === 'cancel',
    '1取消正確進入 cancel',
  );

  const active = getActiveTestReminders();
  const first = getTestReminders().find(
    (item) => item.id === reminder1Id,
  );
  const second = getTestReminders().find(
    (item) => item.id === reminder2Id,
  );

  assert(
    first?.cancelled === true,
    '被選取的 Reminder 已標記 cancelled',
  );

  assert(
    second?.cancelled !== true,
    '未被選取的 Reminder 沒有被誤取消',
  );

  assert(
    !active.some((item) => item.id === reminder1Id),
    '被取消 Reminder 不再屬於有效 Reminder',
  );
}


async function testCancelThenQuery(): Promise<void> {
  cleanup();

  console.log('[TEST 4] 取消後重新查詢');

  const cancelId = uniqueId('query-cancel');
  const keepId = uniqueId('query-keep');

  createTestReminder(cancelId, '取消後不應出現');
  createTestReminder(keepId, '取消後仍應出現');

  await handleReminderMessage(
    '喳子我有哪些提醒',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    true,
  );

  const first = getTestReminders().find(
    (item) => item.id === cancelId,
  );

  assert(
    first !== undefined,
    '成功建立取消測試 Reminder',
  );

  cancelReminder(cancelId);
  clearPendingReminderState(conversationKey);

  const result = await handleReminderMessage(
    '喳子我有哪些提醒',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    true,
  );

  assert(
    result.reminders?.some((item) => item.id === keepId) === true,
    '有效 Reminder 仍可被查詢',
  );

  assert(
    result.reminders?.some((item) => item.id === cancelId) !== true,
    '已取消 Reminder 不再出現在有效查詢結果',
  );
}


async function testSingleUpdate(): Promise<void> {
  cleanup();

  console.log('[TEST 5] 單筆編號修改');

  const updateId = uniqueId('update');
  createTestReminder(updateId, '修改前內容');

  await handleReminderMessage(
    '喳子我有哪些提醒',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    true,
  );

  const result = await handleReminderMessage(
    '1改成Reminder 2.0 修改後內容',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    false,
  );

  assert(
    result.handled === true,
    '編號修改被 Pending State 接收',
  );

  assert(
    result.action === 'update',
    '編號修改正確進入 update',
  );

  assert(
    result.updated === true,
    'Reminder 修改成功',
  );

  const updated = getTestReminders().find(
    (item) => item.id === updateId,
  );

  assert(
    updated?.content === 'Reminder 2.0 修改後內容',
    'Reminder content 已正確更新',
  );

  assert(
    getPendingReminderState(conversationKey) === null,
    '修改完成後 Pending State 已清除',
  );
}


async function testDuplicateConfirmYes(): Promise<void> {
  cleanup();

  console.log('[TEST 6] Duplicate：確認要重複');

  const originalId = uniqueId('duplicate-original');
  const original = createTestReminder(
    originalId,
    'Duplicate 測試提醒',
  );

  setPendingReminderState({
    conversationKey,
    userId: TEST_USER_ID,
    groupId: TEST_GROUP_ID,
    action: 'duplicate',
    candidateReminderIds: [original.id],
  });

  const beforeCount = getActiveTestReminders().length;

  const result = await handleReminderMessage(
    '要',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    false,
  );

  assert(
    result.handled === true,
    'Duplicate 確認被 Pending State 接收',
  );

  assert(
    result.action === 'create',
    'Duplicate 確認後進入 create',
  );

  assert(
    result.created === true,
    'Duplicate 成功建立新的 Reminder',
  );

  const after = getActiveTestReminders();

  assert(
    after.length === beforeCount + 1,
    'Duplicate 確認後有效 Reminder 數量增加一筆',
  );

  assert(
    after.filter((item) => item.content === original.content).length === 2,
    '原 Reminder 與 Duplicate Reminder 同時存在',
  );

  assert(
    getPendingReminderState(conversationKey) === null,
    'Duplicate 確認完成後 Pending State 已清除',
  );
}


async function testDuplicateConfirmNo(): Promise<void> {
  cleanup();

  console.log('[TEST 7] Duplicate：拒絕重複');

  const original = createTestReminder(
    uniqueId('duplicate-no'),
    'Duplicate 拒絕測試',
  );

  setPendingReminderState({
    conversationKey,
    userId: TEST_USER_ID,
    groupId: TEST_GROUP_ID,
    action: 'duplicate',
    candidateReminderIds: [original.id],
  });

  const beforeCount = getActiveTestReminders().length;

  const result = await handleReminderMessage(
    '不要',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    false,
  );

  assert(
    result.handled === true,
    'Duplicate 拒絕被 Pending State 接收',
  );

  assert(
    result.created !== true,
    '拒絕 Duplicate 後沒有建立新 Reminder',
  );

  assert(
    getActiveTestReminders().length === beforeCount,
    '拒絕 Duplicate 後有效 Reminder 數量不變',
  );

  assert(
    getPendingReminderState(conversationKey) === null,
    'Duplicate 拒絕後 Pending State 已清除',
  );
}


async function testMultiCancel(): Promise<void> {
  cleanup();

  console.log('[TEST 8] 多筆編號取消');

  const ids = [
    uniqueId('multi-1'),
    uniqueId('multi-2'),
    uniqueId('multi-3'),
  ];

  ids.forEach((id, index) =>
    createTestReminder(id, `多筆取消測試 ${index + 1}`),
  );

  await handleReminderMessage(
    '喳子我有哪些提醒',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    true,
  );

  const result = await handleReminderMessage(
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

  const states = ids.map((id) =>
    getTestReminders().find((item) => item.id === id),
  );

  const cancelledCount = states.filter(
    (item) => item?.cancelled === true,
  ).length;

  assert(
    cancelledCount <= 2,
    '多筆取消沒有超出明確指定的兩筆',
  );
}


async function testAuthorization(): Promise<void> {
  cleanup();

  console.log('[TEST 9] 非授權成員取消 → 授權確認');

  const reminder = createTestReminder(
    uniqueId('authorization'),
    '授權取消測試',
    TEST_MOTHER_ID,
    TEST_MOTHER_ID,
  );

  const nonAuthorizedUser = TEST_BROTHER_ID;
  const nonAuthorizedConversation =
    `${TEST_GROUP_ID}:${nonAuthorizedUser}`;

  setPendingReminderState({
    conversationKey: nonAuthorizedConversation,
    userId: nonAuthorizedUser,
    groupId: TEST_GROUP_ID,
    action: 'cancel',
    candidateReminderIds: [reminder.id],
  });

  const request = await handleReminderMessage(
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
    request.action === 'authorization-confirmation',
    '非授權成員進入 authorization-confirmation',
  );

  assert(
    getTestReminders().find((item) => item.id === reminder.id)?.cancelled !== true,
    '尚未取得授權前 Reminder 沒有被取消',
  );

  const authorization = await handleReminderMessage(
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
    getTestReminders().find((item) => item.id === reminder.id)?.cancelled === true,
    '授權確認後 Reminder 才被取消',
  );

  clearPendingReminderState(nonAuthorizedConversation);
}


async function testAuthorizationNo(): Promise<void> {
  cleanup();

  console.log('[TEST 10] 授權取消 → 拒絕');

  const reminder = createTestReminder(
    uniqueId('authorization-no'),
    '授權拒絕測試',
    TEST_MOTHER_ID,
    TEST_MOTHER_ID,
  );

  const nonAuthorizedUser = TEST_BROTHER_ID;
  const nonAuthorizedConversation =
    `${TEST_GROUP_ID}:${nonAuthorizedUser}`;

  setPendingReminderState({
    conversationKey: nonAuthorizedConversation,
    userId: nonAuthorizedUser,
    groupId: TEST_GROUP_ID,
    action: 'cancel',
    candidateReminderIds: [reminder.id],
  });

  const request = await handleReminderMessage(
    '1取消',
    nonAuthorizedUser,
    TEST_GROUP_ID,
    mockGemini,
    false,
  );

  assert(
    request.action === 'authorization-confirmation',
    '非授權成員進入授權確認',
  );

  const rejection = await handleReminderMessage(
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
    getTestReminders().find((item) => item.id === reminder.id)?.cancelled !== true,
    '拒絕授權後 Reminder 仍保留',
  );

  clearPendingReminderState(nonAuthorizedConversation);
}


async function testStalePending(): Promise<void> {
  cleanup();

  console.log('[TEST 11] Pending State 候選已不存在');

  const staleId = uniqueId('stale');

  setPendingReminderState({
    conversationKey,
    userId: TEST_USER_ID,
    groupId: TEST_GROUP_ID,
    action: 'cancel',
    candidateReminderIds: [staleId],
  });

  const result = await handleReminderMessage(
    '1取消',
    TEST_USER_ID,
    TEST_GROUP_ID,
    mockGemini,
    false,
  );

  assert(
    result.handled === true,
    '過期候選操作被 Handler 接收並安全處理',
  );

  assert(
    getPendingReminderState(conversationKey) === null,
    '不存在的候選被處理後 Pending State 已清除',
  );
}


async function testPendingExpiry(): Promise<void> {
  cleanup();

  console.log('[TEST 12] Pending State TTL');

  setPendingReminderState({
    conversationKey,
    userId: TEST_USER_ID,
    groupId: TEST_GROUP_ID,
    action: 'cancel',
    candidateReminderIds: [uniqueId('ttl')],
  });

  assert(
    getPendingReminderState(conversationKey) !== null,
    'Pending State 建立成功',
  );

  const originalNow = Date.now;

  try {
    Date.now = () =>
      originalNow() + 11 * 60 * 1000;

    assert(
      getPendingReminderState(conversationKey) === null,
      '超過 TTL 後 Pending State 自動失效',
    );
  } finally {
    Date.now = originalNow;
  }
}


async function main(): Promise<void> {
  console.log('');
  console.log('=========================================================');
  console.log('Reminder 2.0 Complete Regression Test');
  console.log('=========================================================');
  console.log('');

  const tests: Array<[
    string,
    () => Promise<void>,
  ]> = [
    ['TEST 1-2 建立／查詢／Pending', testCreateAndList],
    ['TEST 3 單筆取消', testSingleCancelSelection],
    ['TEST 4 取消後查詢', testCancelThenQuery],
    ['TEST 5 單筆修改', testSingleUpdate],
    ['TEST 6 Duplicate 同意', testDuplicateConfirmYes],
    ['TEST 7 Duplicate 拒絕', testDuplicateConfirmNo],
    ['TEST 8 多筆取消', testMultiCancel],
    ['TEST 9 授權確認', testAuthorization],
    ['TEST 10 授權拒絕', testAuthorizationNo],
    ['TEST 11 stale Pending', testStalePending],
    ['TEST 12 Pending TTL', testPendingExpiry],
  ];

  const failures: string[] = [];

  for (const [name, test] of tests) {
    try {
      await test();
      console.log(`  ✓ ${name} 完成`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      failures.push(`${name}: ${message}`);
      console.error(`  ✗ ${name}`);
      console.error(`    ${message}`);
    } finally {
      cleanup();
      console.log('');
    }
  }

  console.log('=========================================================');

  if (failures.length) {
    console.error('Reminder 2.0 Complete Regression Test FAILED');
    console.error('');
    console.error(`失敗項目：${failures.length}`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
  } else {
    console.log('Reminder 2.0 Complete Regression Test PASSED');
  }

  console.log('=========================================================');
  console.log('');

  if (failures.length) {
    process.exitCode = 1;
  }
}


main().catch((error) => {
  console.error('');
  console.error('=========================================================');
  console.error('Reminder 2.0 Complete Regression Test CRASHED');
  console.error('=========================================================');
  console.error(error);
  console.error('');
  cleanup();
  process.exitCode = 1;
});