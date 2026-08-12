import { GoogleGenAI } from '@google/genai';
import { messagingApi } from '@line/bot-sdk';

type ObserverCategory =
  | 'greeting'
  | 'food'
  | 'daily'
  | 'general'
  | 'none';

type ObserverMode =
  | 'greeting_morning'
  | 'greeting_night'
  | 'food'
  | 'daily'
  | 'general';

type TimerHandle = ReturnType<typeof setTimeout>;

interface ObserverState {
  lastPassiveReplyAt: number;
  meaningfulSinceDecision: number;

  generalTimer?: TimerHandle;

  greetingTimer?: TimerHandle;
  greetingType?: '早安' | '晚安';
  greetingLastSeenAt?: number;

  foodTimer?: TimerHandle;
  foodLastSeenAt?: number;

  dailyLastReplyAt?: number;
}

interface ObserveOptions {
  targetId: string;
  userMessage: string;
  getConversationContext: () => string;
  gemini: GoogleGenAI;
  lineClient: messagingApi.MessagingApiClient;
  onPassiveReply: (replyText: string) => void;
}

const observerStates =
  new Map<string, ObserverState>();


/*
 * 一般被動插話的冷卻時間。
 */
const GENERAL_PASSIVE_COOLDOWN_MS =
  20_000;


/*
 * 一般對話稍微安靜後，
 * 才判斷是否值得插話。
 */
const GENERAL_DEBOUNCE_MS =
  2_500;


/*
 * 早安／晚安延遲。
 *
 * 給其他家人一點時間先互相回應。
 */
const GREETING_DELAY_MS =
  5_000;


/*
 * 同一波早安／晚安的防重複時間。
 */
const GREETING_WAVE_COOLDOWN_MS =
  60_000;


/*
 * 吃飯相關延遲。
 */
const FOOD_DELAY_MS =
  5_000;


/*
 * 日常狀態的被動回覆冷卻。
 */
const DAILY_REPLY_COOLDOWN_MS =
  10_000;


/*
 * 被動插話最多 15 個中文字。
 *
 * 沒有最低字數。
 */
const MAX_PASSIVE_CHARS =
  15;


/* =========================================================
 * 公開入口
 * ========================================================= */

export function observeMessage(
  options: ObserveOptions,
): void {
  const {
    targetId,
    userMessage,
  } = options;

  const state =
    getState(targetId);

  const category =
    classifyMessage(userMessage);


  switch (category) {

    case 'greeting':
      handleGreeting(
        options,
        state,
      );
      return;


    case 'food':
      handleFood(
        options,
        state,
      );
      return;


    case 'daily':
      handleDaily(
        options,
        state,
      );
      return;


    case 'general':
      handleGeneral(
        options,
        state,
      );
      return;


    case 'none':
    default:
      return;
  }
}


/* =========================================================
 * Observer State
 * ========================================================= */

function getState(
  targetId: string,
): ObserverState {

  let state =
    observerStates.get(
      targetId,
    );


  if (!state) {

    state = {
      lastPassiveReplyAt: 0,
      meaningfulSinceDecision: 0,
    };


    observerStates.set(
      targetId,
      state,
    );
  }


  return state;
}


/* =========================================================
 * 訊息分類
 * ========================================================= */

function classifyMessage(
  message: string,
): ObserverCategory {

  const text =
    message.trim();


  if (!text) {
    return 'none';
  }


  /*
   * 低資訊訊息。
   *
   * 「哈哈」刻意保留，
   * 因為可能代表上一句有笑點。
   */
  if (
    isLowInformation(text)
  ) {
    return 'none';
  }


  /*
   * 早安／晚安。
   */
  if (
    isGreeting(text)
  ) {
    return 'greeting';
  }


  /*
   * 「要吃什麼」這類通常是在問其他家人，
   * 總管不要搶答。
   */
  if (
    isAskingOthersWhatToEat(text)
  ) {
    return 'none';
  }


  /*
   * 吃飯相關。
   */
  if (
    isFoodRelated(text)
  ) {
    return 'food';
  }


  /*
   * 日常狀態。
   */
  if (
    isDailyState(text)
  ) {
    return 'daily';
  }


  /*
   * 一般聊天。
   */
  return 'general';
}


/* =========================================================
 * 早安／晚安
 * ========================================================= */

function handleGreeting(
  options: ObserveOptions,
  state: ObserverState,
): void {

  const text =
    options.userMessage.trim();


  const type =
    text.includes('晚安') ||
    /^晚[\s!！。,.，～~]*$/.test(
      text,
    )
      ? '晚安'
      : '早安';


  const now =
    Date.now();


  /*
   * 同一波已經回過，
   * 不要每個人都回一次。
   */
  if (
    state.greetingLastSeenAt &&
    now -
      state.greetingLastSeenAt <
      GREETING_WAVE_COOLDOWN_MS &&
    !state.greetingTimer
  ) {
    return;
  }


  /*
   * 同一波有新的早安／晚安，
   * 重新計時。
   */
  if (
    state.greetingTimer &&
    state.greetingType === type
  ) {

    clearTimeout(
      state.greetingTimer,
    );
  }


  state.greetingType =
    type;


  state.greetingTimer =
    setTimeout(
      async () => {

        state.greetingTimer =
          undefined;

        state.greetingType =
          undefined;

        state.greetingLastSeenAt =
          Date.now();


        await generateAndPushPassiveReply(
          {
            ...options,

            mode:
              type === '早安'
                ? 'greeting_morning'
                : 'greeting_night',

            fallback:
              type === '早安'
                ? '早，諸位主子。'
                : '晚安，諸位主子。',
          },
        );
      },

      GREETING_DELAY_MS,
    );
}


/* =========================================================
 * 吃飯相關
 * ========================================================= */

function handleFood(
  options: ObserveOptions,
  state: ObserverState,
): void {

  const now =
    Date.now();


  /*
   * 同一段吃飯話題持續時，
   * 不要一直開新的計時器。
   */
  if (
    state.foodTimer
  ) {

    clearTimeout(
      state.foodTimer,
    );
  }


  state.foodLastSeenAt =
    now;


  state.foodTimer =
    setTimeout(
      async () => {

        state.foodTimer =
          undefined;


        /*
         * 如果總管剛剛才被動說過，
         * 暫時保持安靜。
         */
        if (
          Date.now() -
            state.lastPassiveReplyAt <
            GENERAL_PASSIVE_COOLDOWN_MS
        ) {
          return;
        }


        await generateAndPushPassiveReply(
          {
            ...options,

            mode: 'food',

            fallback:
              '奴才也想吃。',
          },
        );
      },

      FOOD_DELAY_MS,
    );
}


/* =========================================================
 * 日常狀態
 * ========================================================= */

function handleDaily(
  options: ObserveOptions,
  state: ObserverState,
): void {

  const now =
    Date.now();


  /*
   * 日常狀態可以快速接住，
   * 但不能連續每一句都回。
   */
  if (
    state.dailyLastReplyAt &&
    now -
      state.dailyLastReplyAt <
      DAILY_REPLY_COOLDOWN_MS
  ) {
    return;
  }


  state.dailyLastReplyAt =
    now;


  void generateAndPushPassiveReply(
    {
      ...options,

      mode: 'daily',

      fallback:
        '喳，奴才收到。',
    },
  );
}


/* =========================================================
 * 一般聊天 Observer
 * ========================================================= */

function handleGeneral(
  options: ObserveOptions,
  state: ObserverState,
): void {

  /*
   * 這不是：
   *
   * 「第 3 句就一定插話」。
   *
   * 3 只是最低觀察門檻。
   */
  state.meaningfulSinceDecision +=
    1;


  if (
    state.meaningfulSinceDecision <
    3
  ) {
    return;
  }


  /*
   * 被動插話冷卻。
   */
  if (
    Date.now() -
      state.lastPassiveReplyAt <
      GENERAL_PASSIVE_COOLDOWN_MS
  ) {
    return;
  }


  /*
   * 大家還在快速聊天時，
   * 不要突然插入。
   *
   * 每有新的有效訊息，
   * 就重新等待。
   */
  if (
    state.generalTimer
  ) {

    clearTimeout(
      state.generalTimer,
    );
  }


  state.generalTimer =
    setTimeout(
      async () => {

        state.generalTimer =
          undefined;


        if (
          Date.now() -
            state.lastPassiveReplyAt <
            GENERAL_PASSIVE_COOLDOWN_MS
        ) {
          return;
        }


        state.meaningfulSinceDecision =
          0;


        await generateAndPushPassiveReply(
          {
            ...options,

            mode: 'general',

            fallback: '',
          },
        );
      },

      GENERAL_DEBOUNCE_MS,
    );
}


/* =========================================================
 * Gemini：判斷是否值得插話
 * ========================================================= */

async function generateAndPushPassiveReply(
  options:
    ObserveOptions & {
      mode: ObserverMode;
      fallback: string;
    },
): Promise<void> {

  const {
    targetId,
    getConversationContext,
    gemini,
    lineClient,
    onPassiveReply,
    mode,
    fallback,
  } = options;


  try {

    const context =
      getConversationContext();


    const observerInstruction =
      buildObserverInstruction(
        mode,
      );


    const response =
      await gemini.models.generateContent(
        {
          model:
            'gemini-3.5-flash-lite',

          contents:
            `${observerInstruction}\n\n` +
            `【目前對話】\n` +
            context,

          config: {

            systemInstruction:
              `
你是「大內總管」。

這一次不是有人直接叫你回答，
而是你正在旁聽這段家庭對話。

你不是主持人。
你不是客服。
你不是聊天機器人。

只有在「現在加入一句話會讓對話更自然、更有趣或更溫暖」時才說話。

如果不適合插話，只輸出：

NO_REPLY

如果適合插話，只輸出：

REPLY: 你的短句

不要加任何解釋。
不要分析。
不要列選項。
不要寫前言。
不要寫第二句。

被動插話最多 15 個中文字。
沒有最低字數。

可以只有：
「喳。」
「在。」
「奴才也想吃。」
「這朝會又開始了。」

也可以是一句極短的幽默話。

不要突然寫長篇。
不要把家庭對話整理成文章。
不要重新分析前面的內容。

宮廷風格可以有，
但自然聊天優先。

如果只是普通問答，
通常保持安靜。

如果只是：
嗯、喔、好、行、可以、收到，
通常不要插話。

「哈哈」不是低資訊訊息，
它可能代表前一句有笑點，
請根據上下文判斷。

早安／晚安：
這一波最後一定要回一次，
但只回一句非常短的話。

吃飯／晚餐／宵夜：
不要搶著回答家人正在討論的問題。
比較像旁邊聽到後自然補一句。

如果有人突然直接叫你，
那屬於正常主動對話，
不是這次 Observer 的任務。
              `.trim(),
          },
        },
      );


    let replyText =
      response.text?.trim() ||
      '';


    /*
     * Gemini 判斷不插話。
     */
    if (
      !replyText ||
      replyText === 'NO_REPLY' ||
      replyText.startsWith(
        'NO_REPLY',
      )
    ) {

      /*
       * 早安／晚安：
       * 最終一定回一次。
       */
      if (
        mode ===
          'greeting_morning' ||
        mode ===
          'greeting_night'
      ) {

        replyText =
          fallback;

      } else if (
        mode === 'food'
      ) {

        /*
         * 吃飯相關如果真的沒有
         * 其他值得接的內容，
         * 弱弱補一句。
         */
        replyText =
          fallback;

      } else {

        return;
      }
    }


    /*
     * 去掉 Gemini 自己加上的 REPLY:。
     */
    replyText =
      replyText
        .replace(
          /^REPLY:\s*/i,
          '',
        )
        .trim();


    /*
     * 移除換行。
     */
    replyText =
      replyText
        .replace(
          /\r?\n/g,
          '',
        )
        .trim();


    /*
     * 被動只允許一句。
     */
    const firstSentence =
      replyText
        .split(
          /[。！？!?]/,
        )[0]
        ?.trim() ||
      replyText;


    replyText =
      firstSentence.slice(
        0,
        MAX_PASSIVE_CHARS,
      );


    if (!replyText) {
      return;
    }


    /*
     * Observer 延遲後使用 push message。
     *
     * targetId：
     * - 私訊測試時 = userId
     * - 正式群組時 = groupId
     */
    await lineClient.pushMessage(
      {
        to: targetId,

        messages: [
          {
            type: 'text',
            text: replyText,
          },
        ],
      },
    );


    /*
     * 成功發送才記錄為真正插話。
     */
    onPassiveReply(
      replyText,
    );


    const state =
      getState(
        targetId,
      );


    state.lastPassiveReplyAt =
      Date.now();

  } catch (error) {

    console.error(
      'Observer error:',
      error,
    );

    /*
     * Observer 發生錯誤時，
     * 不要自己亂發訊息。
     */
  }
}


/* =========================================================
 * 不同類型的 Observer 指令
 * ========================================================= */

function buildObserverInstruction(
  mode: ObserverMode,
): string {

  switch (mode) {

    case 'greeting_morning':
      return `
這是一波「早安」。

請自然接住這個家庭招呼。

現在已經稍微等待過了，
不要搶在家人前面。

只需要一句很短的回應。
      `.trim();


    case 'greeting_night':
      return `
這是一波「晚安」。

請自然接住這個家庭招呼。

現在已經稍微等待過了，
不要搶在家人前面。

只需要一句很短的回應。
      `.trim();


    case 'food':
      return `
這是一段吃飯相關的對話。

不要回答「大家要吃什麼」這種本來應該由家人決定的問題。

像旁邊聽到聊天的第五個家庭成員，
稍微等過之後自然補一句。

可以接梗、幽默、
表達自己也想吃，
或用總管身份開一個很短的玩笑。

如果真的沒什麼好說，
可以非常短。
      `.trim();


    case 'daily':
      return `
這是一句家庭成員的日常狀態。

例如：
累、冷、熱、下雨、放假、
回家、下班、心情好或不好。

這種情況適合讓家人感覺「有人接住」。

請快速給一句很短、
自然、溫暖或幽默的回應。

不要分析。
      `.trim();


    case 'general':
      return `
這是一段一般家庭聊天。

請判斷：
「現在加入一句話，
會不會讓這段對話更自然、更有趣？」

不是每段對話都值得插話。

如果只是正常問答、
資訊交換、
簡單確認，
通常保持安靜。

如果出現：
- 明顯笑點
- 很適合吐槽的情境
- 大家陷入有趣的僵局
- 某人說了很有個人特色的話
- 可以用一句話增加家庭氣氛
- 總管突然加入反而很好笑

才考慮插一句。

寧可不說，
也不要為了存在感硬插。
      `.trim();
  }
}


/* =========================================================
 * 低資訊訊息
 * ========================================================= */

function isLowInformation(
  text: string,
): boolean {

  const normalized =
    text
      .trim()
      .replace(
        /[。！!？?，,。.～~]+$/g,
        '',
      )
      .trim();


  const lowInformation =
    new Set([
      '嗯',
      '嗯嗯',
      '嗯嗯嗯',
      '恩',
      '恩恩',
      '喔',
      '哦',
      '哦哦',
      '好',
      '好喔',
      '好哦',
      '好啊',
      '行',
      '可以',
      '收到',
      '知道了',
      '了解',
      '在',
      '對',
      '是',
      '不是',
      '沒事',
      '沒問題',
    ]);


  /*
   * 「哈哈」故意保留。
   */
  if (
    lowInformation.has(
      normalized,
    )
  ) {
    return true;
  }


  /*
   * 純標點。
   */
  if (
    /^[\s\p{P}\p{S}]+$/u.test(
      text,
    )
  ) {
    return true;
  }


  return false;
}


/* =========================================================
 * 早安／晚安
 * ========================================================= */

function isGreeting(
  text: string,
): boolean {

  const normalized =
    text
      .trim()
      .replace(
        /[！!。,.，、～~\s]/g,
        '',
      );


  return [
    '早安',
    '早',
    '晚安',
    '晚',
    '睡了',
    '先睡了',
    '我睡了',
    '去睡了',
    '先睡',
  ].includes(
    normalized,
  );
}


/* =========================================================
 * 「要吃什麼」不搶答
 * ========================================================= */

function isAskingOthersWhatToEat(
  text: string,
): boolean {

  return /要吃什麼|吃什麼|吃哪個|吃哪家|哪裡吃|吃哪間/.test(
    text,
  );
}


/* =========================================================
 * 吃飯相關
 * ========================================================= */

function isFoodRelated(
  text: string,
): boolean {

  return /吃飯了嗎|吃了嗎|吃飯|吃飽|晚餐|宵夜|消夜|早餐|午餐|好餓|餓了|吃東西|去吃飯/.test(
    text,
  );
}


/* =========================================================
 * 日常狀態
 * ========================================================= */

function isDailyState(
  text: string,
): boolean {

  const patterns = [
    /好累/,
    /累死/,
    /累爆/,
    /很累/,
    /超累/,
    /好睏/,
    /很睏/,
    /想睡/,
    /睡不著/,
    /好冷/,
    /很冷/,
    /冷死/,
    /好熱/,
    /很熱/,
    /熱死/,
    /下雨/,
    /下雨了/,
    /放假/,
    /休假/,
    /回家了/,
    /到家了/,
    /回來了/,
    /下班了/,
    /出門了/,
    /出門/,
    /到公司了/,
    /到公司/,
    /心情不好/,
    /心情很差/,
    /心情不錯/,
    /心情很好/,
    /心情好/,
    /有人嗎/,
    /大家在幹嘛/,
    /你們在幹嘛/,
    /今天好/,
    /今天超/,
  ];


  return patterns.some(
    (pattern) =>
      pattern.test(text),
  );
}