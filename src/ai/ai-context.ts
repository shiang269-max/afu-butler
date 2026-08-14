/**
 * =========================================================
 * AI Context
 * =========================================================
 *
 * 這個檔案只負責整理「總管大腦」需要知道的環境資訊。
 *
 * 它不負責：
 * - 呼叫 Gemini
 * - 發送 LINE 訊息
 * - @任何人
 * - 記憶保存
 * - 排程
 *
 * 它只回答一件事情：
 *
 * 「如果現在把這個家庭的情況交給 AI，
 *   AI 應該知道哪些背景？」
 *
 * =========================================================
 */

/**
 * LINE 對話環境
 */
export type AiConversationType =
  | 'private'
  | 'group';

/**
 * 家庭成員在 AI 情境中的基本資料。
 *
 * 注意：
 * 這裡故意不直接依賴目前 family.ts 的型別。
 * 第一階段先讓 AI Context 成為獨立模組，
 * 後面再逐步接回現有家庭資料。
 */
export interface AiFamilyMemberContext {
  userId: string;

  /**
   * 家庭中的身份，例如：
   * 主上、老佛爺、大兒子、小兒子
   */
  identity: string;

  /**
   * 家庭角色。
   */
  role?: string;

  /**
   * 家庭地位。
   */
  authority?: string;

  /**
   * 個性。
   */
  personality?: string;

  /**
   * 互動方式。
   */
  interaction?: string;

  /**
   * 總管對此人的稱呼。
   */
  mentionName?: string;
}

/**
 * 一則短期對話訊息。
 *
 * 目前專案已經有最近 12 則訊息的記憶，
 * 這裡只是提供一個 AI 可以理解的標準格式。
 */
export interface AiConversationMessage {
  role: 'user' | 'assistant';

  /**
   * LINE User ID。
   *
   * assistant 訊息可以沒有 userId。
   */
  userId?: string;

  /**
   * 家庭身份。
   */
  identity?: string;

  /**
   * 訊息內容。
   */
  content: string;

  /**
   * 訊息發生時間。
   *
   * 可以沒有。
   */
  timestamp?: string;
}

/**
 * 家庭位置。
 *
 * 目前先不強制要求。
 *
 * 未來可以支援：
 *
 * 「喳子，記住我們家在板橋。」
 *
 * 然後讓總管知道：
 *
 * 「附近」預設是什麼地方。
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
 * AI 總管目前所處的完整環境。
 *
 * 這是未來 ai-core.ts 最重要的輸入之一。
 */
export interface AiContext {
  /**
   * AI 現在在哪一種 LINE 對話中。
   */
  conversationType: AiConversationType;

  /**
   * LINE 群組 ID。
   *
   * 私訊時沒有。
   */
  groupId?: string;

  /**
   * 目前說話者的 LINE User ID。
   */
  speakerUserId?: string;

  /**
   * 目前說話者的家庭資料。
   */
  speaker?: AiFamilyMemberContext;

  /**
   * 家庭成員列表。
   */
  familyMembers: AiFamilyMemberContext[];

  /**
   * 最近的短期對話。
   *
   * 目前預設就是現有的 12 則上下文，
   * 但這裡不把 12 寫死。
   */
  recentMessages: AiConversationMessage[];

  /**
   * 家庭預設位置。
   */
  location?: AiLocationContext;

  /**
   * AI 收到這則訊息時的時間。
   *
   * 這個欄位之後會由真正的時間工具提供。
   *
   * 注意：
   * Context 只是「提供資料」，
   * 不自己猜現在時間。
   */
  currentTime?: string;

  /**
   * 使用者這次送進來的原始訊息。
   */
  currentMessage: string;

  /**
   * 是否為群組訊息。
   */
  isGroup: boolean;

  /**
   * 是否為私訊。
   */
  isPrivate: boolean;
}

/**
 * 建立 AI Context 的輸入資料。
 *
 * 這個型別讓 index.ts 未來可以很容易把
 * 現有資料交給 AI Context。
 */
export interface BuildAiContextInput {
  conversationType: AiConversationType;

  groupId?: string;

  speakerUserId?: string;

  speaker?: AiFamilyMemberContext;

  familyMembers?: AiFamilyMemberContext[];

  recentMessages?: AiConversationMessage[];

  location?: AiLocationContext;

  currentTime?: string;

  currentMessage: string;
}

/**
 * 建立標準化的 AI Context。
 *
 * 目前不做任何 AI 判斷。
 *
 * 也不會：
 * - 判斷使用者是不是在叫總管
 * - 判斷要不要回覆
 * - 判斷要不要搜尋
 * - 判斷要不要 @人
 *
 * 這些都應該交給後面的 AI Core。
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
 * 將 Context 轉成給 AI 閱讀的文字
 * =========================================================
 *
 * 注意：
 *
 * 這裡不是「回答規則」。
 *
 * 只是把環境資訊整理成人類／AI 容易理解的格式。
 *
 * 未來 Gemini 收到的核心概念會類似：
 *
 * 「你現在正在 LINE 家庭群組中。
 *  這是目前正在跟你說話的人。
 *  這是最近的對話。
 *  這是家庭背景。
 *  請理解整體情境後自行決定如何處理。」
 *
 * 而不是：
 *
 * 「看到天氣就做 A，
 *  看到晚安就做 B。」
 */
export function buildAiContextPrompt(
  context: AiContext,
): string {
  const conversationDescription =
    context.isGroup
      ? 'LINE 家庭群組'
      : 'LINE 私訊';

  const speakerSection =
    context.speaker
      ? `
【目前說話者】

LINE User ID：
${context.speaker.userId}

家庭身份：
${context.speaker.identity}

家庭角色：
${context.speaker.role ?? '未設定'}

家庭地位：
${context.speaker.authority ?? '未設定'}

個性：
${context.speaker.personality ?? '未設定'}

互動方式：
${context.speaker.interaction ?? '未設定'}

總管對此人的稱呼：
${context.speaker.mentionName ?? '未設定'}
`
      : `
【目前說話者】

目前沒有對應到已登記的家庭成員。
不要自行猜測其家庭身份。
`;

  const familySection =
    context.familyMembers.length > 0
      ? `
【家庭成員】

${context.familyMembers
  .map((member) => {
    return `
- ${member.identity}
  LINE User ID：${member.userId}
  家庭角色：${member.role ?? '未設定'}
  家庭地位：${member.authority ?? '未設定'}
  總管稱呼：${member.mentionName ?? '未設定'}
`.trim();
  })
  .join('\n')}
`
      : `
【家庭成員】

目前沒有可提供的家庭成員資料。
`;

  const conversationSection =
    context.recentMessages.length > 0
      ? `
【最近的 LINE 對話】

${context.recentMessages
  .map((message) => {
    const speakerName =
      message.identity ??
      (message.role === 'assistant'
        ? '總管'
        : '家庭成員');

    return `${speakerName}：${message.content}`;
  })
  .join('\n')}
`
      : `
【最近的 LINE 對話】

目前沒有其他短期對話資料。
`;

  const locationSection =
    context.location
      ? `
【家庭／目前位置】

名稱：
${context.location.name ?? '未設定'}

城市：
${context.location.city ?? '未設定'}

行政區：
${context.location.district ?? '未設定'}

地址：
${context.location.address ?? '未設定'}
`
      : `
【家庭／目前位置】

目前沒有設定位置。
不要自行假設使用者的 GPS 位置。
`;

  const timeSection =
    context.currentTime
      ? `
【目前時間】

${context.currentTime}
`
      : `
【目前時間】

目前尚未提供可靠的即時時間。
不要自行猜測現在時間。
`;

  return `
【LINE 對話環境】

你目前存在於：
${conversationDescription}

你不是在獨立的聊天視窗中回答。
你正在這個家庭的 LINE 對話環境中與家人互動。

你應該理解：
- 誰正在跟你說話
- 這一家人的家庭關係
- 最近正在討論什麼
- 使用者這次真正想表達什麼
- 「這個」、「那個」、「附近」、「他」、「她」等詞在目前上下文中可能指向什麼

你不是只能等待固定關鍵字才能回答。
你應該把自己視為這個家庭中的大內總管，正常理解並參與對話。

${speakerSection}

${familySection}

${conversationSection}

${locationSection}

${timeSection}

【目前收到的訊息】

${context.currentMessage}
`.trim();
}