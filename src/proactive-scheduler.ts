import { messagingApi } from '@line/bot-sdk';


/*
 * =========================================================
 * 主動訊息設定
 * =========================================================
 *
 * 台灣時間
 */
const TIME_ZONE = 'Asia/Taipei';


/*
 * 每天固定晚安時間
 */
const GOOD_NIGHT_HOUR = 22;
const GOOD_NIGHT_MINUTE = 30;


/*
 * 冷場超過幾小時後，
 * 總管可以主動打破冷清。
 */
const SILENCE_HOURS = 3;


/*
 * 每天最多因為「冷場」主動說幾次。
 *
 * 注意：
 * 固定時間的晚安不計入這個次數。
 */
const MAX_SILENCE_REPLIES_PER_DAY = 2;


/*
 * =========================================================
 * 家庭群組狀態
 * =========================================================
 */

let familyGroupId: string | null = null;


/*
 * 最後一次收到家庭群組訊息的時間。
 */
let lastGroupMessageTime = 0;


/*
 * 今天已經因冷場主動說話幾次。
 */
let silenceRepliesToday = 0;


/*
 * 用來判斷冷場次數是哪一天。
 */
let silenceCounterDate = '';


/*
 * 今天的固定晚安是否已經執行。
 *
 * 避免程式因為檢查頻率而在 22:30 附近重複發送。
 */
let goodNightSentDate = '';


/*
 * =========================================================
 * 晚安訊息
 * =========================================================
 */

const GOOD_NIGHT_MESSAGE =
  '諸位，夜深了，奴才先向各位道一聲晚安。若還有什麼吩咐，隨時喚奴才一聲便是。';


/*
 * =========================================================
 * 啟動主動排程器
 * =========================================================
 */

export function startProactiveScheduler(
  lineClient: messagingApi.MessagingApiClient,
  generateReply: (
    type: 'good-night' | 'silence',
  ) => Promise<string>,
): void {

  /*
   * 每 30 秒檢查一次。
   *
   * 這不是每 30 秒發訊息。
   * 只是讓排程器確認：
   *
   * 1. 現在是否到了 22:30
   * 2. 是否已經冷場超過 3 小時
   */
  setInterval(
    async () => {

      try {

        await checkProactiveMessages(
          lineClient,
          generateReply,
        );

      } catch (error) {

        console.error(
          '[Proactive Scheduler] Error:',
          error,
        );
      }

    },
    30 * 1000,
  );


  console.log(
    '[Proactive Scheduler] 已啟動',
  );

  console.log(
    `[Proactive Scheduler] 固定晚安：每天 ${String(GOOD_NIGHT_HOUR).padStart(2, '0')}:${String(GOOD_NIGHT_MINUTE).padStart(2, '0')}`,
  );

  console.log(
    `[Proactive Scheduler] 冷場時間：${SILENCE_HOURS} 小時`,
  );

  console.log(
    `[Proactive Scheduler] 每日冷場上限：${MAX_SILENCE_REPLIES_PER_DAY} 次`,
  );
}


/*
 * =========================================================
 * 記錄家庭群組訊息
 * =========================================================
 *
 * index.ts 每收到一次家庭群組訊息，
 * 就呼叫這個函式。
 */
export function recordFamilyGroupMessage(
  groupId: string,
): void {

  familyGroupId = groupId;

  lastGroupMessageTime =
    Date.now();

  resetDailyCounterIfNeeded();


  console.log(
    '[Proactive Scheduler] 家庭群組收到訊息',
  );
}


/*
 * =========================================================
 * 取得目前台灣時間
 * =========================================================
 */

function getTaipeiDateTime(): {
  date: string;
  hour: number;
  minute: number;
} {

  const now =
    new Date();


  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      },
    ).formatToParts(now);


  const getPart =
    (type: string): string =>
      parts.find(
        (part) =>
          part.type === type,
      )?.value || '';


  return {
    date:
      `${getPart('year')}-${getPart('month')}-${getPart('day')}`,

    hour:
      Number(
        getPart('hour'),
      ),

    minute:
      Number(
        getPart('minute'),
      ),
  };
}


/*
 * =========================================================
 * 每日計數器重置
 * =========================================================
 */

function resetDailyCounterIfNeeded(): void {

  const now =
    getTaipeiDateTime();


  if (
    silenceCounterDate !==
    now.date
  ) {

    silenceCounterDate =
      now.date;

    silenceRepliesToday =
      0;

    goodNightSentDate =
      '';
  }
}


/*
 * =========================================================
 * 主動訊息檢查
 * =========================================================
 */

async function checkProactiveMessages(
  lineClient: messagingApi.MessagingApiClient,
  generateReply: (
    type: 'good-night' | 'silence',
  ) => Promise<string>,
): Promise<void> {

  /*
   * 沒有家庭群組時，
   * 暫時什麼都不做。
   */
  if (!familyGroupId) {
    return;
  }


  resetDailyCounterIfNeeded();


  const now =
    getTaipeiDateTime();


  /*
   * =======================================================
   * ① 固定時間晚安
   * =======================================================
   */

  if (
    now.hour === GOOD_NIGHT_HOUR &&
    now.minute === GOOD_NIGHT_MINUTE &&
    goodNightSentDate !== now.date
  ) {

    const replyText =
      await generateReply(
        'good-night',
      );


    const message =
      replyText.trim() ||
      GOOD_NIGHT_MESSAGE;


    await sendProactiveMessage(
      lineClient,
      familyGroupId,
      message,
    );


    goodNightSentDate =
      now.date;


    console.log(
      '[Proactive Scheduler] 已發送固定晚安',
    );
  }


  /*
   * =======================================================
   * ② 冷場
   * =======================================================
   */

  if (
    lastGroupMessageTime === 0
  ) {
    return;
  }


  /*
   * 距離最後一次群組訊息多久。
   */
  const silenceDuration =
    Date.now() -
    lastGroupMessageTime;


  const silenceLimit =
    SILENCE_HOURS *
    60 *
    60 *
    1000;


  /*
   * 尚未冷場到指定時間。
   */
  if (
    silenceDuration <
    silenceLimit
  ) {
    return;
  }


  /*
   * 今日冷場主動次數已達上限。
   */
  if (
    silenceRepliesToday >=
    MAX_SILENCE_REPLIES_PER_DAY
  ) {
    return;
  }


  /*
   * 避免同一次冷場在每 30 秒檢查時
   * 一直觸發。
   *
   * 先把 lastGroupMessageTime 更新成現在，
   * 代表這次冷場已經處理過。
   */
  lastGroupMessageTime =
    Date.now();


  const replyText =
    await generateReply(
      'silence',
    );


  const message =
    replyText.trim();


  if (!message) {
    return;
  }


  await sendProactiveMessage(
    lineClient,
    familyGroupId,
    message,
  );


  silenceRepliesToday +=
    1;


  console.log(
    `[Proactive Scheduler] 冷場主動發話：今日第 ${silenceRepliesToday} 次`,
  );
}


/*
 * =========================================================
 * 主動推送 LINE 訊息
 * =========================================================
 */

async function sendProactiveMessage(
  lineClient: messagingApi.MessagingApiClient,
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
            text.slice(
              0,
              5000,
            ),
        },
      ],
    },
  );
}