/**
 * =========================================================
 * AI Context
 * =========================================================
 *
 * 負責將目前 LINE / 家庭環境整理成統一 AI Context。
 *
 * AI Context 不負責：
 * - 關鍵字判斷
 * - 是否回答
 * - 是否插話
 * - 是否 @人
 * - 是否搜尋
 * - 是否記憶
 *
 * 它只負責把既有資料完整交給 AI。
 * =========================================================
 */

export type AiConversationType =
  | 'private'
  | 'group';


/**
 * =========================================================
 * 家庭成員
 * =========================================================
 */

export interface AiFamilyMemberContext {

  userId: string;

  identity: string;

  role?: string;

  authority?: string;

  personality?: string;

  interaction?: string;

  mentionName?: string;
}


/**
 * =========================================================
 * 對話訊息
 * =========================================================
 */

export interface AiConversationMessage {

  role:
    | 'user'
    | 'assistant';

  userId?: string;

  identity?: string;

  content: string;

  timestamp?: string;
}


/**
 * =========================================================
 * 家庭位置
 * =========================================================
 */

export interface AiLocationContext {

  name?: string;

  city?: string;

  district?: string;

  address?: string;

  latitude?: number;

  longitude?: number;
}


/**
 * =========================================================
 * AI Context
 * =========================================================
 */

export interface AiContext {

  conversationType:
    AiConversationType;

  groupId?: string;

  speakerUserId?: string;

  speaker?: AiFamilyMemberContext;

  familyMembers:
    AiFamilyMemberContext[];

  recentMessages:
    AiConversationMessage[];

  location?: AiLocationContext;

  currentTime?: string;

  currentMessage: string;

  isGroup: boolean;

  isPrivate: boolean;
}


/**
 * =========================================================
 * 建立 Context 的輸入
 * =========================================================
 */

export interface BuildAiContextInput {

  conversationType:
    AiConversationType;

  groupId?: string;

  speakerUserId?: string;

  speaker?: AiFamilyMemberContext;

  familyMembers?:
    AiFamilyMemberContext[];

  recentMessages?:
    AiConversationMessage[];

  location?: AiLocationContext;

  currentTime?: string;

  currentMessage: string;
}


/**
 * =========================================================
 * 建立 AI Context
 * =========================================================
 */

export function buildAiContext(
  input: BuildAiContextInput,
): AiContext {

  const isGroup =
    input.conversationType === 'group';


  return {

    conversationType:
      input.conversationType,

    groupId:
      input.groupId,

    speakerUserId:
      input.speakerUserId,

    speaker:
      input.speaker,

    familyMembers:
      input.familyMembers ?? [],

    recentMessages:
      input.recentMessages ?? [],

    location:
      input.location,

    currentTime:
      input.currentTime,

    currentMessage:
      input.currentMessage,

    isGroup,

    isPrivate:
      !isGroup,
  };
}


/**
 * =========================================================
 * 安全轉換文字
 * =========================================================
 */

function safeText(
  value: unknown,
): string {

  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value.trim();
}


/**
 * =========================================================
 * 兼容既有 Memory 結構
 * =========================================================
 *
 * 不假設 memory.ts 只有單一文字欄位名稱。
 *
 * 依序嘗試：
 * - content
 * - text
 * - message
 *
 * 這一層只負責轉換，
 * 不修改原本 Memory。
 * =========================================================
 */

function getMemoryContent(
  message: any,
): string {

  if (
    typeof message?.content === 'string'
  ) {
    return message.content.trim();
  }


  if (
    typeof message?.text === 'string'
  ) {
    return message.text.trim();
  }


  if (
    typeof message?.message === 'string'
  ) {
    return message.message.trim();
  }


  return '';
}


/**
 * =========================================================
 * 將 Memory 訊息轉成 AI 訊息
 * =========================================================
 */

export function normalizeConversationMessages(
  history: any[],
): AiConversationMessage[] {

  if (
    !Array.isArray(history)
  ) {
    return [];
  }


  const result:
    AiConversationMessage[] = [];


  for (
    const message of history
  ) {

    const content =
      getMemoryContent(
        message,
      );


    if (!content) {
      continue;
    }


    const normalized:
      AiConversationMessage = {

      role:
        message?.role === 'assistant'
          ? 'assistant'
          : 'user',

      content,

      userId:
        typeof message?.userId === 'string'
          ? message.userId
          : undefined,

      identity:
        typeof message?.identity === 'string'
          ? message.identity
          : undefined,

      timestamp:
        typeof message?.timestamp === 'string'
          ? message.timestamp
          : undefined,
    };


    result.push(
      normalized,
    );
  }


  return result;
}


/**
 * =========================================================
 * 建立說話者名稱
 * =========================================================
 */

function getMessageSpeakerName(
  message: AiConversationMessage,
): string {

  if (
    message.identity &&
    message.identity.trim()
  ) {
    return message.identity.trim();
  }


  if (
    message.role === 'assistant'
  ) {
    return '大內總管';
  }


  return '家庭成員';
}


/**
 * =========================================================
 * 建立 Gemini 可讀 Context
 * =========================================================
 */

export function buildAiContextPrompt(
  context: AiContext,
): string {

  const conversationDescription =
    context.isGroup
      ? 'LINE 家庭群組'
      : 'LINE 家庭私訊';


  /*
   * =======================================================
   * 目前說話者
   * =======================================================
   */

  const speakerSection =
    context.speaker
      ? `
【目前說話者】

LINE User ID：
${safeText(context.speaker.userId)}

家庭身份：
${safeText(context.speaker.identity) || '未設定'}

家庭角色：
${safeText(context.speaker.role) || '未設定'}

家庭地位：
${safeText(context.speaker.authority) || '未設定'}

個性：
${safeText(context.speaker.personality) || '未設定'}

互動方式：
${safeText(context.speaker.interaction) || '未設定'}

總管對此人的稱呼：
${safeText(context.speaker.mentionName) || '未設定'}

目前說話者就是正在發送本次訊息的人。
`
      : `
【目前說話者】

目前說話者沒有對應到已登記的家庭成員。

不要自行猜測其家庭身份。
`;


  /*
   * =======================================================
   * 家庭成員
   * =======================================================
   */

  const familySection =
    context.familyMembers.length > 0
      ? `
【家庭成員】

${context.familyMembers
  .map(
    (member) => {

      return `
- 身份：${safeText(member.identity) || '未設定'}
  LINE User ID：${safeText(member.userId)}
  家庭角色：${safeText(member.role) || '未設定'}
  家庭地位：${safeText(member.authority) || '未設定'}
  個性：${safeText(member.personality) || '未設定'}
  互動方式：${safeText(member.interaction) || '未設定'}
  總管稱呼：${safeText(member.mentionName) || '未設定'}
`.trim();
    },
  )
  .join('\n\n')}
`
      : `
【家庭成員】

目前沒有可提供的家庭成員資料。
`;


  /*
   * =======================================================
   * 最近對話
   * =======================================================
   */

  const normalizedMessages =
    normalizeConversationMessages(
      context.recentMessages,
    );


  const conversationSection =
    normalizedMessages.length > 0
      ? `
【最近的 LINE 對話】

以下內容是真正已經發生過的對話，
不是範例，也不是假設。

請把它視為目前這段 LINE 對話的短期上下文。

對話依照發生順序排列：

${normalizedMessages
  .map(
    (message) => {

      const speakerName =
        getMessageSpeakerName(
          message,
        );


      const timestamp =
        safeText(
          message.timestamp,
        );


      if (timestamp) {

        return (
          `[${timestamp}] ` +
          `${speakerName}：` +
          `${message.content}`
        );
      }


      return (
        `${speakerName}：` +
        `${message.content}`
      );
    },
  )
  .join('\n')}
`
      : `
【最近的 LINE 對話】

目前沒有可用的短期對話歷史。

只有在這個區段真的沒有資料時，
才可以視為目前沒有短期記憶。

不要因為某一句沒有被理解，
就自行宣稱「使用者沒有提供過」。
`;


  /*
   * =======================================================
   * 地點
   * =======================================================
   */

  const locationSection =
    context.location
      ? `
【家庭位置】

名稱：
${safeText(context.location.name) || '未設定'}

城市：
${safeText(context.location.city) || '未設定'}

行政區：
${safeText(context.location.district) || '未設定'}

地址：
${safeText(context.location.address) || '未設定'}

緯度：
${context.location.latitude ?? '未設定'}

經度：
${context.location.longitude ?? '未設定'}
`
      : `
【家庭位置】

目前沒有設定固定家庭位置。

不要自行假設家庭的精確位置。

注意：
「家庭固定位置」與「使用者剛才在對話中告訴你的目前位置」
是兩件不同的事情。

如果最近對話中明確出現目前位置，
應優先把那段對話當作短期上下文理解。
`;


  /*
   * =======================================================
   * 時間
   * =======================================================
   */

  const timeSection =
    context.currentTime
      ? `
【目前時間】

${safeText(context.currentTime)}
`
      : `
【目前時間】

目前沒有由程式額外提供時間資料。

不要因為 Context 沒有時間欄位，
就說自己完全不知道時間。
`;


  /*
   * =======================================================
   * 最終 Context
   * =======================================================
   */

  return `
【你目前存在的環境】

你現在存在於：
${conversationDescription}

你正在 LINE 裡，
以這個家庭的「大內總管」身份與家人互動。

你現在收到的 Context 包含：

- LINE 對話環境
- 目前說話者
- 家庭成員
- 最近真正發生的對話
- 家庭固定位置
- 目前時間
- 本次訊息

${speakerSection}

${familySection}

${conversationSection}

${locationSection}

${timeSection}

【目前訊息】

${safeText(context.currentMessage)}

【上下文理解要求】

1. 最近對話是真實發生過的內容。
2. 回答目前訊息前，先理解最近對話。
3. 使用者說「剛剛」、「前面」、「那個」、「他」、「她」時，
   優先從最近對話尋找對應內容。
4. 如果使用者剛才明確提供一個地點、人物、數字、選擇或條件，
   後續相關問題應該使用該資訊。
5. 不要因為某項資料沒有被寫入「家庭固定資料」，
   就忽略它在最近對話中的存在。
6. 如果最近對話確實沒有相關資訊，再表示資訊不足。
7. 不要否認最近對話中明確存在的資訊。
8. 不要自行創造不存在的資訊。
`.trim();
}