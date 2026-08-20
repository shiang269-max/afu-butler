import { messagingApi } from '@line/bot-sdk';

import {
  loadFamilyGroupId,
  saveFamilyGroupId,
} from './family-group-state';

import {
  getDueReminders,
  claimReminder,
  markReminderSent,
  markReminderFailed,
  expireReminderBacklog,
} from './reminder';

import {
  canSendPush,
  getQuotaSnapshot,
} from './line-quota';


/*
 * =========================================================
 * 總管主動訊息排程器
 * =========================================================
 *
 * 固定作息：
 *
 * 06:00 → 早安
 * 22:30 → 晚安
 *
 * 冷場：
 *
 * 連續 6 小時沒有人說話
 * → 主動打破冷清
 *
 * 每日最多：
 *
 * 2 次冷場主動訊息
 *
 * 夜間：
 *
 * 23:00～06:00
 * → 禁止「冷場主動訊息」
 *
 * 注意：
 *
 * 夜間禁用只限制冷場主動。
 * 不影響正常對話、正常回覆、被叫、被問問題。
 */


/*
 * =========================================================
 * 台灣時區
 * =========================================================
 */

const TIME_ZONE = 'Asia/Taipei';


/*
 * =========================================================
 * 固定晚安時間
 * =========================================================
 */

const GOOD_NIGHT_HOUR = 22;
const GOOD_NIGHT_MINUTE = 30;

/* 固定早安／晚安暫停。保留程式碼，之後可重新啟用。 */
const ENABLE_GOOD_NIGHT = false;
const ENABLE_GOOD_MORNING = false;


/*
 * =========================================================
 * 固定早安時間
 * =========================================================
 */

const GOOD_MORNING_HOUR = 6;
const GOOD_MORNING_MINUTE = 0;


/*
 * =========================================================
 * 冷場時間
 * =========================================================
 */

const SILENCE_HOURS = 48;


/*
 * =========================================================
 * 冷場夜間禁用時段
 * =========================================================
 *
 * 23:00～06:00
 *
 * 只限制「冷場主動」。
 */

const SILENCE_QUIET_START_HOUR = 23;
const SILENCE_QUIET_END_HOUR = 6;


/*
 * =========================================================
 * 每日冷場主動次數上限
 * =========================================================
 */

const MAX_SILENCE_REPLIES_PER_DAY = 2;


/*
 * =========================================================
 * 排程檢查頻率
 * =========================================================
 */

const CHECK_INTERVAL_MS =
  30 * 1000;


/*
 * =========================================================
 * 群組狀態
 * =========================================================
 */

interface GroupState {

  lastHumanMessageAt:
    number | null;

  lastGoodNightDate:
    string | null;

  lastGoodMorningDate:
    string | null;

  silenceRepliesDate:
    string | null;

  silenceRepliesCount:
    number;
}


/*
 * =========================================================
 * 已知家庭群組
 * =========================================================
 */

const groupStates =
  new Map<string, GroupState>();


/*
 * =========================================================
 * 程式啟動時讀取已保存的家庭群組
 * =========================================================
 */

function loadSavedFamilyGroup(): void {

  const groupId =
    loadFamilyGroupId();


  if (!groupId) {

    console.log(
      '[Proactive Scheduler] 尚未保存家庭群組 ID',
    );

    return;
  }


  /*
   * 重新啟動後：
   *
   * 我們知道群組是哪一個，
   * 但不知道上次群組最後說話的時間。
   *
   * 因此 lastHumanMessageAt 先保持 null。
   *
   * 等重新收到第一則群組訊息後，
   * 才重新開始計算 6 小時冷場。
   */

  groupStates.set(
    groupId,
    {
      lastHumanMessageAt: null,

      lastGoodNightDate: null,

      lastGoodMorningDate: null,

      silenceRepliesDate: null,

      silenceRepliesCount: 0,
    },
  );


  console.log(
    '[Proactive Scheduler] 已恢復家庭群組',
    groupId,
  );
}


/*
 * =========================================================
 * 取得群組狀態
 * =========================================================
 */

function getGroupState(
  groupId: string,
): GroupState {

  let state =
    groupStates.get(groupId);


  if (!state) {

    state = {

      lastHumanMessageAt:
        null,

      lastGoodNightDate:
        null,

      lastGoodMorningDate:
        null,

      silenceRepliesDate:
        null,

      silenceRepliesCount:
        0,
    };


    groupStates.set(
      groupId,
      state,
    );
  }


  return state;
}


/*
 * =========================================================
 * 台灣現在時間
 * =========================================================
 */

function getTaipeiNow(): {
  date: string;
  hour: number;
  minute: number;
} {

  const now =
    new Date();


  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          TIME_ZONE,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        hour12:
          false,
      },
    );


  const parts =
    formatter.formatToParts(
      now,
    );


  const values:
    Record<string, string> = {};


  for (
    const part of parts
  ) {

    if (
      part.type !== 'literal'
    ) {

      values[part.type] =
        part.value;
    }
  }


  return {

    date:
      `${values.year}-${values.month}-${values.day}`,

    hour:
      Number(values.hour),

    minute:
      Number(values.minute),
  };
}


/*
 * =========================================================
 * 判斷冷場夜間禁用
 * =========================================================
 */

function isSilenceQuietHours(
  hour: number,
): boolean {

  return (
    hour >=
      SILENCE_QUIET_START_HOUR
    ||
    hour <
      SILENCE_QUIET_END_HOUR
  );
}


/*
 * =========================================================
 * 記錄家庭群組有人說話
 * =========================================================
 *
 * index.ts 收到群組文字訊息後呼叫。
 *
 * 同時保存 groupId。
 */

export function recordFamilyGroupMessage(
  groupId: string,
): void {

  if (!groupId) {
    return;
  }


  /*
   * 永久保存群組 ID。
   */

  saveFamilyGroupId(
    groupId,
  );


  const state =
    getGroupState(
      groupId,
    );


  /*
   * 更新最後一次家人說話時間。
   */

  state.lastHumanMessageAt =
    Date.now();
}


/*
 * =========================================================
 * 發送主動訊息
 * =========================================================
 */

async function sendProactiveMessage(
  lineClient:
    messagingApi.MessagingApiClient,

  groupId: string,

  text: string,
): Promise<void> {

  /*
   * 冷場／其他非必要主動訊息：
   *
   * 剩餘 < 50 時直接停止。
   * Reminder 不經過這裡，因此不受這個限制。
   */
  const quota =
    await getQuotaSnapshot(
      lineClient,
    );

  if (
    !canSendPush(
      quota,
      'non-essential',
    )
  ) {

    console.log(
      '[Quota Guard] 阻止非必要主動 Push。',
      JSON.stringify(quota),
    );

    return;
  }

  await lineClient.pushMessage(
    {
      to:
        groupId,

      messages: [
        {
          type:
            'text',

          text:
            text.slice(
              0,
              5000,
            ),
        },
      ],
    },
  );
}


/*
 * =========================================================
 * 固定晚安
 * =========================================================
 */

function getGoodNightMessage(): string {

  return (
    '諸位，夜深了，奴才先向各位道一聲晚安。' +
    '若還有什麼吩咐，隨時喚奴才一聲便是。'
  );
}


/*
 * =========================================================
 * 固定早安
 * =========================================================
 */

function getGoodMorningMessage(): string {

  return (
    '諸位，早安。新的一日已開始，' +
    '奴才也在門口候著，諸位若有吩咐，隨時喚奴才便是。'
  );
}


/*
 * =========================================================
 * 指定時間判斷
 * =========================================================
 */

function isExactMinute(
  hour: number,
  minute: number,

  targetHour: number,
  targetMinute: number,
): boolean {

  return (
    hour === targetHour &&
    minute === targetMinute
  );
}


/*
 * =========================================================
 * 每日冷場次數重置
 * =========================================================
 */

function resetDailySilenceCountIfNeeded(
  state: GroupState,

  date: string,
): void {

  if (
    state.silenceRepliesDate !==
    date
  ) {

    state.silenceRepliesDate =
      date;

    state.silenceRepliesCount =
      0;
  }
}


/*
 * =========================================================
 * 22:30 晚安
 * =========================================================
 */

async function handleGoodNight(
  lineClient:
    messagingApi.MessagingApiClient,

  groupId: string,

  state: GroupState,

  date: string,

  hour: number,

  minute: number,
): Promise<void> {

  if (!ENABLE_GOOD_NIGHT) {
    return;
  }

  if (
    !isExactMinute(
      hour,
      minute,

      GOOD_NIGHT_HOUR,
      GOOD_NIGHT_MINUTE,
    )
  ) {

    return;
  }


  if (
    state.lastGoodNightDate ===
    date
  ) {

    return;
  }


  await sendProactiveMessage(
    lineClient,

    groupId,

    getGoodNightMessage(),
  );


  state.lastGoodNightDate =
    date;
}


/*
 * =========================================================
 * 06:00 早安
 * =========================================================
 */

async function handleGoodMorning(
  lineClient:
    messagingApi.MessagingApiClient,

  groupId: string,

  state: GroupState,

  date: string,

  hour: number,

  minute: number,
): Promise<void> {

  if (!ENABLE_GOOD_MORNING) {
    return;
  }

  if (
    !isExactMinute(
      hour,
      minute,

      GOOD_MORNING_HOUR,
      GOOD_MORNING_MINUTE,
    )
  ) {

    return;
  }


  if (
    state.lastGoodMorningDate ===
    date
  ) {

    return;
  }


  await sendProactiveMessage(
    lineClient,

    groupId,

    getGoodMorningMessage(),
  );


  state.lastGoodMorningDate =
    date;


  /*
   * 早安本身就是一次主動開場。
   *
   * 因此重新開始計算冷場。
   */

  state.lastHumanMessageAt =
    Date.now();
}


/*
 * =========================================================
 * 冷場主動
 * =========================================================
 */

async function handleSilence(
  lineClient:
    messagingApi.MessagingApiClient,

  groupId: string,

  state: GroupState,

  generateProactiveReply:
    (
      type:
        'good-night' |
        'silence',
    ) => Promise<string>,

  date: string,

  hour: number,
): Promise<void> {

  /*
   * 23:00～06:00
   *
   * 只禁止冷場主動。
   */

  if (
    isSilenceQuietHours(
      hour,
    )
  ) {

    return;
  }


  /*
   * 沒有最近群組訊息，
   * 就沒有冷場基準。
   */

  if (
    state.lastHumanMessageAt ===
    null
  ) {

    return;
  }


  resetDailySilenceCountIfNeeded(
    state,

    date,
  );


  if (
    state.silenceRepliesCount >=
    MAX_SILENCE_REPLIES_PER_DAY
  ) {

    return;
  }


  const silenceDurationMs =
    Date.now() -
    state.lastHumanMessageAt;


  const silenceThresholdMs =
    SILENCE_HOURS *
    60 *
    60 *
    1000;


  if (
    silenceDurationMs <
    silenceThresholdMs
  ) {

    return;
  }


  /*
   * 額度不足時，連 Gemini 都不要叫。
   *
   * 冷場屬於非必要主動訊息：
   * 剩餘 < 50 即停止。
   */
  const quota =
    await getQuotaSnapshot(
      lineClient,
    );

  if (
    !canSendPush(
      quota,
      'non-essential',
    )
  ) {

    console.log(
      '[Quota Guard] 冷場主動訊息暫停:',
      JSON.stringify(quota),
    );

    return;
  }


  const reply =
    await generateProactiveReply(
      'silence',
    );


  if (
    !reply ||
    !reply.trim()
  ) {

    return;
  }


  await sendProactiveMessage(
    lineClient,

    groupId,

    reply.trim(),
  );


  state.silenceRepliesCount +=
    1;


  /*
   * 總管剛剛已經主動說話。
   *
   * 因此重新開始計算 6 小時。
   */

  state.lastHumanMessageAt =
    Date.now();
}


/*
 * =========================================================
 * Reminder
 * =========================================================
 */

async function checkReminders(
  lineClient:
    messagingApi.MessagingApiClient,
): Promise<void> {

  const dueReminders =
    getDueReminders();

  for (
    const reminder
    of dueReminders
  ) {

    /*
     * 先取得唯一發送資格。
     *
     * 如果另一輪 Scheduler 已經處理，
     * 這裡直接跳過。
     */
    if (
      !claimReminder(
        reminder.id,
      )
    ) {
      continue;
    }

    try {

      /*
       * Reminder 是必要主動訊息：
       *
       * 只要尚有可用額度，就允許發送。
       *
       * = 0 時完全阻斷。
       */
      const quota =
        await getQuotaSnapshot(
          lineClient,
        );

      if (
        !canSendPush(
          quota,
          'reminder',
        )
      ) {

        console.log(
          '[Quota Guard] Reminder 因剩餘額度為 0 而終結:',
          reminder.id,
          JSON.stringify(quota),
        );

        markReminderFailed(
          reminder.id,
        );

        continue;
      }

      if (
        reminder.target.type === 'all'
      ) {

        await lineClient.pushMessage(
          {
            to:
              reminder.groupId,

            messages: [
              {
                type:
                  'textV2',

                text:
                  `{target} ${reminder.content}`,

                substitution: {
                  target: {
                    type:
                      'mention',

                    mentionee: {
                      type:
                        'all',
                    },
                  },
                },
              },
            ],
          },
        );

      } else {

        await lineClient.pushMessage(
          {
            to:
              reminder.groupId,

            messages: [
              {
                type:
                  'textV2',

                text:
                  `{target} ${reminder.content}`,

                substitution: {
                  target: {
                    type:
                      'mention',

                    mentionee: {
                      type:
                        'user',

                    userId:
                      reminder.target.userId,
                    },
                  },
                },
              },
            ],
          },
        );
      }

      /*
       * Push 成功才標記 sent。
       */
      markReminderSent(
        reminder.id,
      );

      console.log(
        '[Reminder] 已發送 Reminder:',
        reminder.id,
      );

    } catch (error) {

      /*
       * 最重要的防線：
       *
       * 429 / 網路錯誤 / 任何 Push 失敗
       * → failed
       * → 終結
       * → 絕不進入下一輪重試
       */
      markReminderFailed(
        reminder.id,
      );

      console.error(
        '[Reminder] 發送 Reminder 失敗，已終結:',
        reminder.id,
        error,
      );
    }
  }
}


/*
 * =========================================================
 * 檢查單一群組
 * =========================================================
 */

async function checkGroup(
  lineClient:
    messagingApi.MessagingApiClient,

  groupId: string,

  generateProactiveReply:
    (
      type:
        'good-night' |
        'silence',
    ) => Promise<string>,
): Promise<void> {

  const now =
    getTaipeiNow();


  const state =
    getGroupState(
      groupId,
    );


  resetDailySilenceCountIfNeeded(
    state,

    now.date,
  );


  /*
   * 22:30 晚安
   */

  await handleGoodNight(
    lineClient,

    groupId,

    state,

    now.date,

    now.hour,

    now.minute,
  );


  /*
   * 06:00 早安
   */

  await handleGoodMorning(
    lineClient,

    groupId,

    state,

    now.date,

    now.hour,

    now.minute,
  );


  /*
   * 冷場主動
   */

  await handleSilence(
    lineClient,

    groupId,

    state,

    generateProactiveReply,

    now.date,

    now.hour,
  );
}


/*
 * =========================================================
 * 啟動排程器
 * =========================================================
 */

export function startProactiveScheduler(
  lineClient:
    messagingApi.MessagingApiClient,

  generateProactiveReply:
    (
      type:
        'good-night' |
        'silence',
    ) => Promise<string>,
): void {

  /*
   * 先恢復以前保存的家庭群組。
   */

  /*
   * 啟動時第一件事：
   *
   * 終結所有歷史 backlog。
   *
   * 因此額度恢復時不會把停機期間累積的 Reminder
   * 一口氣補送出去。
   */
  const expiredBacklogCount =
    expireReminderBacklog();

  if (
    expiredBacklogCount > 0
  ) {
    console.log(
      '[Reminder] 啟動時已阻止 Backlog 補送:',
      expiredBacklogCount,
    );
  }


  loadSavedFamilyGroup();


  console.log(
    '總管主動訊息排程器已啟動',
  );


  console.log(
    '固定早安：暫停',
  );


  console.log(
    '固定晚安：暫停',
  );


  console.log(
    `冷場門檻：${SILENCE_HOURS} 小時`,
  );


  console.log(
    `冷場每日上限：${MAX_SILENCE_REPLIES_PER_DAY} 次`,
  );


  console.log(
    '冷場夜間禁用：23:00～06:00',
  );


  /*
   * 啟動時檢查一次。
   */

  const checkAllGroups =
    async (): Promise<void> => {

      try {

        await checkReminders(
          lineClient,
        );

      } catch (error) {

        console.error(
          '[Reminder] Reminder 檢查失敗:',
          error,
        );
      }


      for (
        const groupId
        of groupStates.keys()
      ) {

        try {

          await checkGroup(
            lineClient,

            groupId,

            generateProactiveReply,
          );

        } catch (error) {

          console.error(
            '總管主動訊息失敗:',
            groupId,

            error,
          );
        }
      }
    };


  void checkAllGroups();


  /*
   * 每 30 秒檢查一次。
   */

  setInterval(
    () => {

      void checkAllGroups();

    },

    CHECK_INTERVAL_MS,
  );
}