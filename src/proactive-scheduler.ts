import { messagingApi } from '@line/bot-sdk';


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
 *
 * 連續 6 小時沒有人說話，
 * 才可以觸發冷場主動訊息。
 */

const SILENCE_HOURS = 6;


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
 *
 * 22:30 晚安不計入。
 * 06:00 早安不計入。
 */

const MAX_SILENCE_REPLIES_PER_DAY = 2;


/*
 * =========================================================
 * 排程檢查頻率
 * =========================================================
 *
 * 每 30 秒檢查一次。
 *
 * 注意：
 *
 * 30 秒只是檢查頻率，
 * 並不是 30 秒沒人說話就觸發。
 */

const CHECK_INTERVAL_MS = 30 * 1000;


/*
 * =========================================================
 * 群組狀態
 * =========================================================
 */

interface GroupState {
  /*
   * 最後一次家人在群組說話的時間
   */
  lastHumanMessageAt: number | null;

  /*
   * 今天是否已經發過晚安
   */
  lastGoodNightDate: string | null;

  /*
   * 今天是否已經發過早安
   */
  lastGoodMorningDate: string | null;

  /*
   * 冷場次數屬於哪一天
   */
  silenceRepliesDate: string | null;

  /*
   * 今天已經主動打破冷場幾次
   */
  silenceRepliesCount: number;
}


/*
 * =========================================================
 * 所有群組狀態
 * =========================================================
 */

const groupStates =
  new Map<string, GroupState>();


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
      lastHumanMessageAt: null,

      lastGoodNightDate: null,

      lastGoodMorningDate: null,

      silenceRepliesDate: null,

      silenceRepliesCount: 0,
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
 * 取得台灣現在時間
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
        timeZone: TIME_ZONE,

        year: 'numeric',
        month: '2-digit',
        day: '2-digit',

        hour: '2-digit',
        minute: '2-digit',

        hour12: false,
      },
    );


  const parts =
    formatter.formatToParts(now);


  const values:
    Record<string, string> = {};


  for (const part of parts) {

    if (part.type !== 'literal') {

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
 * 判斷是否處於冷場夜間禁用時間
 * =========================================================
 *
 * 23:00～05:59
 * → true
 *
 * 06:00 起
 * → false
 */

function isSilenceQuietHours(
  hour: number,
): boolean {

  return (
    hour >= SILENCE_QUIET_START_HOUR ||
    hour < SILENCE_QUIET_END_HOUR
  );
}


/*
 * =========================================================
 * 記錄群組有人說話
 * =========================================================
 *
 * index.ts 收到群組訊息時呼叫。
 *
 * 私訊不要呼叫。
 */

export function recordFamilyGroupMessage(
  groupId: string,
): void {

  const state =
    getGroupState(groupId);


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

  await lineClient.pushMessage(
    {
      to: groupId,

      messages: [
        {
          type: 'text',

          text:
            text.slice(0, 5000),
        },
      ],
    },
  );
}


/*
 * =========================================================
 * 固定晚安內容
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
 * 固定早安內容
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
 * 判斷是否正好到達指定時間
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
    state.silenceRepliesDate !== date
  ) {

    state.silenceRepliesDate =
      date;

    state.silenceRepliesCount =
      0;
  }
}


/*
 * =========================================================
 * 22:30 固定晚安
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


  /*
   * 同一天只發一次。
   */

  if (
    state.lastGoodNightDate === date
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
 * 06:00 固定早安
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


  /*
   * 同一天只發一次。
   */

  if (
    state.lastGoodMorningDate === date
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
   * 06:00 早安本身就是一次主動開場。
   *
   * 所以把冷場基準重設為現在。
   *
   * 避免：
   *
   * 06:00 早安
   * ↓
   * 下一輪檢查
   * ↓
   * 又判定已經 6 小時沒人說話
   */

  state.lastHumanMessageAt =
    Date.now();
}


/*
 * =========================================================
 * 冷場主動訊息
 * =========================================================
 */

async function handleSilence(
  lineClient:
    messagingApi.MessagingApiClient,

  groupId: string,

  state: GroupState,

  generateProactiveReply:
    (
      type: 'good-night' | 'silence',
    ) => Promise<string>,

  date: string,

  hour: number,
): Promise<void> {

  /*
   * =======================================================
   * 夜間禁用
   * =======================================================
   *
   * 這裡只限制冷場主動。
   *
   * 正常對話完全不經過這個判斷。
   */

  if (
    isSilenceQuietHours(hour)
  ) {

    return;
  }


  /*
   * 沒有任何群組活動紀錄，
   * 就沒有冷場基準。
   */

  if (
    state.lastHumanMessageAt === null
  ) {

    return;
  }


  /*
   * 每日最多 2 次。
   */

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


  /*
   * 計算距離最後一次家人說話
   * 已經經過多久。
   */

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
   * 交給 index.ts 的 Gemini 主動回覆產生器。
   *
   * 這裡只會傳：
   *
   * 'silence'
   */

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


  /*
   * 增加今日冷場主動次數。
   */

  state.silenceRepliesCount += 1;


  /*
   * 總管剛剛已經主動說話。
   *
   * 因此重新計算 6 小時。
   */

  state.lastHumanMessageAt =
    Date.now();
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
      type: 'good-night' | 'silence',
    ) => Promise<string>,
): Promise<void> {

  const now =
    getTaipeiNow();


  const state =
    getGroupState(groupId);


  /*
   * 每天重新計算冷場次數。
   */

  resetDailySilenceCountIfNeeded(
    state,

    now.date,
  );


  /*
   * =======================================================
   * ① 22:30 晚安
   * =======================================================
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
   * =======================================================
   * ② 06:00 早安
   * =======================================================
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
   * =======================================================
   * ③ 冷場主動
   * =======================================================
   *
   * 只有這裡受到 23:00～06:00 限制。
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
 * 啟動總管主動排程器
 * =========================================================
 */

export function startProactiveScheduler(
  lineClient:
    messagingApi.MessagingApiClient,

  generateProactiveReply:
    (
      type: 'good-night' | 'silence',
    ) => Promise<string>,
): void {

  console.log(
    '總管主動訊息排程器已啟動',
  );


  console.log(
    '固定早安：06:00',
  );


  console.log(
    '固定晚安：22:30',
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
   * 檢查所有已知家庭群組。
   */

  const checkAllGroups =
    async (): Promise<void> => {

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


  /*
   * 啟動時先檢查一次。
   */

  void checkAllGroups();


  /*
   * 每 30 秒檢查一次。
   *
   * 30 秒只是檢查頻率，
   * 不是冷場時間。
   */

  setInterval(
    () => {

      void checkAllGroups();

    },

    CHECK_INTERVAL_MS,
  );
}