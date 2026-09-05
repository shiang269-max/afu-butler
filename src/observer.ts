import { GoogleGenAI } from '@google/genai';
import { messagingApi } from '@line/bot-sdk';
import { FamilyMember } from './family';
import {
  hasCallName,
  cleanCallNames,
} from './call-names';

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
  latestEventReceivedAt?: number;

  generalTimer?: TimerHandle;
  generalGeneration: number;
  observerInFlight?: boolean;

  greetingType?: '早安' | '晚安';
  greetingLastSeenAt?: number;

  foodLastSeenAt?: number;
  dailyLastReplyAt?: number;
  dailyLastKey?: string;
  dailyLastAt?: number;
  mutedUntil?: number;
}

interface ObserveOptions {
  diagnosticTraceId?: string;
  eventReceivedAt?: number;
  targetId: string;
  userMessage: string;
  replyToken: string;
  replyDeadlineAt: number;
  familyMember?: FamilyMember;
  getConversationContext: () => string;
  gemini: GoogleGenAI;
  lineClient: messagingApi.MessagingApiClient;
  onPassiveReply: (replyText: string) => void;
}

const observerStates = new Map<string, ObserverState>();

const GENERAL_PASSIVE_COOLDOWN_MS = 20_000;
const GENERAL_DEBOUNCE_MS = 2_500;
const GREETING_WAVE_COOLDOWN_MS = 60_000;
const DAILY_DUPLICATE_COOLDOWN_MS = 30_000;
const OBSERVER_MUTE_DURATION_MS = 10 * 60 * 1000;
const MAX_PASSIVE_CHARS = 15;

export function isObserverMuteCommand(message: string): boolean {
  if (!hasCallName(message)) return false;

  const text = cleanCallNames(message)
    .replace(/[，。！？、,.!?～~\s]/g, '');

  return /^(?:閉嘴|先閉嘴|安靜|先安靜|不要插話|別插話|先不要插話|不要再插話|別再插話|少插嘴)$/.test(text);
}

export function isObserverUnmuteCommand(message: string): boolean {
  if (!hasCallName(message)) return false;

  const text = cleanCallNames(message)
    .replace(/[，。！？、,.!?～~\s]/g, '');

  return /^(?:可以說話了|解除閉嘴|不用閉嘴了|不用安靜了|恢復插話|恢復說話)$/.test(text);
}

export function muteObserver(targetId: string): number {
  const state = getState(targetId);
  const until = Date.now() + OBSERVER_MUTE_DURATION_MS;
  state.mutedUntil = until;

  if (state.generalTimer) {
    clearTimeout(state.generalTimer);
    state.generalTimer = undefined;
  }

  state.generalGeneration += 1;
  state.meaningfulSinceDecision = 0;

  return until;
}

export function unmuteObserver(targetId: string): void {
  const state = getState(targetId);
  state.mutedUntil = undefined;
}

function isObserverMuted(state: ObserverState): boolean {
  if (!state.mutedUntil) return false;

  if (Date.now() >= state.mutedUntil) {
    state.mutedUntil = undefined;
    return false;
  }

  return true;
}

function isReplyWindowOpen(replyDeadlineAt: number): boolean {
  return Date.now() < replyDeadlineAt;
}

function isLatestObserverEvent(state: ObserverState, eventReceivedAt?: number): boolean {
  if (eventReceivedAt === undefined) return true;
  return state.latestEventReceivedAt === eventReceivedAt;
}

export function observeMessage(options: ObserveOptions): void {
  const traceId =
    options.diagnosticTraceId ||
    `observer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const elapsed = () =>
    options.eventReceivedAt
      ? Date.now() - options.eventReceivedAt
      : Date.now();

  console.log(
    `[Observer][${traceId}] RECEIVED elapsed=${elapsed()}ms target=${options.targetId} message=${JSON.stringify(options.userMessage)}`,
  );

  const { targetId, userMessage } = options;
  const state = getState(targetId);

  if (options.eventReceivedAt !== undefined) {
    state.latestEventReceivedAt = Math.max(
      state.latestEventReceivedAt || 0,
      options.eventReceivedAt,
    );
  }

  if (isObserverMuted(state)) {
    console.log(`[Observer][${traceId}] SKIP reason=muted elapsed=${elapsed()}ms`);
    return;
  }

  const category = classifyMessage(userMessage);

  console.log(
    `[Observer][${traceId}] CLASSIFIED category=${category} elapsed=${elapsed()}ms`,
  );

  switch (category) {
    case 'greeting':
      console.log(`[Observer][${traceId}] DISPATCH greeting elapsed=${elapsed()}ms`);
      handleGreeting(options, state);
      return;
    case 'food':
      console.log(`[Observer][${traceId}] DISPATCH food elapsed=${elapsed()}ms`);
      handleFood(options, state);
      return;
    case 'daily':
      console.log(`[Observer][${traceId}] DISPATCH daily elapsed=${elapsed()}ms`);
      handleDaily(options, state);
      return;
    case 'general':
      console.log(`[Observer][${traceId}] DISPATCH general elapsed=${elapsed()}ms`);
      handleGeneral(options, state);
      return;
    case 'none':
    default:
      console.log(`[Observer][${traceId}] DISPATCH none elapsed=${elapsed()}ms`);
      return;
  }
}

function getState(targetId: string): ObserverState {
  let state = observerStates.get(targetId);

  if (!state) {
    state = {
      lastPassiveReplyAt: 0,
      meaningfulSinceDecision: 0,
      generalGeneration: 0,
    };

    observerStates.set(targetId, state);
  }

  return state;
}

function classifyMessage(message: string): ObserverCategory {
  const text = message.trim();
  if (!text) return 'none';
  if (isLowInformation(text)) return 'none';
  if (isGreeting(text)) return 'greeting';
  if (isAskingOthersWhatToEat(text)) return 'none';
  if (isFoodRelated(text)) return 'food';
  if (isDailyState(text)) return 'daily';
  return 'general';
}

function handleGreeting(options: ObserveOptions, state: ObserverState): void {
  const text = options.userMessage.trim();
  const type =
    text.includes('晚安') || /^晚[\s!！。,.，～~]*$/.test(text)
      ? '晚安'
      : '早安';

  const now = Date.now();

  if (
    state.greetingLastSeenAt &&
    now - state.greetingLastSeenAt < GREETING_WAVE_COOLDOWN_MS
  ) {
    return;
  }

  if (state.observerInFlight) return;

  state.observerInFlight = true;

  void generateAndReplyPassive({
    ...options,
    mode: type === '早安' ? 'greeting_morning' : 'greeting_night',
    fallback: type === '早安' ? '早，諸位主子。' : '晚安，諸位主子。',
  }).finally(() => {
    state.observerInFlight = false;
  });
}

function handleFood(options: ObserveOptions, state: ObserverState): void {
  const now = Date.now();
  state.foodLastSeenAt = now;

  if (
    Date.now() - state.lastPassiveReplyAt <
    GENERAL_PASSIVE_COOLDOWN_MS
  ) {
    return;
  }

  if (state.observerInFlight) return;

  state.observerInFlight = true;

  void generateAndReplyPassive({
    ...options,
    mode: 'food',
    fallback: '奴才也想吃。',
  }).finally(() => {
    state.observerInFlight = false;
  });
}

function handleDaily(options: ObserveOptions, state: ObserverState): void {
  const now = Date.now();
  const dailyKey = normalizeDailyKey(options.userMessage);

  if (
    state.dailyLastKey === dailyKey &&
    state.dailyLastAt &&
    now - state.dailyLastAt < DAILY_DUPLICATE_COOLDOWN_MS
  ) {
    return;
  }

  if (state.observerInFlight) return;

  state.dailyLastKey = dailyKey;
  state.dailyLastAt = now;
  state.observerInFlight = true;

  void generateAndReplyPassive({
    ...options,
    mode: 'daily',
    fallback: '喳，奴才收到。',
  }).finally(() => {
    state.observerInFlight = false;
  });
}

function handleGeneral(options: ObserveOptions, state: ObserverState): void {
  state.meaningfulSinceDecision += 1;

  if (state.meaningfulSinceDecision < 3) return;

  if (
    Date.now() - state.lastPassiveReplyAt <
    GENERAL_PASSIVE_COOLDOWN_MS
  ) {
    return;
  }

  if (state.observerInFlight) return;

  if (state.generalTimer) {
    clearTimeout(state.generalTimer);
  }

  const generation = state.generalGeneration + 1;
  state.generalGeneration = generation;

  state.generalTimer = setTimeout(async () => {
    if (state.generalGeneration !== generation) return;
    if (!isLatestObserverEvent(state, options.eventReceivedAt)) return;

    state.generalTimer = undefined;

    if (
      Date.now() - state.lastPassiveReplyAt <
      GENERAL_PASSIVE_COOLDOWN_MS
    ) {
      return;
    }

    if (isObserverMuted(state)) return;
    if (state.observerInFlight) return;

    state.meaningfulSinceDecision = 0;
    state.observerInFlight = true;

    try {
      await generateAndReplyPassive({
        ...options,
        mode: 'general',
        fallback: '',
      });
    } finally {
      state.observerInFlight = false;
    }
  }, GENERAL_DEBOUNCE_MS);
}

async function generateAndReplyPassive(
  options: ObserveOptions & {
    mode: ObserverMode;
    fallback: string;
  },
): Promise<void> {
  const traceId =
    options.diagnosticTraceId ||
    `observer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const elapsed = () =>
    options.eventReceivedAt
      ? Date.now() - options.eventReceivedAt
      : Date.now();

  console.log(
    `[Observer][${traceId}] GENERATE_START mode=${options.mode} elapsed=${elapsed()}ms replyRemaining=${Math.max(0, options.replyDeadlineAt - Date.now())}ms`,
  );

  const {
    targetId,
    userMessage,
    familyMember,
    getConversationContext,
    gemini,
    lineClient,
    replyToken,
    replyDeadlineAt,
    onPassiveReply,
    mode,
    fallback,
  } = options;

  try {
    const currentState = getState(targetId);

    if (!isLatestObserverEvent(currentState, options.eventReceivedAt)) return;
    if (isObserverMuted(currentState)) return;
    if (!isReplyWindowOpen(replyDeadlineAt)) return;

    const context = getConversationContext();
    const observerInstruction = buildObserverInstruction(mode);

    const response = await gemini.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents:
        `${observerInstruction}\n\n` +
        `【目前這句話的說話者】\n` +
        (familyMember
          ? `身份：${familyMember.identity}\n` +
            `家庭角色：${familyMember.role}\n` +
            `家庭地位：${familyMember.authority}\n` +
            `個性：${familyMember.personality}\n` +
            `互動方式：${familyMember.interaction}\n`
          : '目前尚未登記此說話者的家庭身份。\n') +
        `\n【這次收到的訊息】\n` +
        userMessage +
        `\n\n【目前對話】\n` +
        context,
      config: {
        systemInstruction: `
你是「大內總管」。

這一次不是有人直接叫你回答，而是你正在旁聽這段家庭對話。

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

可以只有：「喳。」「在。」「奴才也想吃。」「這朝會又開始了。」

也可以是一句極短的幽默話。

不要突然寫長篇。
不要把家庭對話整理成文章。
不要重新分析前面的內容。

宮廷風格可以有，但自然聊天優先。

如果只是普通問答，通常保持安靜。

如果只是：嗯、喔、好、行、可以、收到，通常不要插話。

「哈哈」不是低資訊訊息，它可能代表前一句有笑點，請根據上下文判斷。

早安／晚安：這一波最後一定要回一次，但只回一句非常短的話。

吃飯／晚餐／宵夜：不要搶著回答家人正在討論的問題，比較像旁邊聽到後自然補一句。

如果有人突然直接叫你，那屬於正常主動對話，不是這次 Observer 的任務。
        `.trim(),
      },
    });

    if (!isReplyWindowOpen(replyDeadlineAt)) return;

    const latestState = getState(targetId);
    if (!isLatestObserverEvent(latestState, options.eventReceivedAt)) {
      console.log(`[Observer][${traceId}] SKIP reason=stale-event elapsed=${elapsed()}ms`);
      return;
    }
    if (isObserverMuted(latestState)) return;

    let replyText = response.text?.trim() || '';

    if (
      !replyText ||
      replyText === 'NO_REPLY' ||
      replyText.startsWith('NO_REPLY')
    ) {
      if (mode === 'greeting_morning' || mode === 'greeting_night') {
        replyText = fallback;
      } else if (mode === 'food' || mode === 'daily') {
        replyText = fallback;
      } else {
        return;
      }
    }

    replyText = replyText
      .replace(/^REPLY:\s*/i, '')
      .replace(/\r?\n/g, '')
      .trim();

    const firstSentence =
      replyText.split(/[。！？!?]/)[0]?.trim() || replyText;

    replyText = firstSentence.slice(0, MAX_PASSIVE_CHARS);
    if (!replyText) return;

    if (!isReplyWindowOpen(replyDeadlineAt)) return;
    if (!isLatestObserverEvent(latestState, options.eventReceivedAt)) {
      console.log(`[Observer][${traceId}] SKIP reason=stale-event-before-reply elapsed=${elapsed()}ms`);
      return;
    }
    if (isObserverMuted(latestState)) return;

    await lineClient.replyMessage({
      replyToken,
      messages: [
        {
          type: 'text',
          text: replyText,
        },
      ],
    });

    onPassiveReply(replyText);
    latestState.lastPassiveReplyAt = Date.now();

    if (mode === 'greeting_morning' || mode === 'greeting_night') {
      latestState.greetingLastSeenAt = Date.now();
    }
  } catch (error) {
    console.error(
      `[Observer][${traceId}] ERROR elapsed=${elapsed()}ms`,
      error,
    );
  }
}

function buildObserverInstruction(mode: ObserverMode): string {
  switch (mode) {
    case 'greeting_morning':
      return `
這是一波「早安」。

請自然接住這個家庭招呼。

這是即時被動插話，不需要刻意等待。

只需要一句很短的回應。
      `.trim();

    case 'greeting_night':
      return `
這是一波「晚安」。

請自然接住這個家庭招呼。

這是即時被動插話，不需要刻意等待。

只需要一句很短的回應。
      `.trim();

    case 'food':
      return `
這是在談吃飯、食物或餐點。

不要搶著回答家人正在問彼此的問題。

只在適合時補一句旁邊人的自然反應。
      `.trim();

    case 'daily':
      return `
這是在談今天的身體狀態、疲累、忙碌、心情或日常。

如果適合，可以自然關心一句。
      `.trim();

    case 'general':
      return `
這是家庭對話中的一般內容。

只有真的適合插話時才回應。

如果沒有必要加入，請輸出 NO_REPLY。
      `.trim();
  }
}

function isLowInformation(text: string): boolean {
  return /^(嗯+|喔+|哦+|噢+|好+|行+|可以|收到|知道了|了解|ok|OK|👍|哈哈+)$/.test(
    text.replace(/[，。！？、,.!?～~\s]/g, ''),
  );
}

function isGreeting(text: string): boolean {
  const normalized = text.replace(/[，。！？、,.!?～~\s]/g, '');
  return /^(早安|早|晚安|晚)$/.test(normalized);
}

function isAskingOthersWhatToEat(text: string): boolean {
  return /(?:吃什麼|吃啥|要吃什麼|想吃什麼|晚餐吃|午餐吃|早餐吃|宵夜吃)/.test(text);
}

function isFoodRelated(text: string): boolean {
  return /(?:吃飯|吃東西|晚餐|午餐|早餐|宵夜|火鍋|便當|麵|飯|菜|餐廳|外送|餓|肚子)/.test(text);
}

function isDailyState(text: string): boolean {
  return /(?:累|疲|忙|睡|醒|起床|回家|下班|上班|心情|開心|難過|生氣|不舒服|舒服|頭痛|肚子痛)/.test(text);
}

function normalizeDailyKey(text: string): string {
  return text
    .replace(/[，。！？、,.!?～~\s]/g, '')
    .toLowerCase();
}
