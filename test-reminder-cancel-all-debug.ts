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
 * Reminder Cancel-All Minimal Diagnostic
 * =========================================================
 *
 * 本測試只回答一個問題：
 *
 * 「喳子全部取消」
 * 到底是不是在 Reminder Handler 內部就出問題。
 *
 * 不經過：
 *
 * - LINE
 * - replyToken
 * - index.ts
 * - AICore
 * - 真 Gemini API
 *
 * 如果本測試正常完成，
 * 下一步就直接查 index.ts / AICore / LINE 回覆流程。
 * =========================================================
 */


const TEST_GROUP_ID =
  '__REMINDER_CANCEL_ALL_MINIMAL_GROUP__';

const TEST_USER_ID =
  '__REMINDER_CANCEL_ALL_MINIMAL_USER__';

const CONVERSATION_KEY =
  `${TEST_GROUP_ID}:${TEST_USER_ID}`;


/*
 * =========================================================
 * Mock Gemini
 * =========================================================
 *
 * 這裡只提供最低限度合法結果。
 *
 * 真正的「全部取消」應由 Reminder Hint / Handler
 * 根據實際輸入文字判斷。
 * =========================================================
 */

const mockGemini = {

  models: {

    generateContent:
      async () => {

        return {

          text:
            JSON.stringify({

              action:
                'cancel',

              target:
                'self',

              targets:
                ['self'],

              queryScope:
                'self',

              queryPeriod:
                'all',

              cancelAll:
                true,

              updateTarget:
                null,

            }),

        };

      },

  },

} as unknown as GoogleGenAI;


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
 * 建立測試 Reminder
 * =========================================================
 */

function createTestReminder(
  suffix: string,
) {

  const id =
    `test-cancel-all-minimal-${suffix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  return createReminder({

    id,

    groupId:
      TEST_GROUP_ID,

    createdByUserId:
      TEST_USER_ID,

    content:
      `Cancel All 最小測試 ${suffix}`,

    remindAt:
      '2099-12-31T10:00:00+08:00',

    target: {

      type:
        'user',

      userId:
        TEST_USER_ID,

    },

    targets: [

      {

        type:
          'user',

        userId:
          TEST_USER_ID,

      },

    ],

    completed:
      false,

    cancelled:
      false,

  });

}


/*
 * =========================================================
 * 取得本測試 Reminder
 * =========================================================
 */

function getTestReminders() {

  return loadReminders()
    .filter(

      (reminder) =>

        reminder.groupId ===
          TEST_GROUP_ID &&

        reminder.createdByUserId ===
          TEST_USER_ID,

    );

}


/*
 * =========================================================
 * 清理
 * =========================================================
 */

function cleanup(): void {

  const reminders =
    getTestReminders();

  for (
    const reminder of reminders
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
    CONVERSATION_KEY,
  );

}


/*
 * =========================================================
 * Timeout
 * =========================================================
 *
 * 這個 timeout 很重要。
 *
 * 如果 Handler Promise 沒有完成，
 * 測試會明確指出：
 *
 * TIMEOUT
 *
 * 而不是讓我們誤以為程式「沒反應」。
 * =========================================================
 */

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 10_000,
): Promise<T> {

  let timer:
    ReturnType<typeof setTimeout>;

  const timeout =
    new Promise<never>(
      (_, reject) => {

        timer =
          setTimeout(

            () => {

              reject(
                new Error(
                  `TIMEOUT: Handler 超過 ${timeoutMs}ms 沒有完成`,
                ),
              );

            },

            timeoutMs,

          );

      },
    );

  try {

    return await Promise.race([
      promise,
      timeout,
    ]);

  } finally {

    clearTimeout(timer!);

  }

}


/*
 * =========================================================
 * 印出 Result
 * =========================================================
 */

function printResult(
  result: any,
): void {

  console.log('');
  console.log(
    '----- Handler Result -----',
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2,
    ),
  );

  console.log(
    '--------------------------',
  );

}


/*
 * =========================================================
 * 印出 Pending State
 * =========================================================
 */

function printPendingState(
  label: string,
): void {

  const state =
    getPendingReminderState(
      CONVERSATION_KEY,
    );

  console.log('');
  console.log(
    `----- ${label} Pending State -----`,
  );

  if (!state) {

    console.log(
      'null',
    );

  } else {

    console.log(
      JSON.stringify(
        state,
        null,
        2,
      ),
    );

  }

  console.log(
    '--------------------------------',
  );

}


/*
 * =========================================================
 * 印出 Reminder State
 * =========================================================
 */

function printReminderState(
  label: string,
): void {

  const reminders =
    getTestReminders();

  console.log('');
  console.log(
    `----- ${label} Reminder State -----`,
  );

  for (
    const reminder of reminders
  ) {

    console.log(
      JSON.stringify(
        {
          id:
            reminder.id,

          content:
            reminder.content,

          cancelled:
            reminder.cancelled,

          completed:
            reminder.completed,

          remindAt:
            reminder.remindAt,

        },
        null,
        2,
      ),
    );

  }

  console.log(
    '-----------------------------------',
  );

}


/*
 * =========================================================
 * Main
 * =========================================================
 */

async function main(): Promise<void> {

  cleanup();

  console.log('');

  console.log(
    '=========================================================',
  );

  console.log(
    'Reminder Cancel-All Minimal Diagnostic',
  );

  console.log(
    '=========================================================',
  );

  console.log('');

  console.log(
    '[TARGET] 喳子全部取消',
  );

  console.log(
    '[INVOCATION] true',
  );

  console.log(
    '[LAYER] Reminder Handler only',
  );

  console.log(
    '[TIMEOUT] 10000ms',
  );

  console.log('');

  try {

    /*
     * -------------------------------------------------------
     * 建立四道 Reminder
     * -------------------------------------------------------
     */

    console.log(
      '[STEP 1] 建立四道測試 Reminder',
    );

    const reminders = [

      createTestReminder('1'),

      createTestReminder('2'),

      createTestReminder('3'),

      createTestReminder('4'),

    ];

    assert(
      reminders.length === 4,
      '成功建立四道測試 Reminder',
    );

    printReminderState(
      '建立後',
    );


    /*
     * -------------------------------------------------------
     * Handler 前
     * -------------------------------------------------------
     */

    console.log('');
    console.log(
      '[STEP 2] Handler 執行前狀態',
    );

    printPendingState(
      'Before',
    );


    /*
     * -------------------------------------------------------
     * 真正核心測試
     * -------------------------------------------------------
     */

    console.log('');
    console.log(
      '[STEP 3] 執行：喳子全部取消',
    );

    console.log(
      '[CALL] handleReminderMessage(...)',
    );

    const startedAt =
      Date.now();

    const result =
      await withTimeout(

        handleReminderMessage(

          '喳子全部取消',

          TEST_USER_ID,

          TEST_GROUP_ID,

          mockGemini,

          true,

        ),

      );

    const elapsed =
      Date.now() -
      startedAt;

    console.log('');
    console.log(
      `[ELAPSED] ${elapsed}ms`,
    );


    /*
     * -------------------------------------------------------
     * Result
     * -------------------------------------------------------
     */

    printResult(
      result,
    );


    /*
     * -------------------------------------------------------
     * Handler 基本完整性
     * -------------------------------------------------------
     */

    assert(
      result !== undefined &&
        result !== null,
      'Handler 有回傳結果',
    );

    assert(
      result.handled === true,
      'Handler 將「喳子全部取消」判定為 handled',
    );

    assert(
      typeof result.action === 'string',
      'Handler 回傳明確 action',
    );


    /*
     * -------------------------------------------------------
     * 特別觀察 cancelAll
     * -------------------------------------------------------
     */

    console.log('');
    console.log(
      '[STEP 4] 分析 cancelAll 執行結果',
    );

    console.log(
      `[ACTION] ${result.action}`,
    );

    console.log(
      `[MESSAGE] ${
        result.message ||
        '(none)'
      }`,
    );

    console.log(
      `[CANDIDATES] ${
        Array.isArray(result.candidates)
          ? result.candidates.length
          : '(not array)'
      }`,
    );

    console.log(
      `[MENTION USERS] ${
        Array.isArray(result.mentionUserIds)
          ? result.mentionUserIds.length
          : '(not array)'
      }`,
    );


    /*
     * -------------------------------------------------------
     * Pending State
     * -------------------------------------------------------
     */

    printPendingState(
      'Handler 完成後',
    );


    /*
     * -------------------------------------------------------
     * Reminder State
     * -------------------------------------------------------
     *
     * 特別重要：
     *
     * 如果這裡四道全部已經直接 cancelled，
     * 表示 Handler 實際執行了全部取消。
     *
     * 如果仍然存在，
     * 但 result 是 authorization-confirmation，
     * 則代表目前設計是先等待授權。
     * -------------------------------------------------------
     */

    printReminderState(
      'Handler 完成後',
    );


    /*
     * -------------------------------------------------------
     * 不預設「全部取消」一定要直接取消。
     *
     * 我們只確認：
     *
     * 1. Handler 沒卡住
     * 2. 有正常結果
     * 3. 有明確 action
     *
     * 至於 action 是否為：
     *
     * authorization-confirmation
     * cancel
     *
     * 由實際程式結果決定。
     * -------------------------------------------------------
     */

    console.log('');
    console.log(
      '[STEP 5] 核心診斷結果',
    );

    console.log(
      `Handler elapsed = ${elapsed}ms`,
    );

    console.log(
      `Handler action  = ${result.action}`,
    );

    console.log(
      `Handler handled = ${result.handled}`,
    );

    console.log('');
    console.log(
      '如果這裡正常完成，表示：',
    );

    console.log(
      '「喳子全部取消」沒有在 Reminder Handler 內形成 Promise 卡死。',
    );

    console.log(
      '下一層應查 AICore / index.ts / LINE reply lifecycle。',
    );


    /*
     * -------------------------------------------------------
     * 清理
     * -------------------------------------------------------
     */

    cleanup();

    console.log('');
    console.log(
      '=========================================================',
    );

    console.log(
      'Reminder Cancel-All Minimal Diagnostic PASSED',
    );

    console.log(
      '=========================================================',
    );

  } catch (error) {

    console.error('');
    console.error(
      '=========================================================',
    );

    console.error(
      'Reminder Cancel-All Minimal Diagnostic FAILED',
    );

    console.error(
      '=========================================================',
    );

    console.error(
      error,
    );

    cleanup();

    process.exitCode = 1;

  }

}


main();