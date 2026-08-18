import { GoogleGenAI } from '@google/genai';

import {
  createReminder,
  ReminderTarget,
} from './reminder';

import {
  FAMILY_MEMBERS,
} from './family';

import {
  loadFamilyGroupId,
} from './family-group-state';


/**
 * =========================================================
 * Reminder Handler
 * =========================================================
 *
 * 負責：
 *
 * 1. 判斷訊息是否可能是 Reminder
 * 2. 使用 Gemini 理解自然語言時間
 * 3. 取得提醒內容
 * 4. 取得提醒對象
 * 5. 建立 Reminder
 *
 * 不負責：
 *
 * - LINE 發送
 * - Reminder 到期檢查
 * - Scheduler
 * - Gemini 一般聊天
 */


/**
 * =========================================================
 * Reminder 解析結果
 * =========================================================
 */

interface ReminderParseResult {

  isReminder: boolean;

  remindAt?: string;

  content?: string;

  target:
    | 'self'
    | 'all'
    | string
    | null;
}


/**
 * =========================================================
 * 判斷是否可能是 Reminder
 * =========================================================
 *
 * 先由 Node.js 做非常窄的初步判斷。
 *
 * 沒有「提醒」就不呼叫 Reminder Gemini。
 */

export function mayBeReminder(
  message: string,
): boolean {

  const text =
    message.trim();

  if (!text) {
    return false;
  }

  return text.includes('提醒');
}


/**
 * =========================================================
 * 建立 Reminder Parser Prompt
 * =========================================================
 */

function buildReminderPrompt(
  message: string,
  currentTime: string,
): string {

  const members =
    Object.entries(
      FAMILY_MEMBERS,
    ).map(
      ([userId, member]) => ({
        userId,
        identity:
          member.identity,
        mentionName:
          member.mentionName,
        role:
          member.role,
      }),
    );


  return `
你是「LINE 第五個家人」的 Reminder 時間解析器。

你的工作只有一件事：

判斷使用者是否真的要求建立提醒，
如果是，將自然語言轉換成結構化資料。

【目前時間】

${currentTime}

【家庭成員】

${JSON.stringify(
  members,
  null,
  2,
)}

【使用者訊息】

${message}

【規則】

1. 只有使用者真的要求「之後某個時間提醒某件事」時，isReminder 才是 true。

2. 如果只是聊天中提到「提醒」，
   但沒有要求建立提醒，
   isReminder 必須是 false。

3. 「兩分鐘後」
   必須依照目前時間計算實際時間。

4. 「兩天後下午三點」
   必須依照目前日期計算實際日期與 15:00。

5. 「今天下午三點」
   是今天 15:00。

6. 「明天下午三點」
   是明天 15:00。

7. 如果使用者說「提醒我」，
   target 使用 self。

8. 如果使用者明確指定家庭成員，
   target 使用該成員的 userId。

9. 如果使用者說：
   「提醒大家」
   「提醒所有人」
   「提醒全家人」
   「提醒全員」
   target 使用 all。

10. content 只保留真正要提醒的事情。
    例如：
    「兩分鐘後提醒我喝水」
    content 應該是：
    「喝水」

11. remindAt 必須輸出 ISO 8601 時間，
    並使用台灣時間 UTC+08:00。

12. 如果無法確定提醒時間，
    isReminder 必須是 false。

13. 如果無法確定提醒內容，
    isReminder 必須是 false。

14. 只輸出 JSON。
    不要 Markdown。
    不要解釋。
    不要輸出其他文字。

JSON 格式：

{
  "isReminder": true,
  "remindAt": "2026-08-18T08:52:00+08:00",
  "content": "喝水",
  "target": "self"
}

或：

{
  "isReminder": false,
  "target": null
}
`.trim();
}


/**
 * =========================================================
 * 解析 Reminder
 * =========================================================
 */

async function parseReminder(
  message: string,
  currentTime: string,
  gemini: GoogleGenAI,
): Promise<ReminderParseResult> {

  const response =
    await gemini.models.generateContent({
      model:
        'gemini-3.5-flash-lite',

      contents:
        buildReminderPrompt(
          message,
          currentTime,
        ),

      config: {
        temperature: 0,
      },
    });


  const text =
    response.text?.trim();


  if (!text) {
    return {
      isReminder: false,
      target: null,
    };
  }


  try {

    const cleaned =
      text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();


    const parsed =
      JSON.parse(
        cleaned,
      ) as ReminderParseResult;


    if (
      parsed.isReminder !== true
    ) {

      return {
        isReminder: false,
        target: null,
      };
    }


    if (
      typeof parsed.remindAt !== 'string' ||
      !parsed.remindAt.trim()
    ) {

      return {
        isReminder: false,
        target: null,
      };
    }


    if (
      typeof parsed.content !== 'string' ||
      !parsed.content.trim()
    ) {

      return {
        isReminder: false,
        target: null,
      };
    }


    if (
      parsed.target !== 'self' &&
      parsed.target !== 'all' &&
      typeof parsed.target !== 'string'
    ) {

      return {
        isReminder: false,
        target: null,
      };
    }


    return {
      isReminder: true,

      remindAt:
        parsed.remindAt.trim(),

      content:
        parsed.content.trim(),

      target:
        parsed.target,
    };

  } catch (error) {

    console.error(
      '[Reminder Handler] Reminder JSON 解析失敗:',
      error,
    );

    return {
      isReminder: false,
      target: null,
    };
  }
}


/**
 * =========================================================
 * 解析目前時間
 * =========================================================
 */

function getTaipeiCurrentTime(): string {

  return new Intl.DateTimeFormat(
    'zh-TW',
    {
      timeZone:
        'Asia/Taipei',

      year:
        'numeric',

      month:
        '2-digit',

      day:
        '2-digit',

      weekday:
        'long',

      hour:
        '2-digit',

      minute:
        '2-digit',

      second:
        '2-digit',

      hour12:
        false,
    },
  ).format(
    new Date(),
  );
}


/**
 * =========================================================
 * 建立 Reminder
 * =========================================================
 */

export interface CreateReminderFromMessageResult {

  created: boolean;

  reminderId?: string;

  remindAt?: string;

  content?: string;

  target?: ReminderTarget;
}


/**
 * =========================================================
 * 從自然語言建立 Reminder
 * =========================================================
 */

export async function createReminderFromMessage(
  message: string,
  createdByUserId: string,
  groupId: string,
  gemini: GoogleGenAI,
): Promise<CreateReminderFromMessageResult> {

  if (
    !mayBeReminder(
      message,
    )
  ) {

    return {
      created: false,
    };
  }


  if (!createdByUserId) {

    return {
      created: false,
    };
  }


  if (!groupId) {

    return {
      created: false,
    };
  }


  const parsed =
    await parseReminder(
      message,
      getTaipeiCurrentTime(),
      gemini,
    );


  if (
    !parsed.isReminder ||
    !parsed.remindAt ||
    !parsed.content
  ) {

    return {
      created: false,
    };
  }


  let target:
    | ReminderTarget
    | null = null;


  if (
    parsed.target === 'all'
  ) {

    target = {
      type: 'all',
    };

  } else if (
    parsed.target === 'self'
  ) {

    target = {
      type: 'user',
      userId:
        createdByUserId,
    };

  } else {

    const member =
      FAMILY_MEMBERS[
        parsed.target || ''
      ];


    if (!member) {

      return {
        created: false,
      };
    }


    target = {
      type: 'user',
      userId:
        parsed.target || '',
    };
  }


  const reminderId =
    `reminder-${Date.now()}`;


  const reminder =
    createReminder({
      id:
        reminderId,

      groupId,

      createdByUserId,

      content:
        parsed.content,

      remindAt:
        parsed.remindAt,

      target,

      completed:
        false,
    });


  console.log(
    '[Reminder Handler] 已建立自然語言 Reminder:',
    reminder.id,
  );


  return {
    created: true,

    reminderId:
      reminder.id,

    remindAt:
      reminder.remindAt,

    content:
      reminder.content,

    target,
  };
}