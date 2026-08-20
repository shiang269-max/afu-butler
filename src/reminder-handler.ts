import { GoogleGenAI } from '@google/genai';

import {
  createReminder,
  cancelReminder,
  updateReminder,
  loadReminders,
  Reminder,
  ReminderTarget,
} from './reminder';

import {
  FAMILY_MEMBERS,
} from './family';

import {
  setPendingReminderState,
  getPendingReminderState,
  clearPendingReminderState,
} from './reminder-state';

/*
 * =========================================================
 * Reminder Handler 2.0
 * =========================================================
 *
 * 一次整合：
 *
 * 1. 一則訊息建立多筆 Reminder
 * 2. 一筆 Reminder 多個提醒對象
 * 3. 每筆 Reminder 各自解析時間
 * 4. 查詢：全部／今天／明天／這週／這個月
 * 5. 查詢後可直接使用編號操作
 * 6. 單筆取消／修改
 * 7. 多筆取消／修改
 * 8. 建立人／被提醒者取消權限
 * 9. 重複 Reminder 偵測＋確認
 * 10. 保留舊 createReminderFromMessage API
 *
 * 不負責：
 * - LINE 發送
 * - Scheduler
 * - Mention message object
 */


type ReminderAction =
  | 'create'
  | 'list'
  | 'cancel'
  | 'update';

type QueryPeriod =
  | 'all'
  | 'today'
  | 'tomorrow'
  | 'week'
  | 'month';

type ReminderTargets = ReminderTarget[];

interface ParsedCreateItem {
  remindAt?: string;
  remindAtEnd?: string;
  content?: string;
  targets?: Array<'self' | 'all' | string>;
}

interface ReminderParseResult {
  action: ReminderAction | 'none';
  remindAt?: string;
  remindAtEnd?: string;
  content?: string;
  target: 'self' | 'all' | string | null;
  targets?: Array<'self' | 'all' | string>;
  reminders?: ParsedCreateItem[];
  queryScope?: 'self' | 'group';
  queryPeriod?: QueryPeriod;
  updateRemindAt?: string;
  updateContent?: string;
  updateTarget: 'self' | 'all' | string | null;
}

export interface ReminderHandlerResult {
  handled: boolean;
  action?:
    | ReminderAction
    | 'duplicate-confirmation'
    | 'selection-confirmation'
    | 'authorization-confirmation';
  created?: boolean;
  cancelled?: boolean;
  updated?: boolean;
  reminderId?: string;
  remindAt?: string;
  content?: string;
  target?: ReminderTarget;
  reminders?: Reminder[];
  candidates?: Reminder[];
  message?: string;

  /*
   * 由 index.ts 統一處理真正的 LINE Mention。
   *
   * mentionUserIds：
   *   指定要 @ 的 LINE User ID。
   *
   * mentionAll：
   *   建立「提醒大家／全家人」時使用 LINE @ALL。
   */
  mentionUserIds?: string[];
  mentionAll?: boolean;
}

/* =========================================================
 * 初步判斷
 * ========================================================= */

export function mayBeReminder(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  const words = [
    '提醒',
    '提示',
    '叫我',
    '叫他',
    '叫她',
    '叫大家',
    '通知我',
    '通知大家',
    '記得提醒',
    '提醒一下',
    '有哪些提醒',
    '我的提醒',
    '提醒呢',
    '取消提醒',
    '取消',
    '撤掉提醒',
    '不要再提醒',
    '改成',
    '修改提醒',
    '延後提醒',
    '幫我把',
  ];

  return words.some((word) => text.includes(word));
}

/* =========================================================
 * Parser Prompt
 * ========================================================= */

function buildReminderPrompt(
  message: string,
  currentTime: string,
): string {
  const members = Object.entries(FAMILY_MEMBERS).map(
    ([userId, member]) => ({
      userId,
      identity: member.identity,
      mentionName: member.mentionName,
      aliases: member.aliases,
      role: member.role,
    }),
  );

  return `
你是「LINE 第五個家人」的 Reminder 2.0 操作解析器。

你不是一般聊天 AI。
你只負責判斷使用者是否正在管理 Reminder，並輸出 JSON。

【目前台灣時間】
${currentTime}

【家庭成員】
${JSON.stringify(members, null, 2)}

【使用者訊息】
${message}

【action】
create = 建立提醒
list = 查詢提醒
cancel = 取消提醒
update = 修改提醒
none = 不是 Reminder 操作

【CREATE：多筆提醒】
同一則訊息可以包含多道 Reminder。
每一道都獨立解析時間、內容、對象。

例如：
「下午三點提醒辰看牙醫，一小時後提醒我上廁所，晚上七點提醒辰倒垃圾」
應輸出：
{
  "action":"create",
  "reminders":[
    {"remindAt":"...","content":"看牙醫","targets":["USER_ID_OF_CHEN"]},
    {"remindAt":"...","content":"上廁所","targets":["self"]},
    {"remindAt":"...","content":"倒垃圾","targets":["USER_ID_OF_CHEN"]}
  ]
}

【CREATE：多個對象】
「提醒我跟辰看牙醫」表示同一筆 Reminder 有兩個對象：
"targets":["self","辰的userId"]

「提醒大家」／「提醒所有人」／「提醒全家人」／「提醒全員」：
"targets":["all"]

只說「提醒我」：targets = ["self"]
只說指定成員：targets = [該成員 userId]

「我跟辰」、「我和辰」、「我、辰」都表示多個對象。

【LIST】
可以查：
「我有哪些提醒」→ queryScope=self
「大家有哪些提醒」→ queryScope=group
「全部提醒」→ queryScope=group

時間範圍：
「今天」→ queryPeriod=today
「明天」→ queryPeriod=tomorrow
「這週」→ queryPeriod=week
「這個月」→ queryPeriod=month
沒有指定時間範圍 → queryPeriod=all

【CANCEL】
可以取消：
「取消下午三點的提醒」
「取消第4個」
「幫我把4取消」

多筆取消可以直接指定多個編號，例如：
「1 2取消」／「1.2取消」／「1、2取消」。

不要把「全部取消」當成特殊的一次完成操作；若使用者要撤掉多筆，先列出候選並由使用者指定編號。

【UPDATE】
可以修改時間、內容、對象：
「把下午三點的提醒改成四點」
「把第4個改成10點」
「幫我把4改成10點」
「把喝水改成吃藥」

如果修改時間，輸出 updateRemindAt。
如果修改內容，輸出 updateContent。

【時間】
所有時間使用台灣 UTC+08:00。
「兩分鐘後」依目前時間計算。
「一小時後」依目前時間計算。
「今天下午三點」= 今天15:00。
「明天下午三點」= 明天15:00。
「後天晚上八點」= 後天20:00。
「下週一晚上八點」= 下一個星期一20:00。
「8月25日晚上八點」= 實際日期20:00。

【內容】
只留下真正要提醒的事情。
「下午三點提醒辰看牙醫」→ content=「看牙醫」
不要把「提醒我」、「下午三點」放進 content。

【重要】
1. create 若有多筆，全部放進 reminders 陣列。
2. 每筆都必須有明確時間與內容，否則該筆不要建立。
3. 不要自行猜家庭成員。
4. 指定成員時使用 userId。
5. 無法確認是否為 Reminder 操作 → action=none。
6. 只輸出 JSON，不要 Markdown，不要解釋。

JSON 範例：
{
  "action":"create",
  "reminders":[
    {
      "remindAt":"2026-08-18T15:00:00+08:00",
      "content":"看牙醫",
      "targets":["USER_ID"]
    },
    {
      "remindAt":"2026-08-18T16:00:00+08:00",
      "content":"上廁所",
      "targets":["self"]
    }
  ],
  "target":"self",
  "updateTarget":null
}
`.trim();
}

/* =========================================================
 * 台北目前時間
 * ========================================================= */

function getTaipeiCurrentTime(): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

function getTaipeiDatePartsForReminder(date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string): number =>
    Number(
      parts.find((part) => part.type === type)?.value,
    );

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
  };
}

function buildTaipeiReminderIso(
  hour: number,
  minute: number,
  dayOffset: number,
): string {
  const today = getTaipeiDatePartsForReminder();
  const utcMillis =
    Date.UTC(
      today.year,
      today.month - 1,
      today.day + dayOffset,
      hour,
      minute,
    ) -
    8 * 60 * 60 * 1000;

  return new Date(utcMillis).toISOString();
}

function extractExplicitReminderTime(
  message: string,
): string | undefined {
  const text = message.trim();

  let dayOffset = 0;

  if (text.includes('後天')) {
    dayOffset = 2;
  } else if (text.includes('明天')) {
    dayOffset = 1;
  }

  const colonMatch = text.match(
    /(?:上午|早上|下午|晚上|凌晨)?\s*(\d{1,2})[:：](\d{2})/,
  );

  let hour: number;
  let minute: number;

  if (colonMatch) {
    hour = Number(colonMatch[1]);
    minute = Number(colonMatch[2]);

    const prefixMatch = text.match(
      /(上午|早上|下午|晚上|凌晨)\s*\d{1,2}[:：]\d{2}/,
    );

    const prefix = prefixMatch?.[1];

    if (prefix === '下午' || prefix === '晚上') {
      if (hour < 12) hour += 12;
    } else if (prefix === '凌晨' && hour === 12) {
      hour = 0;
    }
  } else {
    const pointMatch = text.match(
      /(上午|早上|下午|晚上|凌晨)?\s*(\d{1,2})\s*點(?:[：:]?\s*(\d{1,2})\s*分?)?/,
    );

    if (!pointMatch) return undefined;

    hour = Number(pointMatch[2]);
    minute = pointMatch[3]
      ? Number(pointMatch[3])
      : 0;

    const prefix = pointMatch[1];

    if (prefix === '下午' || prefix === '晚上') {
      if (hour < 12) hour += 12;
    } else if (prefix === '凌晨' && hour === 12) {
      hour = 0;
    } else if (
      !prefix &&
      hour >= 1 &&
      hour <= 7 &&
      /晚上|晚間/.test(text)
    ) {
      hour += 12;
    }
  }

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }

  return buildTaipeiReminderIso(
    hour,
    minute,
    dayOffset,
  );
}

function hasRelativeReminderTime(text: string): boolean {
  return /(?:[一二三四五六七八九十百0-9]+\s*(?:分鐘|分|小時|個小時|秒鐘|秒)後|半小時後|半個小時後)/.test(
    text,
  );
}

function detectStrongReminderAction(
  text: string,
): ReminderAction | null {
  const normalized = text.trim();

  if (
    containsCancelIntent(normalized)
  ) {
    return 'cancel';
  }

  if (
    containsUpdateIntent(normalized)
  ) {
    return 'update';
  }

  if (
    normalized.includes('有哪些提醒') ||
    normalized.includes('我的提醒') ||
    normalized.includes('提醒呢') ||
    normalized.includes('給我所有提醒') ||
    normalized.includes('所有提醒') ||
    normalized.includes('全部提醒')
  ) {
    return 'list';
  }

  /*
   * 只在同時出現「提醒」與明確時間時，
   * 強制視為建立。
   */
  if (
    normalized.includes('提醒') &&
    (
      Boolean(extractExplicitReminderTime(normalized)) ||
      hasRelativeReminderTime(normalized)
    )
  ) {
    return 'create';
  }

  return null;
}

function hasExplicitCandidateSelector(
  text: string,
): boolean {
  const withoutTimes = text
    .replace(/\d{1,2}[:：]\d{2}/g, ' ')
    .replace(
      /(?:上午|早上|下午|晚上|凌晨)?\s*\d{1,2}\s*點(?:\s*\d{1,2}\s*分?)?/g,
      ' ',
    );

  return (
    /第\s*(?:10|[1-9]|[一二三四五六七八九十])(?:個|項|筆)?/.test(
      withoutTimes,
    ) ||
    /(?:^|[^0-9])(?:10|[1-9])(?:$|[^0-9])/.test(
      withoutTimes,
    ) ||
    /(?:第一|第二|第三|第四|第五|第六|第七|第八|第九|第十)(?:個|項|筆)?/.test(
      withoutTimes,
    ) ||
    /(?:[一二三四五六七八九十])(?:個|項|筆)/.test(
      withoutTimes,
    )
  );
}

function applyReminderNaturalLanguageHints(
  parsed: ReminderParseResult,
  message: string,
): ReminderParseResult {
  const text = message.trim();
  const explicitTime =
    extractExplicitReminderTime(text);

  let queryPeriod = parsed.queryPeriod || 'all';

  if (text.includes('明天')) {
    queryPeriod = 'tomorrow';
  } else if (text.includes('今天')) {
    queryPeriod = 'today';
  } else if (
    text.includes('這週') ||
    text.includes('本週') ||
    text.includes('這星期') ||
    text.includes('本星期')
  ) {
    queryPeriod = 'week';
  } else if (
    text.includes('這個月') ||
    text.includes('本月')
  ) {
    queryPeriod = 'month';
  }

  let action = parsed.action;

  /*
   * 對幾種非常明確的自然語言操作，
   * 不讓 Gemini 的偶發誤判覆蓋真正意圖。
   *
   * 例如：
   * 「提醒辰19:00倒垃圾」一定是 create，
   * 不應因為上一輪 Pending 中剛好有「倒垃圾」
   * 就被當成取消舊 Reminder。
   */
  const strongAction =
    detectStrongReminderAction(text);

  if (strongAction) {
    action = strongAction;
  } else if (
    action === 'none' &&
    containsCancelIntent(text)
  ) {
    action = 'cancel';
  } else if (
    action === 'none' &&
    containsUpdateIntent(text)
  ) {
    action = 'update';
  } else if (
    action === 'none' &&
    (
      text.includes('有哪些提醒') ||
      text.includes('我的提醒') ||
      text.includes('提醒呢') ||
      text.includes('給我所有提醒') ||
      text.includes('所有提醒') ||
      text.includes('全部提醒')
    )
  ) {
    action = 'list';
  }

  const hasNumberSelector =
    /(?:第\s*)?(?:10|[1-9])(?:個|項|筆)?/.test(
      text.replace(/\d{1,2}[:：]\d{2}/g, ''),
    );

  const contentProbe = text
    .replace(/取消|撤掉|撤銷|不要|提醒|提示|幫我|幫忙|請|的|那個|那道|全部|所有|都/g, '')
    .replace(/今天|明天|後天|這週|本週|這星期|本星期|這個月|本月/g, '')
    .replace(/\d{1,2}[:：]\d{2}/g, '')
    .replace(/(?:上午|早上|下午|晚上|凌晨)?\s*\d{1,2}\s*點(?:\s*\d{1,2}\s*分?)?/g, '')
    .replace(/[第個項筆一二三四五六七八九十0-9]/g, '')
    .trim();

  const hasContentSelector =
    /[\u4e00-\u9fffA-Za-z]/.test(contentProbe);

  return {
    ...parsed,
    action,
    remindAt:
      explicitTime || parsed.remindAt,
    queryPeriod,
  };
}

/* =========================================================
 * Parser
 * ========================================================= */

async function parseReminderWithTimeout(
  message: string,
  gemini: GoogleGenAI,
): Promise<ReminderParseResult> {
  const timeoutMs = 20_000;

  return Promise.race([
    parseReminder(
      message,
      gemini,
    ),
    new Promise<ReminderParseResult>(
      (_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                'Reminder 解析逾時',
              ),
            ),
          timeoutMs,
        );
      },
    ),
  ]);
}

async function parseReminder(
  message: string,
  gemini: GoogleGenAI,
): Promise<ReminderParseResult> {
  const response = await gemini.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: buildReminderPrompt(
      message,
      getTaipeiCurrentTime(),
    ),
    config: { temperature: 0 },
  });

  const text = response.text?.trim();
  if (!text) {
    return { action: 'none', target: null, updateTarget: null };
  }

  try {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned) as Partial<ReminderParseResult>;
    const action = parsed.action;

    if (
      action !== 'create' &&
      action !== 'list' &&
      action !== 'cancel' &&
      action !== 'update'
    ) {
      return { action: 'none', target: null, updateTarget: null };
    }

    const normalizeTarget = (
      value: unknown,
    ): 'self' | 'all' | string | null => {
      if (
        value === 'self' ||
        value === 'all' ||
        typeof value === 'string'
      ) {
        return value;
      }
      return null;
    };

    const normalizedItems: ParsedCreateItem[] = Array.isArray(
      parsed.reminders,
    )
      ? parsed.reminders.map((item) => ({
          remindAt:
            typeof item.remindAt === 'string'
              ? item.remindAt.trim()
              : undefined,
          remindAtEnd:
            typeof item.remindAtEnd === 'string'
              ? item.remindAtEnd.trim()
              : undefined,
          content:
            typeof item.content === 'string'
              ? item.content.trim()
              : undefined,
          targets:
            Array.isArray(item.targets)
              ? item.targets.filter(
                  (target): target is 'self' | 'all' | string =>
                    target === 'self' ||
                    target === 'all' ||
                    typeof target === 'string',
                )
              : undefined,
        }))
      : [];

    const result: ReminderParseResult = {
      action,
      remindAt:
        typeof parsed.remindAt === 'string'
          ? parsed.remindAt.trim()
          : undefined,
      remindAtEnd:
        typeof parsed.remindAtEnd === 'string'
          ? parsed.remindAtEnd.trim()
          : undefined,
      content:
        typeof parsed.content === 'string'
          ? parsed.content.trim()
          : undefined,
      target: normalizeTarget(parsed.target),
      targets:
        Array.isArray(parsed.targets)
          ? parsed.targets.filter(
              (target): target is 'self' | 'all' | string =>
                target === 'self' ||
                target === 'all' ||
                typeof target === 'string',
            )
          : undefined,
      reminders:
        normalizedItems.length
          ? normalizedItems
          : undefined,
      queryScope:
        parsed.queryScope === 'group'
          ? 'group'
          : 'self',
      queryPeriod:
        parsed.queryPeriod === 'today' ||
        parsed.queryPeriod === 'tomorrow' ||
        parsed.queryPeriod === 'week' ||
        parsed.queryPeriod === 'month'
          ? parsed.queryPeriod
          : 'all',
      updateRemindAt:
        typeof parsed.updateRemindAt === 'string'
          ? parsed.updateRemindAt.trim()
          : undefined,
      updateContent:
        typeof parsed.updateContent === 'string'
          ? parsed.updateContent.trim()
          : undefined,
      updateTarget:
        normalizeTarget(parsed.updateTarget),
    };

    return applyReminderNaturalLanguageHints(
      result,
      message,
    );
  } catch (error) {
    console.error(
      '[Reminder Handler] Reminder JSON 解析失敗:',
      error,
    );

    return {
      action: 'none',
      target: null,
      updateTarget: null,
    };
  }
}

/* =========================================================
 * Reminder ID
 * ========================================================= */

function createReminderId(): string {
  return `reminder-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/* =========================================================
 * Target
 * ========================================================= */

function resolveOneTarget(
  target:
    | 'self'
    | 'all'
    | string
    | null
    | undefined,
  createdByUserId: string,
): ReminderTarget | null {
  if (target === 'all') {
    return { type: 'all' };
  }

  if (target === 'self' || !target) {
    if (!createdByUserId) return null;
    return {
      type: 'user',
      userId: createdByUserId,
    };
  }

  if (!FAMILY_MEMBERS[target]) return null;

  return {
    type: 'user',
    userId: target,
  };
}

function resolveTargets(
  targets: Array<'self' | 'all' | string> | undefined,
  fallbackTarget: 'self' | 'all' | string | null | undefined,
  createdByUserId: string,
): ReminderTargets | null {
  const raw =
    targets && targets.length
      ? targets
      : [fallbackTarget || 'self'];

  if (raw.includes('all')) {
    return [{ type: 'all' }];
  }

  const resolved: ReminderTargets = [];

  for (const target of raw) {
    const item = resolveOneTarget(
      target,
      createdByUserId,
    );

    if (!item) return null;

    if (
      !resolved.some(
        (existing) =>
          existing.type === item.type &&
          existing.type === 'user' &&
          item.type === 'user' &&
          existing.userId === item.userId,
      )
    ) {
      resolved.push(item);
    }
  }

  return resolved.length ? resolved : null;
}

function legacyTarget(
  targets: ReminderTargets,
): ReminderTarget {
  return targets[0] || { type: 'all' };
}

function targetKey(targets: ReminderTargets): string {
  return targets
    .map((target) =>
      target.type === 'all'
        ? 'all'
        : `user:${target.userId}`,
    )
    .sort()
    .join('|');
}

function reminderTargets(reminder: Reminder): ReminderTargets {
  const current =
    (reminder as Reminder & {
      targets?: ReminderTargets;
    }).targets;

  if (Array.isArray(current) && current.length) {
    return current;
  }

  const legacy =
    (reminder as Reminder & {
      target?: ReminderTarget;
    }).target;

  if (legacy) return [legacy];

  return [];
}

function targetContainsUser(
  reminder: Reminder,
  userId: string,
): boolean {
  const targets = reminderTargets(reminder);
  return targets.some(
    (target) =>
      target.type === 'all' ||
      (target.type === 'user' &&
        target.userId === userId),
  );
}

function formatTargetList(
  reminder: Reminder,
): string {
  const targets = reminderTargets(reminder);

  if (!targets.length) return '未指定';

  if (targets.some((target) => target.type === 'all')) {
    return '全家人';
  }

  return targets
    .map((target) => {
      if (target.type !== 'user') return '全家人';
      return (
        FAMILY_MEMBERS[target.userId]?.identity ||
        '指定成員'
      );
    })
    .join('、');
}

/* =========================================================
 * 時間格式
 * ========================================================= */

function getCreateMentionInfo(
  reminders: Reminder[],
  createdByUserId: string,
): {
  mentionUserIds: string[];
  mentionAll: boolean;
} {
  const userIds = new Set<string>();
  let mentionAll = false;

  for (const reminder of reminders) {
    for (const target of reminderTargets(reminder)) {
      if (target.type === 'all') {
        mentionAll = true;
        continue;
      }

      if (
        target.type === 'user' &&
        target.userId !== createdByUserId
      ) {
        userIds.add(target.userId);
      }
    }
  }

  return {
    mentionUserIds: [...userIds],
    mentionAll,
  };
}

function formatReminderTime(remindAt: string): string {
  const date = new Date(remindAt);
  if (Number.isNaN(date.getTime())) return remindAt;

  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/* =========================================================
 * 查詢日期範圍
 * ========================================================= */

function taipeiDateParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
  };
}

function taipeiLocalDateToUtc(
  year: number,
  month: number,
  day: number,
): number {
  return Date.UTC(year, month - 1, day) -
    8 * 60 * 60 * 1000;
}

function getQueryRange(
  period: QueryPeriod,
): { start: number; end: number } | null {
  if (period === 'all') return null;

  const today = taipeiDateParts();
  const startToday = taipeiLocalDateToUtc(
    today.year,
    today.month,
    today.day,
  );

  if (period === 'today') {
    return {
      start: startToday,
      end: startToday + 24 * 60 * 60 * 1000,
    };
  }

  if (period === 'tomorrow') {
    return {
      start: startToday + 24 * 60 * 60 * 1000,
      end: startToday + 2 * 24 * 60 * 60 * 1000,
    };
  }

  if (period === 'month') {
    const nextMonth =
      today.month === 12
        ? { year: today.year + 1, month: 1 }
        : { year: today.year, month: today.month + 1 };

    return {
      start: startToday -
        (today.day - 1) * 24 * 60 * 60 * 1000,
      end: taipeiLocalDateToUtc(
        nextMonth.year,
        nextMonth.month,
        1,
      ),
    };
  }

  const currentDate = new Date(startToday);
  const weekday = currentDate.getUTCDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  const start =
    startToday - mondayOffset * 24 * 60 * 60 * 1000;

  return {
    start,
    end: start + 7 * 24 * 60 * 60 * 1000,
  };
}

/* =========================================================
 * 取得有效 Reminder
 * ========================================================= */

function getActiveReminders(
  groupId: string,
): Reminder[] {
  return loadReminders().filter(
    (reminder) =>
      reminder.groupId === groupId &&
      !reminder.completed &&
      !Boolean(
        (reminder as Reminder & {
          cancelled?: boolean;
        }).cancelled,
      ),
  );
}

/* =========================================================
 * 查詢
 * ========================================================= */

function getQueryReminders(
  groupId: string,
  userId: string,
  scope: 'self' | 'group',
  period: QueryPeriod,
): Reminder[] {
  let reminders = getActiveReminders(groupId);

  if (scope === 'self') {
    reminders = reminders.filter(
      (reminder) =>
        reminder.createdByUserId === userId ||
        targetContainsUser(reminder, userId),
    );
  }

  const range = getQueryRange(period);
  if (range) {
    reminders = reminders.filter((reminder) => {
      const time = new Date(reminder.remindAt).getTime();
      return (
        !Number.isNaN(time) &&
        time >= range.start &&
        time < range.end
      );
    });
  }

  return reminders.sort(
    (a, b) =>
      new Date(a.remindAt).getTime() -
      new Date(b.remindAt).getTime(),
  );
}

/* =========================================================
 * 候選過濾
 * ========================================================= */

function filterCandidates(
  reminders: Reminder[],
  parsed: ReminderParseResult,
): Reminder[] {
  return reminders.filter((reminder) => {
    if (parsed.content) {
      if (
        !reminder.content
          .toLowerCase()
          .includes(parsed.content.toLowerCase())
      ) {
        return false;
      }
    }

    if (parsed.remindAt) {
      const targetTime =
        new Date(parsed.remindAt).getTime();
      const reminderTime =
        new Date(reminder.remindAt).getTime();

      if (
        !Number.isNaN(targetTime) &&
        !Number.isNaN(reminderTime) &&
        Math.abs(reminderTime - targetTime) >
          60 * 1000
      ) {
        return false;
      }
    }

    if (
      parsed.target &&
      parsed.target !== 'self' &&
      parsed.target !== 'all'
    ) {
      if (!targetContainsUser(reminder, parsed.target)) {
        return false;
      }
    }

    if (parsed.target === 'all') {
      if (
        !reminderTargets(reminder).some(
          (target) => target.type === 'all',
        )
      ) {
        return false;
      }
    }

    return true;
  });
}

/* =========================================================
 * 重複偵測
 * ========================================================= */

function findDuplicateReminder(
  groupId: string,
  createdByUserId: string,
  content: string,
  remindAt: string,
  targets: ReminderTargets,
): Reminder | null {
  const targetTime = new Date(remindAt).getTime();
  if (Number.isNaN(targetTime)) return null;

  const wantedTargets = targetKey(targets);

  return (
    getActiveReminders(groupId).find((reminder) => {
      if (reminder.createdByUserId !== createdByUserId) {
        return false;
      }

      const reminderTime =
        new Date(reminder.remindAt).getTime();

      if (Number.isNaN(reminderTime)) return false;

      if (
        Math.abs(reminderTime - targetTime) >
        60 * 1000
      ) {
        return false;
      }

      if (
        reminder.content.trim().toLowerCase() !==
        content.trim().toLowerCase()
      ) {
        return false;
      }

      return (
        targetKey(reminderTargets(reminder)) ===
        wantedTargets
      );
    }) || null
  );
}

/* =========================================================
 * 建立單筆 Reminder
 * ========================================================= */

function createOneReminder(
  item: ParsedCreateItem,
  fallbackTarget: 'self' | 'all' | string | null,
  createdByUserId: string,
  groupId: string,
): { reminder?: Reminder; duplicate?: boolean; error?: string } {
  if (!item.remindAt || !item.content) {
    return {
      error: '缺少提醒時間或提醒內容',
    };
  }

  const remindTime = new Date(item.remindAt).getTime();
  if (Number.isNaN(remindTime)) {
    return { error: '提醒時間無法解析' };
  }

  if (remindTime <= Date.now()) {
    return { error: '提醒時間已經過去' };
  }

  const targets = resolveTargets(
    item.targets,
    fallbackTarget,
    createdByUserId,
  );

  if (!targets) {
    return { error: '無法確認提醒對象' };
  }

  const duplicate = findDuplicateReminder(
    groupId,
    createdByUserId,
    item.content,
    item.remindAt,
    targets,
  );

  if (duplicate) {
    return {
      reminder: duplicate,
      duplicate: true,
    };
  }

  const reminder = createReminder({
    id: createReminderId(),
    groupId,
    createdByUserId,
    content: item.content,
    remindAt: item.remindAt,
    target: legacyTarget(targets),
    targets,
    completed: false,
    cancelled: false,
  });

  return { reminder };
}

/* =========================================================
 * 建立 Reminder
 * ========================================================= */

async function handleCreate(
  parsed: ReminderParseResult,
  createdByUserId: string,
  groupId: string,
): Promise<ReminderHandlerResult> {
  const items =
    parsed.reminders?.length
      ? parsed.reminders
      : [
          {
            remindAt: parsed.remindAt,
            remindAtEnd: parsed.remindAtEnd,
            content: parsed.content,
            targets: parsed.targets,
          },
        ];

  const created: Reminder[] = [];
  const duplicates: Reminder[] = [];
  const errors: string[] = [];

  for (const item of items) {
    const result = createOneReminder(
      item,
      parsed.target,
      createdByUserId,
      groupId,
    );

    if (result.error) {
      errors.push(result.error);
      continue;
    }

    if (!result.reminder) continue;

    if (result.duplicate) {
      duplicates.push(result.reminder);
      continue;
    }

    created.push(result.reminder);
  }

  /*
   * createOneReminder 以「回傳既有 Reminder」表示重複。
   * 若整批中只有重複，要求使用者確認是否再建立。
   */
  if (duplicates.length) {
    const conversationKey =
      `${groupId}:${createdByUserId}`;

    setPendingReminderState({
      conversationKey,
      userId: createdByUserId,
      groupId,
      action: 'duplicate',
      candidateReminderIds:
        duplicates.map((reminder) => reminder.id),
      requiresConfirmation: true,
      confirmationRequired: true,
    });

    let message =
      duplicates.length === 1
        ? `主上，奴才好像已經收到一道${formatReminderTime(duplicates[0].remindAt)}的「${duplicates[0].content}」旨意了，這次還要再提醒一次嗎？`
        : `主上，奴才發現有 ${duplicates.length} 道可能重複的旨意：\n`;

    if (duplicates.length > 1) {
      message += duplicates
        .map(
          (reminder, index) =>
            `${index + 1}. ${formatReminderTime(reminder.remindAt)}｜${reminder.content}｜${formatTargetList(reminder)}`,
        )
        .join('\n');
      message += '\n要再建立這些提醒嗎？';
    }

    if (created.length) {
      message =
        `喳，其他 ${created.length} 道提醒已先記下。\n${message}`;
    }

    return {
      handled: true,
      action: 'duplicate-confirmation',
      created: created.length > 0,
      reminders: created,
      candidates: duplicates,
      message,
    };
  }

  if (!created.length) {
    return {
      handled: true,
      action: 'create',
      created: false,
      message:
        errors.length
          ? `主上，奴才沒有成功建立提醒：${errors[0]}。`
          : '主上，奴才還缺少提醒時間或提醒內容。',
    };
  }

  const first = created[0];
  const message =
    created.length === 1
      ? `已記下。奴才會在約 ${formatReminderTime(first.remindAt)} 提醒您：${first.content}`
      : `喳，已替主上記下 ${created.length} 道提醒：\n${created
          .map(
            (reminder, index) =>
              `${index + 1}. ${formatReminderTime(reminder.remindAt)}｜${reminder.content}｜${formatTargetList(reminder)}`,
          )
          .join('\n')}`;

  const mentionInfo =
    getCreateMentionInfo(
      created,
      createdByUserId,
    );

  return {
    handled: true,
    action: 'create',
    created: true,
    reminderId: first.id,
    remindAt: first.remindAt,
    content: first.content,
    target: first.target,
    reminders: created,
    message,
    mentionUserIds:
      mentionInfo.mentionUserIds,
    mentionAll:
      mentionInfo.mentionAll,
  };
}

/* =========================================================
 * 建立重複 Reminder
 * ========================================================= */

function createDuplicateAfterConfirmation(
  candidate: Reminder,
  createdByUserId: string,
  groupId: string,
): ReminderHandlerResult {
  const targets = reminderTargets(candidate);

  const reminder = createReminder({
    id: createReminderId(),
    groupId,
    createdByUserId,
    content: candidate.content,
    remindAt: candidate.remindAt,
    target: legacyTarget(targets),
    targets,
    completed: false,
    cancelled: false,
  });

  return {
    handled: true,
    action: 'create',
    created: true,
    reminderId: reminder.id,
    remindAt: reminder.remindAt,
    content: reminder.content,
    target: reminder.target,
    reminders: [reminder],
    message:
      `喳，已再替主上添下一道相同的提醒：${formatReminderTime(reminder.remindAt)}｜${reminder.content}。`,
    mentionUserIds:
      getCreateMentionInfo(
        [reminder],
        createdByUserId,
      ).mentionUserIds,
    mentionAll:
      getCreateMentionInfo(
        [reminder],
        createdByUserId,
      ).mentionAll,
  };
}

/* =========================================================
 * 確認詞
 * ========================================================= */

function normalizeConfirmationText(
  text: string,
): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[，。！？、,.!?]/g, '')
    .replace(/\s+/g, '');
}

function isYes(text: string): boolean {
  const normalized =
    normalizeConfirmationText(
      text,
    );

  return new Set([
    '是',
    '好',
    '可以',
    '要',
    '要啊',
    '再提醒',
    '再一次',
    '對',
    '嗯',
    '嗯嗯',
    '好啊',
    '可以啊',
    '確定',
    '同意',
    'yes',
    'y',
  ]).has(normalized);
}

function isNo(text: string): boolean {
  const normalized =
    normalizeConfirmationText(
      text,
    );

  return new Set([
    '不用',
    '不要',
    '取消',
    '算了',
    '不用了',
    '不用提醒',
    '不需要',
    '否',
    'no',
    'n',
  ]).has(normalized);
}

/* =========================================================
 * 候選選擇
 * ========================================================= */

function extractCandidateIndices(
  text: string,
  candidates: Reminder[],
  options: {
    matchByTime?: boolean;
    strictNumericSelectors?: boolean;
  } = {},
): number[] {
  const normalized = text.trim();
  const indices = new Set<number>();

  const numberMap: Record<string, number> = {
    '第一個': 0, '第一': 0, '1': 0, '一': 0,
    '第二個': 1, '第二': 1, '2': 1, '二': 1,
    '第三個': 2, '第三': 2, '3': 2, '三': 2,
    '第四個': 3, '第四': 3, '4': 3, '四': 3,
    '第五個': 4, '第五': 4, '5': 4, '五': 4,
    '第六個': 5, '第六': 5, '6': 5, '六': 5,
    '第七個': 6, '第七': 6, '7': 6, '七': 6,
    '第八個': 7, '第八': 7, '8': 7, '八': 7,
    '第九個': 8, '第九': 8, '9': 8, '九': 8,
    '第十個': 9, '第十': 9, '10': 9, '十': 9,
  };

  for (const [word, index] of Object.entries(numberMap)) {
    /*
     * 混合操作的 selector 可能包含時間，例如：
     * 「17:30，2」
     *
     * 嚴格模式下不能用 includes('1') / includes('7')
     * 這種方式從時間數字誤判候選；真正的編號會在
     * remove-times 後由下面的 arabicMatches 處理。
     */
    const isBareNumericSelector =
      /^(?:10|[1-9])$/.test(word);

    if (
      options.strictNumericSelectors &&
      isBareNumericSelector
    ) {
      continue;
    }

    if (
      normalized.includes(word) &&
      index < candidates.length
    ) {
      indices.add(index);
    }
  }

  const withoutTimes = normalized
    .replace(/\d{1,2}[:：]\d{2}/g, ' ')
    .replace(/(?:上午|早上|下午|晚上|凌晨)?\s*\d{1,2}\s*點(?:\s*\d{1,2}\s*分?)?/g, ' ');

  const arabicMatches = withoutTimes.match(/(?<!\d)(10|[1-9])(?!\d)/g) || [];

  for (const value of arabicMatches) {
    const number = Number(value);
    if (number >= 1 && number <= candidates.length) {
      indices.add(number - 1);
    }
  }

  /* 「取消56」代表第 5、6 個；10 則保留為第 10 個。 */
  const compactMatch = withoutTimes.match(/(?<!\d)([1-9][1-9])(?!\d)/);
  if (compactMatch) {
    const digits = compactMatch[1];
    if (digits !== '10') {
      for (const digit of digits) {
        const number = Number(digit);
        if (
          number >= 1 &&
          number <= candidates.length
        ) {
          indices.add(number - 1);
        }
      }
    }
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (
      candidate &&
      candidate.content &&
      normalized.includes(candidate.content)
    ) {
      indices.add(index);
    }
  }

  /*
   * 一般自然語言查詢可以用「時間」反查候選。
   *
   * 但混合編號操作不能使用這個 fallback。
   *
   * 例如：
   *   「1改17:30，2取消」
   *
   * 第二個操作的 selectorText 是：
   *   「17:30，2」
   *
   * 如果這裡用時間反查，17:30 會把原本 17:00 的第 1 道
   * 也加入候選，最後就會變成：
   *
   *   update -> 1
   *   cancel -> 1、2
   *
   * 這正是「同一道提醒不能同時修改又取消」誤判的來源。
   *
   * 因此只有明確允許時才進行時間匹配。
   */
  if (options.matchByTime !== false) {
    const explicitTime =
      extractExplicitReminderTime(normalized);

    if (explicitTime) {
      const targetTime = new Date(explicitTime).getTime();
      if (!Number.isNaN(targetTime)) {
        for (let index = 0; index < candidates.length; index += 1) {
          const reminderTime =
            new Date(candidates[index].remindAt).getTime();
          if (
            !Number.isNaN(reminderTime) &&
            Math.abs(reminderTime - targetTime) <= 60 * 1000
          ) {
            indices.add(index);
          }
        }
      }
    }
  }

  return [...indices].sort((a, b) => a - b);
}

function resolveCandidateIndex(
  text: string,
  candidates: Reminder[],
): number {
  return extractCandidateIndices(
    text,
    candidates,
  )[0] ?? -1;
}

function containsUpdateIntent(text: string): boolean {
  return [
    '改',
    '改成',
    '改為',
    '修改',
    '改一下',
    '換成',
    '變成',
  ].some((word) => text.includes(word));
}

function containsCancelIntent(text: string): boolean {
  return [
    '取消',
    '撤掉',
    '撤銷',
    '不要',
  ].some((word) => text.includes(word));
}

/* =========================================================
 * Pending 權限
 * ========================================================= */

function canManageReminder(
  reminder: Reminder,
  userId: string,
): boolean {
  return (
    reminder.createdByUserId === userId ||
    targetContainsUser(reminder, userId)
  );
}

function authorizedUsers(
  reminder: Reminder,
): string[] {
  const users = new Set<string>([
    reminder.createdByUserId,
  ]);

  /*
   * 「提醒大家」代表每一位家庭成員都是被提醒者，
   * 因此也都具有取消／確認權。
   */
  const targets = reminderTargets(reminder);

  if (
    targets.some(
      (target) => target.type === 'all',
    )
  ) {
    for (const userId of Object.keys(FAMILY_MEMBERS)) {
      users.add(userId);
    }
  }

  for (const target of targets) {
    if (
      target.type === 'user' &&
      target.userId
    ) {
      users.add(target.userId);
    }
  }

  return [...users];
}

function getCommonAuthorizedUsers(
  candidates: Reminder[],
): string[] {
  if (!candidates.length) {
    return [];
  }

  let common = new Set(
    authorizedUsers(candidates[0]),
  );

  for (let index = 1; index < candidates.length; index += 1) {
    const current =
      new Set(
        authorizedUsers(candidates[index]),
      );

    common = new Set(
      [...common].filter(
        (userId) =>
          current.has(userId),
      ),
    );
  }

  return [...common];
}

function authorizationText(
  candidates: Reminder[],
): string {
  const userIds =
    getCommonAuthorizedUsers(
      candidates,
    );

  const names = userIds.map(
    (userId) =>
      FAMILY_MEMBERS[userId]?.identity ||
      '指定成員',
  );

  return names.join('、');
}

function setAuthorizationPendingStates(
  candidates: Reminder[],
  groupId: string,
  action: 'cancel' | 'update',
  originalRequest?: string,
): string[] {
  const userIds =
    getCommonAuthorizedUsers(
      candidates,
    );

  for (const userId of userIds) {
    setPendingReminderState({
      conversationKey: `${groupId}:${userId}`,
      userId,
      groupId,
      action,
      candidateReminderIds: candidates.map(
        (reminder) => reminder.id,
      ),
      requiresConfirmation: true,
      confirmationRequired: true,
    });
  }

  return userIds;
}

function clearAuthorizationPendingStates(
  groupId: string,
  userIds: string[],
): void {
  for (const userId of userIds) {
    clearPendingReminderState(
      `${groupId}:${userId}`,
    );
  }
}

/* =========================================================
 * 操作結果輔助
 * ========================================================= */

function cancelReminderCandidates(
  candidates: Reminder[],
): {
  count: number;
  cancelled: Reminder[];
} {
  const cancelled: Reminder[] = [];

  for (const reminder of candidates) {
    if (cancelReminder(reminder.id)) {
      cancelled.push(reminder);
    }
  }

  return {
    count: cancelled.length,
    cancelled,
  };
}

function buildCancelResult(
  candidates: Reminder[],
): ReminderHandlerResult {
  const result = cancelReminderCandidates(candidates);

  const cancelled = result.cancelled;

  return {
    handled: true,
    action: 'cancel',
    cancelled: result.count === candidates.length,
    candidates,
    message:
      candidates.length === 1
        ? result.count === 1
          ? `喳，${formatReminderTime(candidates[0].remindAt)} 的「${candidates[0].content}」提醒已撤下。`
          : '主上，奴才這次沒有成功撤下這道提醒。'
        : result.count === candidates.length
          ? `喳，已替主上撤下 ${result.count} 道提醒：\n${cancelled
              .map(
                (reminder) =>
                  `・${formatReminderTime(reminder.remindAt)}｜${reminder.content}`,
              )
              .join('\n')}`
          : result.count > 0
            ? `喳，實際撤下 ${result.count} 道提醒：\n${cancelled
                .map(
                  (reminder) =>
                    `・${formatReminderTime(reminder.remindAt)}｜${reminder.content}`,
                )
                .join('\n')}\n其餘 ${candidates.length - result.count} 道沒有撤下。`
            : '主上，奴才這次沒有成功撤下任何一道提醒。',
  };
}

/* =========================================================
 * 明確修改指令的本地解析
 * =========================================================
 *
 * 目的：
 *   「1改成23:30」
 *   「1改成吃藥」
 *   「1改成晚上10點吃藥」
 *   「1 2改成10點」
 *
 * 這類指令資訊已經足夠明確，不需要再交給 Gemini。
 * 只有本地解析無法確認修改內容時，呼叫端才 fallback 到 Gemini。
 */
function parseLocalExplicitUpdate(
  message: string,
): {
  remindAt?: string;
  content?: string;
} | null {
  const text = message.trim();

  const operationMatch = text.match(
    /(?:改成|改為|修改|改一下|換成|變成|改)/,
  );

  if (!operationMatch || operationMatch.index === undefined) {
    return null;
  }

  let remainder = text
    .slice(
      operationMatch.index + operationMatch[0].length,
    )
    .trim();

  if (!remainder) {
    return null;
  }

  const remindAt =
    extractExplicitReminderTime(remainder);

  if (remindAt) {
    remainder = remainder
      .replace(
        /(?:後天|明天|今天)?\s*(?:上午|早上|下午|晚上|凌晨)?\s*\d{1,2}[:：]\d{2}/,
        ' ',
      )
      .replace(
        /(?:後天|明天|今天)?\s*(?:上午|早上|下午|晚上|凌晨)?\s*\d{1,2}\s*點(?:[：:]?\s*\d{1,2}\s*分?)?/,
        ' ',
      )
      .replace(/^(?:今天|明天|後天)\s*/, '')
      .trim();
  }

  const content = remainder
    .replace(/^[，,、。；;:\s]+/, '')
    .replace(/[，,、。；;]+$/, '')
    .trim();

  if (!remindAt && !content) {
    return null;
  }

  return {
    remindAt,
    content: content || undefined,
  };
}

function buildLocalUpdateRequest(
  message: string,
): ReturnType<typeof buildUpdateRequest> | null {
  const local = parseLocalExplicitUpdate(message);

  if (!local) {
    return null;
  }

  return {
    remindAt: local.remindAt,
    content: local.content,
  };
}

function buildUpdateRequest(
  parsed: ReminderParseResult,
  message: string,
  createdByUserId: string,
): {
  remindAt?: string;
  content?: string;
  target?: ReminderTarget;
  targets?: ReminderTarget[];
} {
  const remindAt =
    parsed.updateRemindAt ||
    extractExplicitReminderTime(message) ||
    (parsed.action === 'update' ? parsed.remindAt : undefined);

  const newTarget = parsed.updateTarget
    ? (resolveOneTarget(
        parsed.updateTarget,
        createdByUserId,
      ) ?? undefined)
    : undefined;

  return {
    remindAt,
    content: parsed.updateContent,
    target: newTarget,
    targets: newTarget ? [newTarget] : undefined,
  };
}

function hasActualUpdateRequest(
  updates: ReturnType<typeof buildUpdateRequest>,
): boolean {
  return Boolean(
    updates.remindAt ||
    updates.content ||
    updates.target
  );
}

function applyReminderUpdate(
  reminder: Reminder,
  updates: ReturnType<typeof buildUpdateRequest>,
): Reminder | null {
  if (!hasActualUpdateRequest(updates)) {
    return null;
  }

  const updated = updateReminder(
    reminder.id,
    updates,
  );

  if (!updated) {
    return null;
  }

  if (
    updates.remindAt &&
    updated.remindAt !== updates.remindAt
  ) {
    return null;
  }

  if (
    updates.content &&
    updated.content !== updates.content
  ) {
    return null;
  }

  if (
    updates.target &&
    targetKey(reminderTargets(updated)) !==
      targetKey([updates.target])
  ) {
    return null;
  }

  return updated;
}

/* =========================================================
 * Pending Confirmation
 * ========================================================= */


interface MixedReminderOperation {
  action: 'cancel' | 'update';
  indices: number[];
  text: string;
}

/*
 * 從同一則訊息拆出「哪幾道做什麼」。
 *
 * 例如：
 *   「1改成10點，2取消」
 *   「1 2改成10點，3 4取消」
 *   「1改成10點 2改成11點」
 *
 * 每一段都只負責自己的編號，因此不會再把整句訊息的
 * update 時間錯套到另一道 Reminder。
 */
function operationWordIsUpdatePlaceholder(
  operationWord: string,
): boolean {
  return (
    operationWord === '改' ||
    operationWord === '改成' ||
    operationWord === '改為' ||
    operationWord === '修改' ||
    operationWord === '改一下' ||
    operationWord === '換成' ||
    operationWord === '變成'
  );
}

/*
 * 去掉 update operation 尾端屬於下一個 operation 的候選編號。
 *
 * 只處理「編號 + 分隔符 + 結尾」這種明確形式，
 * 不碰正常文字內容，避免把「吃藥2」這類合法內容誤刪。
 */
function stripTrailingCandidateSelector(
  operationText: string,
  candidates: Reminder[],
): string {
  let text = operationText.trim();

  if (!text || !candidates.length) {
    return text;
  }

  const maxIndex = Math.min(candidates.length, 10);

  /*
   * 「改成15:30，2」／「改成10點 2」
   * 「改成10點、2」
   */
  const trailing = text.match(
    /(?:[，,、；;。]|\s+)\s*(10|[1-9])\s*$/,
  );

  if (!trailing) {
    return text;
  }

  const number = Number(trailing[1]);

  if (number < 1 || number > maxIndex) {
    return text;
  }

  return text
    .slice(0, trailing.index)
    .trim();
}

function extractMixedReminderOperations(
  message: string,
  candidates: Reminder[],
): MixedReminderOperation[] {
  const operationPattern =
    /改成|改為|修改|改一下|換成|變成|改|取消|撤掉|撤銷|不要/g;

  const matches = [
    ...message.matchAll(operationPattern),
  ];

  if (!matches.length) {
    return [];
  }

  const operations: MixedReminderOperation[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const currentStart =
      current.index ?? 0;

    const previousEnd =
      index === 0
        ? 0
        : (
            (matches[index - 1].index ?? 0) +
            matches[index - 1][0].length
          );

    const nextStart =
      index + 1 < matches.length
        ? (matches[index + 1].index ?? message.length)
        : message.length;

    /*
     * 編號在操作詞之前：
     *   「1 2改成10點 3 4取消」
     *
     * 因此第 1 段的編號取 0～「改成」之前，
     * 第 2 段的編號取「改成」之後～「取消」之前。
     *
     * 注意：這裡的 selector 只認「編號」，不能再用操作段落中的
     * 時間反推候選；否則「17:30，2」會把 17:00 的第 1 道誤抓進來。
     */
    const selectorText =
      message
        .slice(
          previousEnd,
          currentStart,
        )
        .trim();

    const selectedIndices =
      extractCandidateIndices(
        selectorText,
        candidates,
        {
          /*
           * 混合操作的 selector 已經是明確的編號區段。
           * 禁止用其中的時間再次反查 Reminder，
           * 避免「17:30，2」把第 1 道一起抓進取消候選。
           */
          matchByTime: false,
          strictNumericSelectors: true,
        },
      );

    if (!selectedIndices.length) {
      continue;
    }

    const operationWord = current[0];

    /*
     * Update 的解析只需要「改成什麼」，
     * 因此從操作詞開始取到下一個操作詞即可。
     * 這避免把前一段的時間一起交給 Parser。
     */
    /*
     * operationText 只保留「這一段操作真正要改成的內容」。
     *
     * 例如：
     *   「1改成15:30，2取消」
     *
     * 第一段原本若直接取到下一個操作詞，會得到
     *   「改成15:30，2」
     * local parser 會把「2」誤認成新的內容。
     *
     * 因此 update 段落在送進 local parser 前，必須把下一段
     * 操作的編號選擇器剝掉。
     */
    let operationText =
      message
        .slice(
          currentStart,
          nextStart,
        )
        .trim();

    if (
      operationWordIsUpdatePlaceholder(current[0])
    ) {
      operationText =
        stripTrailingCandidateSelector(
          operationText,
          candidates,
        );
    }

    operations.push({
      action:
        operationWord === '取消' ||
        operationWord === '撤掉' ||
        operationWord === '撤銷' ||
        operationWord === '不要'
          ? 'cancel'
          : 'update',
      indices: selectedIndices,
      text: operationText,
    });
  }

  return operations;
}

function mergeUniqueReminderIndices(
  operations: MixedReminderOperation[],
): number[] {
  return [
    ...new Set(
      operations.flatMap(
        (operation) => operation.indices,
      ),
    ),
  ].sort((a, b) => a - b);
}

function buildMixedOperationResult(
  updated: Reminder[],
  cancelled: Reminder[],
): ReminderHandlerResult {
  const messages: string[] = [];

  if (updated.length) {
    messages.push(
      updated.length === 1
        ? `已修改：${formatReminderTime(updated[0].remindAt)}｜${updated[0].content}`
        : `已修改 ${updated.length} 道提醒：\n${updated
            .map(
              (reminder) =>
                `・${formatReminderTime(reminder.remindAt)}｜${reminder.content}`,
            )
            .join('\n')}`,
    );
  }

  if (cancelled.length) {
    messages.push(
      cancelled.length === 1
        ? `已撤下：${formatReminderTime(cancelled[0].remindAt)}｜${cancelled[0].content}`
        : `已撤下 ${cancelled.length} 道提醒：\n${cancelled
            .map(
              (reminder) =>
                `・${formatReminderTime(reminder.remindAt)}｜${reminder.content}`,
            )
            .join('\n')}`,
    );
  }

  return {
    handled: true,
    action: updated.length ? 'update' : 'cancel',
    updated: updated.length > 0,
    cancelled: cancelled.length > 0,
    candidates: [
      ...updated,
      ...cancelled,
    ],
    message: messages.join('\n'),
  };
}

async function handlePendingState(
  message: string,
  createdByUserId: string,
  groupId: string,
  gemini: GoogleGenAI,
  requestVersion: number,
): Promise<ReminderHandlerResult | null> {
  const conversationKey =
    `${groupId}:${createdByUserId}`;

  if (
    !isCurrentReminderRequest(
      conversationKey,
      requestVersion,
    )
  ) {
    return null;
  }

  const pending = getPendingReminderState(
    conversationKey,
  );

  if (!pending) return null;

  const activeReminders =
    getActiveReminders(groupId);

  let candidates = pending.candidateReminderIds
    .map((reminderId) =>
      activeReminders.find(
        (reminder) => reminder.id === reminderId,
      ),
    )
    .filter(
      (reminder): reminder is Reminder =>
        reminder !== undefined,
    );

  /* 保留完整候選清單；混合操作的編號永遠以這份清單為準。 */
  const candidatePool = candidates;

  if (!candidates.length) {
    clearPendingReminderState(conversationKey);
    return {
      handled: true,
      message:
        '主上，原本那道 Reminder 已經不存在或已經完成了。奴才不敢擅自動其他旨意。',
    };
  }

  const cancelIntent = containsCancelIntent(message);
  const updateIntent = containsUpdateIntent(message);

  /*
   * Pending 查詢結果只在使用者真的要操作它時才攔截。
   * 例如「取消14:19」要從上一輪候選中找；
   * 「取消明天提醒」沒有明確選擇時則交回新指令解析。
   */
  if (cancelIntent || updateIntent) {
    const selectedIndices =
      extractCandidateIndices(
        message,
        candidates,
      );

    if (selectedIndices.length) {
      candidates = selectedIndices.map(
        (index) => candidates[index],
      );
    } else if (pending.requiresConfirmation) {
      if (isYes(message) || isNo(message)) {
        /* 交由下方確認流程處理。 */
      } else {
        return null;
      }
    } else {
      return null;
    }

    /*
     * 同一則訊息可以同時包含修改與取消。
     *
     * 先拆成各自的操作段落，再逐段執行。
     * 這也同時支援：
     *   「1 2改成10點」
     *   「1改成10點，2取消」
     *   「1改成10點，2改成11點」
     */
    const mixedOperations =
      extractMixedReminderOperations(
        message,
        candidatePool,
      );

    const hasMixedOperation =
      mixedOperations.some(
        (operation) => operation.action === 'cancel',
      ) &&
      mixedOperations.some(
        (operation) => operation.action === 'update',
      );

    console.log(
      '[Reminder Mixed Debug]',
      JSON.stringify(
        mixedOperations.map((operation) => ({
          action: operation.action,
          indices: operation.indices,
          text: operation.text,
        })),
      ),
    );

    if (
      selectedIndices.length &&
      (
        hasMixedOperation ||
        mixedOperations.length > 1 ||
        updateIntent
      )
    ) {
      const operatedIndices =
        mergeUniqueReminderIndices(
          mixedOperations,
        );

      /*
       * 如果只有單純的「1 2改成10點」，mixed parser
       * 會得到一個 update operation；如果 parser 因
       * 中文語序沒有拆出操作段落，退回原本的單一
       * update 流程。
       */
      if (
        mixedOperations.length > 0 &&
        operatedIndices.length > 0
      ) {
        const operatedReminders =
          operatedIndices
            .map((index) => candidatePool[index])
            .filter(
              (reminder): reminder is Reminder =>
                reminder !== undefined,
            );

        if (
          operatedReminders.some(
            (reminder) =>
              !canManageReminder(
                reminder,
                createdByUserId,
              ),
          )
        ) {
          clearPendingReminderState(
            conversationKey,
          );

          return {
            handled: true,
            action: 'authorization-confirmation',
            candidates: operatedReminders,
            message:
              '主上，這次同時包含修改與取消，而且其中有需要授權的提醒。為避免只執行一半，請先分開處理需要授權的提醒。',
          };
        }

        /*
         * 先完整解析／驗證所有 update，確認整句操作可以成立後，
         * 才開始任何 cancel / update 寫入。
         *
         * 這是混合操作的原子性邊界：
         * 「1改成10點，2取消」不能先撤2，再因為1的解析失敗而只剩取消。
         */
        const preparedUpdates: Array<{
          reminder: Reminder;
          updates: ReturnType<typeof buildUpdateRequest>;
        }> = [];
        const cancelReminders: Reminder[] = [];
        const usedIndices = new Set<number>();

        for (const operation of mixedOperations) {
          for (const candidateIndex of operation.indices) {
            if (usedIndices.has(candidateIndex)) {
              return {
                handled: true,
                action: 'selection-confirmation',
                candidates: operatedReminders,
                message:
                  '主上，同一道提醒不能在同一句裡同時修改又取消。請把兩個操作分開說。',
              };
            }

            usedIndices.add(candidateIndex);

            const reminder = candidatePool[candidateIndex];
            if (!reminder) continue;

            if (operation.action === 'cancel') {
              cancelReminders.push(reminder);
              continue;
            }

            let updates =
              buildLocalUpdateRequest(
                operation.text,
              );

            /*
             * 明確的編號修改已在本地完成解析。
             * 只有本地無法判斷修改內容時，才 fallback 到 Gemini。
             */
            if (!updates) {
              const parsedUpdate = await parseReminder(
                operation.text,
                gemini,
              );

              if (!isCurrentReminderRequest(
                conversationKey,
                requestVersion,
              )) {
                return null;
              }

              updates = buildUpdateRequest(
                parsedUpdate,
                operation.text,
                createdByUserId,
              );
            }

            if (!hasActualUpdateRequest(updates)) {
              return {
                handled: true,
                action: 'update',
                updated: false,
                cancelled: false,
                candidates: operatedReminders,
                message:
                  '主上，奴才知道要處理哪些提醒，但其中一段沒有聽清楚要改成什麼。這次沒有撤下或修改任何一道提醒。',
              };
            }

            preparedUpdates.push({
              reminder,
              updates,
            });
          }
        }

        if (!isCurrentReminderRequest(
          conversationKey,
          requestVersion,
        )) {
          return null;
        }

        const updated: Reminder[] = [];
        const cancelled: Reminder[] = [];

        /* 所有解析成功後，才進入實際寫入階段。 */
        for (const item of preparedUpdates) {
          const updatedReminder = applyReminderUpdate(
            item.reminder,
            item.updates,
          );

          if (!updatedReminder) {
            return {
              handled: true,
              action: 'update',
              updated: false,
              cancelled: false,
              candidates: operatedReminders,
              message:
                '主上，奴才驗證修改結果時發現有一道沒有成功。為避免只做一半，這次沒有撤下或修改任何一道提醒。',
            };
          }

          updated.push(updatedReminder);
        }

        for (const reminder of cancelReminders) {
          if (cancelReminder(reminder.id)) {
            cancelled.push(reminder);
          } else {
            return {
              handled: true,
              action: 'cancel',
              updated: false,
              cancelled: false,
              candidates: operatedReminders,
              message:
                '主上，奴才在撤下其中一道提醒時遇到問題。為避免誤報結果，這次不回報為完整成功。',
            };
          }
        }

        clearPendingReminderState(
          conversationKey,
        );

        return buildMixedOperationResult(
          updated,
          cancelled,
        );
      }
    }

    /*
     * 純取消：保留原本的多筆取消流程。
     */
    if (
      cancelIntent &&
      selectedIndices.length
    ) {
      if (
        candidates.every(
          (reminder) =>
            canManageReminder(
              reminder,
              createdByUserId,
            ),
        )
      ) {
        clearPendingReminderState(
          conversationKey,
        );
        return buildCancelResult(
          candidates,
        );
      }

      const authorizationUsers =
        setAuthorizationPendingStates(
          candidates,
          groupId,
          'cancel',
          message,
        );

      clearPendingReminderState(
        conversationKey,
      );

      if (!authorizationUsers.length) {
        return {
          handled: true,
          action: 'authorization-confirmation',
          candidates,
          message:
            '主上，這幾道提醒沒有共同的授權人，為避免誤撤其他人的提醒，請分開指定取消。',
        };
      }

      return {
        handled: true,
        action: 'authorization-confirmation',
        candidates,
        message:
          candidates.length === 1
            ? `主上，這道提醒由建立人與被提醒者共同擁有取消權。請由「${authorizationText(candidates)}」其中一人回覆「同意」，奴才才會撤下。`
            : `主上，這批提醒需要共同授權人確認。請由「${authorizationText(candidates)}」其中一人回覆「同意」，奴才才會一次撤下。`,
        mentionUserIds:
          authorizationUsers,
      };
    }

    /*
     * 純修改：現在允許一次指定多道 Reminder。
     * 所有選取的 Reminder 都套用同一個修改內容。
     */
    if (
      updateIntent &&
      selectedIndices.length
    ) {
      const selected =
        selectedIndices.map(
          (index) => candidates[index],
        );

      const unauthorizedSelected =
        selected.filter(
          (reminder) =>
            !canManageReminder(
              reminder,
              createdByUserId,
            ),
        );

      if (unauthorizedSelected.length) {
        clearPendingReminderState(
          conversationKey,
        );

        /*
         * 多筆修改的授權確認目前只安全支援單筆，
         * 避免確認後無法正確知道每一道 Reminder 的
         * 修改內容。多筆中若有未授權項目，要求拆開處理。
         */
        if (selected.length > 1) {
          return {
            handled: true,
            action: 'authorization-confirmation',
            candidates: selected,
            message:
              '主上，這次多筆修改中有需要授權的提醒。為避免只修改其中一部分，請分開指定每一道提醒修改。',
          };
        }

        const authorizationUsers =
          setAuthorizationPendingStates(
            selected,
            groupId,
            'update',
            message,
          );

        if (!authorizationUsers.length) {
          return {
            handled: true,
            action: 'authorization-confirmation',
            candidates: selected,
            message:
              '主上，這道提醒沒有可確認的授權人，奴才不敢擅自修改。',
          };
        }

        return {
          handled: true,
          action: 'authorization-confirmation',
          candidates: selected,
          message:
            `主上，這道提醒需要建立人或被提醒者確認修改。請由「${authorizationText(selected)}」其中一人回覆「同意」。`,
          mentionUserIds:
            authorizationUsers,
        };
      }

      let updates =
        buildLocalUpdateRequest(
          message,
        );

      /*
       * 明確的「編號＋修改」不再等待 Gemini。
       * 本地無法解析時才 fallback。
       */
      if (!updates) {
        const parsedUpdate =
          await parseReminder(
            message,
            gemini,
          );

        updates =
          buildUpdateRequest(
            parsedUpdate,
            message,
            createdByUserId,
          );
      }

      if (
        !hasActualUpdateRequest(
          updates,
        )
      ) {
        return {
          handled: true,
          action: 'update',
          updated: false,
          candidates: selected,
          message:
            '主上，奴才知道您要改哪幾道了，但還沒聽清楚要改成什麼時間或內容。',
        };
      }

      const updated: Reminder[] = [];

      for (
        const reminder of selected
      ) {
        const updatedReminder =
          applyReminderUpdate(
            reminder,
            updates,
          );

        if (updatedReminder) {
          updated.push(
            updatedReminder,
          );
        }
      }

      clearPendingReminderState(
        conversationKey,
      );

      if (
        updated.length !== selected.length
      ) {
        return {
          handled: true,
          action: 'update',
          updated: false,
          candidates: selected,
          message:
            `主上，這次指定 ${selected.length} 道提醒，但實際成功修改 ${updated.length} 道。奴才沒有把未成功的提醒當成已修改。`,
        };
      }

      return {
        handled: true,
        action: 'update',
        updated: true,
        candidates: updated,
        reminders: updated,
        message:
          updated.length === 1
            ? `喳，已替主上把「${updated[0].content}」提醒改成 ${formatReminderTime(updated[0].remindAt)}。`
            : `喳，已替主上修改 ${updated.length} 道提醒：\n${updated
                .map(
                  (reminder) =>
                    `・${formatReminderTime(reminder.remindAt)}｜${reminder.content}`,
                )
                .join('\n')}`,
      };
    }
  }

  /* 重複建立確認 */
  if (pending.action === 'duplicate') {
    if (isYes(message)) {
      clearPendingReminderState(conversationKey);

      const created = candidates.map((candidate) =>
        createDuplicateAfterConfirmation(
          candidate,
          createdByUserId,
          groupId,
        ),
      );

      const reminders = created
        .map((result) => result.reminders?.[0])
        .filter(
          (reminder): reminder is Reminder =>
            reminder !== undefined,
        );

      return {
        handled: true,
        action: 'create',
        created: reminders.length > 0,
        reminders,
        reminderId: reminders[0]?.id,
        remindAt: reminders[0]?.remindAt,
        content: reminders[0]?.content,
        target: reminders[0]?.target,
        message:
          reminders.length === 1
            ? `喳，已再替主上添下一道相同的提醒：${formatReminderTime(reminders[0].remindAt)}｜${reminders[0].content}。`
            : `喳，已再替主上添下 ${reminders.length} 道相同的提醒。`,
        mentionUserIds:
          getCreateMentionInfo(
            reminders,
            createdByUserId,
          ).mentionUserIds,
        mentionAll:
          getCreateMentionInfo(
            reminders,
            createdByUserId,
          ).mentionAll,
      };
    }

    if (isNo(message)) {
      clearPendingReminderState(conversationKey);
      return {
        handled: true,
        action: 'duplicate-confirmation',
        message: '喳，那奴才不重複下旨。',
      };
    }

    return {
      handled: true,
      action: 'duplicate-confirmation',
      candidates,
      message:
        '主上只要告訴奴才「要」或「不要」即可。',
    };
  }

  /* 批次取消確認 */
  if (
    pending.action === 'cancel' &&
    pending.requiresConfirmation
  ) {
    if (isYes(message)) {
      const authorizationUsers =
        getCommonAuthorizedUsers(
          candidates,
        );

      if (
        !authorizationUsers.includes(
          createdByUserId,
        )
      ) {
        return {
          handled: true,
          action: 'authorization-confirmation',
          candidates,
          message:
            `主上，這次確認需要由「${authorizationText(candidates)}」其中一人回覆「同意」。`,
          mentionUserIds:
            authorizationUsers,
        };
      }

      let count = 0;
      for (const reminder of candidates) {
        if (cancelReminder(reminder.id)) {
          count += 1;
        }
      }

      clearAuthorizationPendingStates(
        groupId,
        authorizationUsers,
      );

      return {
        handled: true,
        action: 'cancel',
        cancelled:
          count === candidates.length,
        candidates,
        message:
          candidates.length === 1
            ? `喳，${formatReminderTime(candidates[0].remindAt)} 的「${candidates[0].content}」提醒已撤下。`
            : `喳，已替主上撤下 ${count} 道提醒：\n${candidates
                .map(
                  (reminder) =>
                    `・${formatReminderTime(reminder.remindAt)}｜${reminder.content}`,
                )
                .join('\n')}`,
      };
    }

    if (isNo(message)) {
      const authorizationUsers =
        getCommonAuthorizedUsers(
          candidates,
        );

      clearAuthorizationPendingStates(
        groupId,
        authorizationUsers,
      );

      return {
        handled: true,
        action: 'cancel',
        cancelled: false,
        message:
          '喳，奴才保留原本的提醒，沒有撤下。',
      };
    }
  }

  /* 修改授權確認 */
  if (
    pending.action === 'update' &&
    pending.requiresConfirmation
  ) {
    if (isYes(message)) {
      const authorizationUsers =
        getCommonAuthorizedUsers(candidates);

      if (!authorizationUsers.includes(createdByUserId)) {
        return {
          handled: true,
          action: 'authorization-confirmation',
          candidates,
          message:
            `主上，這次確認需要由「${authorizationText(candidates)}」其中一人回覆「同意」。`,
          mentionUserIds: authorizationUsers,
        };
      }

      const originalRequest =
        pending.originalRequest || '';

      let updates =
        buildLocalUpdateRequest(
          originalRequest,
        );

      if (!updates) {
        const parsedUpdate = await parseReminder(
          originalRequest,
          gemini,
        );

        updates = buildUpdateRequest(
          parsedUpdate,
          originalRequest,
          createdByUserId,
        );
      }

      const updated =
        candidates.length === 1
          ? applyReminderUpdate(
              candidates[0],
              updates,
            )
          : null;

      clearAuthorizationPendingStates(
        groupId,
        authorizationUsers,
      );

      if (updated) {
        return {
          handled: true,
          action: 'update',
          updated: true,
          reminderId: updated.id,
          remindAt: updated.remindAt,
          content: updated.content,
          target: updated.target,
          message:
            `喳，已替主上把「${updated.content}」提醒改成 ${formatReminderTime(updated.remindAt)}。`,
        };
      }

      return {
        handled: true,
        action: 'update',
        updated: false,
        candidates,
        message:
          '主上，奴才收到同意了，但沒有成功修改那道提醒。',
      };
    }

    if (isNo(message)) {
      const authorizationUsers =
        getCommonAuthorizedUsers(candidates);
      clearAuthorizationPendingStates(
        groupId,
        authorizationUsers,
      );
      return {
        handled: true,
        action: 'update',
        updated: false,
        candidates,
        message:
          '喳，奴才保留原本的提醒，沒有修改。',
      };
    }
  }

  /* 多候選選擇 */
  const selectedIndices = extractCandidateIndices(
    message,
    candidates,
  );

  if (selectedIndices.length > 1) {
    if (pending.action === 'cancel') {
      const selected = selectedIndices.map(
        (index) => candidates[index],
      );

      if (selected.every((reminder) =>
        canManageReminder(reminder, createdByUserId),
      )) {
        clearPendingReminderState(conversationKey);
        return buildCancelResult(selected);
      }

      const authorizationUsers =
        setAuthorizationPendingStates(
          selected,
          groupId,
          'cancel',
          message,
        );

      clearPendingReminderState(
        conversationKey,
      );

      if (!authorizationUsers.length) {
        return {
          handled: true,
          action: 'authorization-confirmation',
          candidates: selected,
          message:
            '主上，這幾道提醒沒有共同的授權人，為避免誤撤其他人的提醒，請分開指定取消。',
        };
      }

      return {
        handled: true,
        action: 'authorization-confirmation',
        candidates: selected,
        message:
          `主上，已選定 ${selected.length} 道提醒。請由「${authorizationText(selected)}」其中一人回覆「同意」，奴才才會一次撤下。`,
        mentionUserIds:
          authorizationUsers,
      };
    }

    return {
      handled: true,
      action: 'selection-confirmation',
      candidates,
      message:
        '主上，修改一次只能指定一道 Reminder。請告訴奴才其中一個編號。',
    };
  }

  const index =
    selectedIndices[0] ??
    -1;

  if (index < 0) {
    return {
      handled: true,
      action: 'selection-confirmation',
      candidates,
      message:
        '主上，奴才還沒聽清楚您要處理哪一道。請直接說「第一個」、「第二個」，或說提醒內容。',
    };
  }

  const selected = candidates[index];

  if (!canManageReminder(selected, createdByUserId)) {
    clearPendingReminderState(conversationKey);
    setAuthorizationPendingStates(
      [selected],
      groupId,
      pending.action === 'cancel' ? 'cancel' : 'update',
    );
    return {
      handled: true,
      action: 'authorization-confirmation',
      candidates: [selected],
      message:
        `主上，這道提醒需要建立人或被提醒的人確認。可由「${authorizationText([selected])}」其中一人回覆「同意」。`,
      mentionUserIds:
        getCommonAuthorizedUsers([selected]),
    };
  }

  if (pending.action === 'cancel') {
    clearPendingReminderState(conversationKey);
    return buildCancelResult([selected]);
  }

  clearPendingReminderState(conversationKey);

  return {
    handled: true,
    action: 'update',
    candidates: [selected],
    message:
      '主上，奴才已經找到您說的那一道。請把要改成的時間或內容告訴奴才。',
  };
}

/* =========================================================
 * List
 * ========================================================= */

function handleList(
  parsed: ReminderParseResult,
  createdByUserId: string,
  groupId: string,
): ReminderHandlerResult {
  const reminders = getQueryReminders(
    groupId,
    createdByUserId,
    parsed.queryScope || 'self',
    parsed.queryPeriod || 'all',
  );

  if (!reminders.length) {
    return {
      handled: true,
      action: 'list',
      reminders: [],
      message:
        '目前沒有符合條件的有效 Reminder。',
    };
  }

  const periodText: Record<QueryPeriod, string> = {
    all: '目前',
    today: '今日',
    tomorrow: '明日',
    week: '本週',
    month: '本月',
  };

  const conversationKey =
    `${groupId}:${createdByUserId}`;

  /*
   * 查詢結果本身就是下一輪操作的候選清單。
   * action 使用 cancel 作為相容值；真正下一句若包含
   * 「改成／修改」會在 Pending Handler 中切換成 update。
   */
  setPendingReminderState({
    conversationKey,
    userId: createdByUserId,
    groupId,
    action: 'cancel',
    candidateReminderIds: reminders.map(
      (reminder) => reminder.id,
    ),
    requiresConfirmation: false,
    confirmationRequired: false,
  });

  const lines = reminders.map(
    (reminder, index) =>
      `${index + 1}. ${formatReminderTime(reminder.remindAt)}｜@${formatTargetList(reminder)}｜${reminder.content}`,
  );

  return {
    handled: true,
    action: 'list',
    reminders,
    message:
      `喳，主上${periodText[parsed.queryPeriod || 'all']}共有 ${reminders.length} 道提醒：\n${lines.join('\n')}\n\n之後可以直接說「4取消」或「4改成10點」處理其中一道。`,
  };
}

/* =========================================================
 * Cancel
 * ========================================================= */

function handleCancel(
  parsed: ReminderParseResult,
  createdByUserId: string,
  groupId: string,
): ReminderHandlerResult {
  let reminders = getQueryReminders(
    groupId,
    createdByUserId,
    'group',
    parsed.queryPeriod || 'all',
  );

  reminders = filterCandidates(
    reminders,
    parsed,
  );

  if (!reminders.length) {
    return {
      handled: true,
      action: 'cancel',
      cancelled: false,
      message:
        '主上，奴才沒有找到符合條件的有效 Reminder。',
    };
  }

  if (reminders.length === 1) {
    const reminder = reminders[0];

    if (canManageReminder(reminder, createdByUserId)) {
      return buildCancelResult([reminder]);
    }

    const authorizationUsers =
      setAuthorizationPendingStates(
        [reminder],
        groupId,
        'cancel',
        parsed.content || undefined,
      );

    if (!authorizationUsers.length) {
      return {
        handled: true,
        action: 'authorization-confirmation',
        candidates: [reminder],
        message:
          '主上，這道提醒沒有可確認的授權人，奴才不敢擅自撤下。',
      };
    }

    return {
      handled: true,
      action: 'authorization-confirmation',
      candidates: [reminder],
      message:
        `主上，這道提醒是「${formatTargetList(reminder)}」的事項，建立人與被提醒者都可以確認取消。請由「${authorizationText([reminder])}」其中一人回覆「同意」。`,
      mentionUserIds:
        authorizationUsers,
    };
  }

  const conversationKey =
    `${groupId}:${createdByUserId}`;

  setPendingReminderState({
    conversationKey,
    userId: createdByUserId,
    groupId,
    action: 'cancel',
    candidateReminderIds:
      reminders.map((reminder) => reminder.id),
    requiresConfirmation: false,
    confirmationRequired: false,
  });

  const candidateText = reminders
    .map(
      (reminder, index) =>
        `${index + 1}. ${formatReminderTime(reminder.remindAt)}｜@${formatTargetList(reminder)}｜${reminder.content}`,
    )
    .join('\n');

  return {
    handled: true,
    action: 'selection-confirmation',
    candidates: reminders,
    message:
      `主上，奴才找到 ${reminders.length} 道符合的旨意：\n${candidateText}\n請告訴奴才要撤哪一道；若要多道一起撤，直接說「4跟6」即可。`,
  };
}

/* =========================================================
 * Update
 * ========================================================= */

function handleUpdate(
  parsed: ReminderParseResult,
  createdByUserId: string,
  groupId: string,
  originalRequest = '',
): ReminderHandlerResult {
  let reminders = getQueryReminders(
    groupId,
    createdByUserId,
    'group',
    parsed.queryPeriod || 'all',
  );

  reminders = filterCandidates(
    reminders,
    parsed,
  );

  if (!reminders.length) {
    return {
      handled: true,
      action: 'update',
      updated: false,
      message:
        '主上，奴才沒有找到符合條件的有效 Reminder。',
    };
  }

  if (reminders.length > 1) {
    const conversationKey =
      `${groupId}:${createdByUserId}`;

    setPendingReminderState({
      conversationKey,
      userId: createdByUserId,
      groupId,
      action: 'update',
      candidateReminderIds:
        reminders.map((reminder) => reminder.id),
      requiresConfirmation: false,
      confirmationRequired: false,
    });

    const candidateText = reminders
      .map(
        (reminder, index) =>
          `${index + 1}. ${formatReminderTime(reminder.remindAt)}｜@${formatTargetList(reminder)}｜${reminder.content}`,
      )
      .join('\n');

    return {
      handled: true,
      action: 'selection-confirmation',
      candidates: reminders,
      message:
        `主上，奴才找到不只一道符合的旨意：\n${candidateText}\n請告訴奴才要修改哪一道。`,
    };
  }

  const reminder = reminders[0];

  if (!canManageReminder(reminder, createdByUserId)) {
    const conversationKey =
      `${groupId}:${createdByUserId}`;

    setAuthorizationPendingStates(
      [reminder],
      groupId,
      'update',
      originalRequest || parsed.updateRemindAt || parsed.updateContent || undefined,
    );

    return {
      handled: true,
      action: 'authorization-confirmation',
      candidates: [reminder],
      message:
        `主上，這道提醒需要建立人或被提醒的人確認修改。請由「${authorizationText([reminder])}」其中一人回覆「同意」。`,
    };
  }

  const updates = buildUpdateRequest(
    parsed,
    originalRequest,
    createdByUserId,
  );

  const updated = applyReminderUpdate(
    reminder,
    updates,
  );

  if (!updated) {
    return {
      handled: true,
      action: 'update',
      updated: false,
      message:
        '主上，奴才沒有成功修改那道提醒。',
    };
  }

  return {
    handled: true,
    action: 'update',
    updated: true,
    reminderId: updated.id,
    remindAt: updated.remindAt,
    content: updated.content,
    target: updated.target,
    message:
      `喳，已替主上把「${updated.content}」提醒改成 ${formatReminderTime(updated.remindAt)}。`,
  };
}

/* =========================================================
 * Reminder Request Supersession
 * =========================================================
 *
 * Gemini 解析可能比下一則 LINE 訊息晚很多才返回。
 * 同一個 conversation 如果使用者已經送出更新的指令，
 * 舊請求即使之後完成，也不得再修改 Reminder。
 */
const reminderRequestVersions = new Map<string, number>();

function beginReminderRequest(conversationKey: string): number {
  const nextVersion =
    (reminderRequestVersions.get(conversationKey) || 0) + 1;

  reminderRequestVersions.set(
    conversationKey,
    nextVersion,
  );

  return nextVersion;
}

function isCurrentReminderRequest(
  conversationKey: string,
  requestVersion: number,
): boolean {
  return (
    reminderRequestVersions.get(conversationKey) ===
    requestVersion
  );
}

/* =========================================================
 * Reminder 呼叫詞／指令模式
 * ========================================================= */

const REMINDER_INVOCATION_WORDS = [
  '大內總管',
  '總管',
  '內內',
  '喳子',
  '渣子',
];

function hasReminderInvocation(
  message: string,
): boolean {
  return REMINDER_INVOCATION_WORDS.some(
    (word) => message.includes(word),
  );
}

function stripReminderInvocationWords(
  message: string,
): string {
  return REMINDER_INVOCATION_WORDS.reduce(
    (text, word) => text.replaceAll(word, ''),
    message,
  ).trim();
}

/* =========================================================
 * 主要入口
 * ========================================================= */

export async function handleReminderMessage(
  message: string,
  createdByUserId: string,
  groupId: string,
  gemini: GoogleGenAI,
  hasInvocation = false,
): Promise<ReminderHandlerResult> {
  if (
    !message.trim() ||
    !createdByUserId ||
    !groupId
  ) {
    return { handled: false };
  }

  const conversationKey =
    `${groupId}:${createdByUserId}`;

  /* 每一則新訊息都使同一對話中的舊非同步請求失效。 */
  const requestVersion =
    beginReminderRequest(conversationKey);

  /*
   * 正式 Reminder 指令與上下文 Follow-up 是兩種不同模式：
   *
   * 1. 有呼叫詞：一定視為新的正式 Reminder 指令。
   *    正式指令永遠優先，不被上一輪 Pending State 攔截。
   *
   * 2. 沒有呼叫詞：只有「上一輪真正留下的操作上下文」
   *    才能承接，而且只允許這一個下一則訊息。
   *
   * 這裡刻意不讓 Pending State 與正式命令互相競爭。
   */
  const normalizedMessage =
    stripReminderInvocationWords(message);

  if (!normalizedMessage) {
    /* 「喳子」本身只是呼叫總管，不是 Reminder 指令。 */
    return { handled: false };
  }

  const pending =
    getPendingReminderState(conversationKey);

  /*
   * 有呼叫詞 + 明確編號操作時，若上一輪剛建立 Reminder 候選，
   * 仍必須允許這個編號操作承接上一輪候選。
   *
   * 例如：
   *   「喳子所有提醒」
   *   「喳子1取消」
   *   「喳子1 2 3取消」
   *
   * 原本只在 !hasInvocation 時承接 Pending，導致上面的正式呼叫
   * 被重新送進 Gemini 解析；多筆空白分隔編號尤其容易被判成 list，
   * 因而重新列出提醒而沒有執行取消。
   *
   * 這裡只放行「明確候選編號 + 取消/修改」的情況，不讓一般的
   * 「喳子」或自然語言新指令被舊 Pending State 攔截。
   */
  if (
    hasInvocation &&
    pending &&
    hasExplicitCandidateSelector(normalizedMessage) &&
    (
      containsCancelIntent(normalizedMessage) ||
      containsUpdateIntent(normalizedMessage)
    )
  ) {
    const pendingResult =
      await handlePendingState(
        normalizedMessage,
        createdByUserId,
        groupId,
        gemini,
        requestVersion,
      );

    if (!isCurrentReminderRequest(
      conversationKey,
      requestVersion,
    )) {
      return { handled: false };
    }

    if (pendingResult) {
      return pendingResult;
    }
  }

  if (!hasInvocation && pending) {
    const normalized = normalizedMessage;
    const looksLikePendingResponse =
      containsCancelIntent(normalized) ||
      containsUpdateIntent(normalized) ||
      isYes(normalized) ||
      isNo(normalized) ||
      hasExplicitCandidateSelector(normalized);

    if (looksLikePendingResponse) {
      const pendingResult =
        await handlePendingState(
          normalized,
          createdByUserId,
          groupId,
          gemini,
          requestVersion,
        );

      if (!isCurrentReminderRequest(
        conversationKey,
        requestVersion,
      )) {
        return { handled: false };
      }

      if (pendingResult) {
        /*
         * handlePendingState 自己決定是否仍需保留狀態。
         * 例如「同意」未必代表本使用者就是授權人，
         * 或重複提醒確認仍可能等待下一次「要／不要」。
         * 因此這裡不能無條件清除 Pending。
         */
        return pendingResult;
      }
    }

    /*
     * 有 Pending 但這一句不是合法 Follow-up：
     * 這一次機會立即失效，不讓舊上下文污染下一句。
     */
    clearPendingReminderState(
      conversationKey,
    );
    return { handled: false };
  }

  /*
   * 沒有呼叫詞、也沒有有效的一次性上下文：
   * 不允許建立新的 Reminder 指令。
   * 這是本輪「正式命令必須呼叫」的硬邊界。
   */
  if (!hasInvocation) {
    return { handled: false };
  }

  /*
   * 有呼叫詞 → 正式 Reminder 模式。
   * 此時完全不使用舊 Pending State，避免兩套指令規則互相卡住。
   */
  const hasReminderIntent =
    mayBeReminder(normalizedMessage) ||
    normalizedMessage.length > 0;

  if (hasReminderIntent) {
    let parsed: ReminderParseResult;

    try {
      parsed =
        await parseReminderWithTimeout(
          normalizedMessage,
          gemini,
        );
    } catch (error) {
      if (!isCurrentReminderRequest(
        conversationKey,
        requestVersion,
      )) {
        return { handled: false };
      }

      console.error(
        '[Reminder Handler] Reminder 解析失敗:',
        error,
      );

      return {
        handled: true,
        message:
          '主上，奴才這次沒有成功聽清楚 Reminder 指令。請再說一次，奴才不會擅自更動既有提醒。',
      };
    }

    if (!isCurrentReminderRequest(
      conversationKey,
      requestVersion,
    )) {
      return { handled: false };
    }

    parsed =
      applyReminderNaturalLanguageHints(
        parsed,
        normalizedMessage,
      );

    if (!isCurrentReminderRequest(
      conversationKey,
      requestVersion,
    )) {
      return { handled: false };
    }

    if (parsed.action !== 'none') {
      /* 新正式指令取代舊 Pending State。 */
      clearPendingReminderState(
        conversationKey,
      );

      switch (parsed.action) {
        case 'create':
          return handleCreate(
            parsed,
            createdByUserId,
            groupId,
          );

        case 'list':
          return handleList(
            parsed,
            createdByUserId,
            groupId,
          );

        case 'cancel':
          return handleCancel(
            parsed,
            createdByUserId,
            groupId,
          );

        case 'update':
          return handleUpdate(
            parsed,
            createdByUserId,
            groupId,
            normalizedMessage,
          );

        default:
          return { handled: false };
      }
    }

    /*
     * 有正式呼叫詞但 Parser 判定不是 Reminder 指令。
     * 不讓舊 Pending State 回頭接手，也不虛構操作結果。
     */
    clearPendingReminderState(
      conversationKey,
    );
  }

  return { handled: false };
}

/* =========================================================
 * 舊 API 相容
 * ========================================================= */

export interface CreateReminderFromMessageResult {
  created: boolean;
  handled?: boolean;
  reminderId?: string;
  remindAt?: string;
  content?: string;
  target?: ReminderTarget;
  reminders?: Reminder[];
  candidates?: Reminder[];
  message?: string;
  mentionUserIds?: string[];
  mentionAll?: boolean;
}

export async function createReminderFromMessage(
  message: string,
  createdByUserId: string,
  groupId: string,
  gemini: GoogleGenAI,
): Promise<CreateReminderFromMessageResult> {
  const result = await handleReminderMessage(
    message,
    createdByUserId,
    groupId,
    gemini,
    hasReminderInvocation(message),
  );

  return {
    created:
      result.created === true,
    handled:
      result.handled,
    reminderId:
      result.reminderId,
    remindAt:
      result.remindAt,
    content:
      result.content,
    target:
      result.target,
    reminders:
      result.reminders,
    candidates:
      result.candidates,
    message:
      result.message,
    mentionUserIds:
      result.mentionUserIds,
    mentionAll:
      result.mentionAll,
  };
}