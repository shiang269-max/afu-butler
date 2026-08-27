/**
 * =========================================================
 * Style Switch
 * =========================================================
 *
 * 負責：
 *
 * 1. 判斷是否為 Style 查詢／切換指令
 * 2. 取得目前 Style
 * 3. 取得所有可用 Style
 * 4. 建立一次性的 Style 選擇狀態
 * 5. 下一則訊息承接 Style 選擇
 * 6. 執行 Style 切換
 *
 * 支援：
 *
 * 開啟選單：
 *
 * - 阿福，切換風格
 * - 阿福，我要切換
 * - 阿福，我要換風格
 * - 阿福，風格切換
 * - 阿福，有哪些風格
 *
 * 選擇：
 *
 * - 1
 * - 2
 * - 西方貴族
 * - 海盜
 * - 取消
 *
 * 正式直接切換：
 *
 * - 阿福，切換成西方貴族
 * - 阿福，換成海盜
 * - 阿福，切換成 2
 *
 * =========================================================
 *
 * 重要：
 *
 * Style 選單不是永久模式。
 *
 * 開啟選單後：
 *
 * - 只允許下一則訊息進行選擇
 * - 選擇成功後立即結束
 * - 取消後立即結束
 * - 下一則不是有效選擇時立即結束
 * - 60 秒沒有下一則選擇時自動失效
 *
 * 不負責：
 *
 * - LINE Webhook
 * - AI
 * - Persona 回覆生成
 * - Style Registry 定義
 *
 * =========================================================
 */

import {
  getActiveCallNames,
  getActiveCallNamesText,
} from './call-names';

import {
  getActiveStyle,
  setActiveStyle,
} from './style-state';

import {
  getEnabledStyles,
  StyleDefinition,
} from './styles/style-registry';


/**
 * =========================================================
 * Style Selection State
 * =========================================================
 *
 * 目前 Style 選擇狀態。
 *
 * 第一階段採用記憶體狀態。
 *
 * Key：
 *
 * conversationKey
 *
 * 例如：
 *
 * - 群組 ID
 * - 私訊 User ID
 *
 * =========================================================
 */

interface PendingStyleSelection {

  expiresAt:
    number;

}


/**
 * =========================================================
 * Pending State Store
 * =========================================================
 */

const pendingStyleSelections =
  new Map<
    string,
    PendingStyleSelection
  >();


/**
 * =========================================================
 * Selection Timeout
 * =========================================================
 *
 * 60 秒。
 *
 * =========================================================
 */

const STYLE_SELECTION_TIMEOUT_MS =
  60 * 1000;


/**
 * =========================================================
 * Public Result
 * =========================================================
 */

export interface StyleSwitchResult {

  handled:
    boolean;

  changed:
    boolean;

  replyText?:
    string;

  style?:
    StyleDefinition;

  reason?:
    string;

}


/**
 * =========================================================
 * Normalization
 * =========================================================
 */

function normalizeText(
  message: string,
): string {

  return message
    .trim()
    .replace(
      /\s+/g,
      '',
    );

}


/**
 * =========================================================
 * Remove Call Name
 * =========================================================
 *
 * 只移除開頭的呼叫詞。
 *
 * 例如：
 *
 * 阿福，切換風格
 *
 * ↓
 *
 * 切換風格
 *
 * =========================================================
 */

function removeLeadingCallName(
  message: string,
): string {

  const text =
    message.trim();


  const callNames =
    getActiveCallNames()
      .slice()
      .sort(
        (
          a,
          b,
        ) =>
          b.length -
          a.length,
      );


  for (
    const callName
    of
    callNames
  ) {

    if (
      text.startsWith(
        callName,
      )
    ) {

      return text
        .slice(
          callName.length,
        )
        .replace(
          /^[\s，,、:：]+/,
          '',
        )
        .trim();

    }

  }


  return text;

}


/**
 * =========================================================
 * Build Style List
 * =========================================================
 */

export function buildStyleListReply():
  string {

  const activeStyle =
    getActiveStyle();


  const styles =
    getEnabledStyles();


  const lines: string[] = [

    `目前使用風格：${activeStyle.name}`,

    '',

    '🎭 目前可用的角色風格：',

    '',

  ];


  for (
    const [
      index,
      style,
    ]
    of
    styles.entries()
  ) {

    const number =
      index + 1;


    const isActive =
      style.id ===
      activeStyle.id;


    lines.push(
      `${isActive ? '▶️ ' : ''}${number}. ${style.name}${isActive ? '（目前使用中）' : ''}`,
    );


    lines.push(
      style.description,
    );


    lines.push(
      '',
    );

  }


  lines.push(
    '請直接回覆編號或風格名稱。',
  );


  lines.push(
    '例如：2、西方貴族',
  );


  lines.push(
    '輸入「取消」即可結束。',
  );


  lines.push(
    '此選擇將在 60 秒後自動結束。',
  );


  return lines
    .join(
      '\n',
    )
    .trim();

}


/**
 * =========================================================
 * Detect Style List Request
 * =========================================================
 */

function isStyleListRequest(
  text: string,
): boolean {

  const normalized =
    normalizeText(
      text,
    );


  return [

    '切換風格',
    '我要切換',
    '我要換風格',
    '風格切換',
    '切換角色',
    '角色風格',
    '有哪些風格',
    '有什麼風格',
    '風格有哪些',
    '角色有哪些',
    '風格列表',
    '角色列表',

  ].includes(
    normalized,
  );

}


/**
 * =========================================================
 * Find Style By Number
 * =========================================================
 */

function findStyleByNumber(
  text: string,
):
  StyleDefinition
  |
  null {

  const normalized =
    normalizeText(
      text,
    );


  const numberMatch =
    normalized.match(
      /^\d+$/,
    );


  if (
    !numberMatch
  ) {

    return null;

  }


  const number =
    Number(
      normalized,
    );


  if (
    !Number.isInteger(
      number,
    ) ||
    number < 1
  ) {

    return null;

  }


  const styles =
    getEnabledStyles();


  return (
    styles[
      number - 1
    ] ||
    null
  );

}


/**
 * =========================================================
 * Find Style By Name
 * =========================================================
 */

function findStyleByName(
  text: string,
):
  StyleDefinition
  |
  null {

  const normalized =
    normalizeText(
      text,
    );


  const styles =
    getEnabledStyles();


  for (
    const style
    of
    styles
  ) {

    const styleName =
      normalizeText(
        style.name,
      );


    if (
      normalized ===
      styleName
    ) {

      return style;

    }

  }


  return null;

}


/**
 * =========================================================
 * Find Requested Style
 * =========================================================
 *
 * 支援：
 *
 * 1. 純編號
 * 2. 純風格名稱
 *
 * =========================================================
 */

function findRequestedStyle(
  text: string,
):
  StyleDefinition
  |
  null {

  const byNumber =
    findStyleByNumber(
      text,
    );


  if (
    byNumber
  ) {

    return byNumber;

  }


  return findStyleByName(
    text,
  );

}


/**
 * =========================================================
 * Detect Style Switch Intent
 * =========================================================
 */

function hasStyleSwitchIntent(
  text: string,
): boolean {

  const normalized =
    normalizeText(
      text,
    );


  const keywords = [

    '切換成',
    '切換到',
    '換成',
    '換到',
    '改成',
    '改用',
    '使用',

  ];


  return keywords.some(
    (
      keyword,
    ) =>
      normalized.includes(
        keyword,
      ),
  );

}


/**
 * =========================================================
 * Extract Style From Command
 * =========================================================
 *
 * 例如：
 *
 * 切換成西方貴族
 *
 * ↓
 *
 * 西方貴族
 *
 * =========================================================
 */

function extractStyleTarget(
  text: string,
): string {

  const normalized =
    normalizeText(
      text,
    );


  const prefixes = [

    '切換成',
    '切換到',
    '換成',
    '換到',
    '改成',
    '改用',
    '使用',

  ];


  for (
    const prefix
    of
    prefixes
  ) {

    if (
      normalized.startsWith(
        prefix,
      )
    ) {

      return normalized
        .slice(
          prefix.length,
        )
        .trim();

    }

  }


  return normalized;

}


/**
 * =========================================================
 * Open Pending Selection
 * =========================================================
 */

function openPendingStyleSelection(
  conversationKey: string,
): void {

  pendingStyleSelections.set(
    conversationKey,
    {

      expiresAt:
        Date.now() +
        STYLE_SELECTION_TIMEOUT_MS,

    },
  );

}


/**
 * =========================================================
 * Clear Pending Selection
 * =========================================================
 */

function clearPendingStyleSelection(
  conversationKey: string,
): void {

  pendingStyleSelections.delete(
    conversationKey,
  );

}


/**
 * =========================================================
 * Get Pending Selection
 * =========================================================
 *
 * 如果超過 60 秒，
 * 讀取時直接清除。
 *
 * =========================================================
 */

function getPendingStyleSelection(
  conversationKey: string,
):
  PendingStyleSelection
  |
  null {

  const pending =
    pendingStyleSelections.get(
      conversationKey,
    );


  if (
    !pending
  ) {

    return null;

  }


  if (
    Date.now() >
    pending.expiresAt
  ) {

    clearPendingStyleSelection(
      conversationKey,
    );


    return null;

  }


  return pending;

}


/**
 * =========================================================
 * Is Cancel Selection
 * =========================================================
 */

function isCancelSelection(
  message: string,
): boolean {

  const normalized =
    normalizeText(
      message,
    );


  return [

    '取消',
    '結束',
    '不要了',
    '算了',
    '停止',

  ].includes(
    normalized,
  );

}


/**
 * =========================================================
 * Switch To Style
 * =========================================================
 */

function switchToStyle(
  requestedStyle: StyleDefinition,
): StyleSwitchResult {

  const activeStyle =
    getActiveStyle();


  if (
    activeStyle.id ===
    requestedStyle.id
  ) {

    return {

      handled:
        true,

      changed:
        false,

      style:
        requestedStyle,

      replyText:
        `目前已經是「${requestedStyle.name}」風格了。`,

      reason:
        'already-active',

    };

  }


  const changed =
    setActiveStyle(
      requestedStyle.id,
    );


  if (
    !changed
  ) {

    return {

      handled:
        true,

      changed:
        false,

      replyText:
        '總管暫時無法切換角色風格。',

      reason:
        'style-switch-failed',

    };

  }


  return {

    handled:
      true,

    changed:
      true,

    style:
      requestedStyle,

    replyText:
      [
        `角色風格已切換為「${requestedStyle.name}」。`,
        '',
        '目前可以這樣叫我：',
        getActiveCallNamesText(),
      ].join(
        '\n',
      ),

    reason:
      'style-switched',

  };

}


/**
 * =========================================================
 * Handle Pending Selection
 * =========================================================
 *
 * 選單開啟後，
 * 只處理下一則訊息。
 *
 * 無論成功、取消或無效，
 * 都會立即結束 Pending State。
 *
 * =========================================================
 */

function handlePendingStyleSelection(
  message: string,
  conversationKey: string,
): StyleSwitchResult {

  const pending =
    getPendingStyleSelection(
      conversationKey,
    );


  if (
    !pending
  ) {

    return {

      handled:
        false,

      changed:
        false,

      reason:
        'no-pending-selection',

    };

  }


  /*
   * 下一則訊息一進來，
   * 立刻結束這次選擇狀態。
   *
   * 避免一般聊天之後仍然保持切換模式。
   */

  clearPendingStyleSelection(
    conversationKey,
  );


  const text =
    removeLeadingCallName(
      message,
    );


  /*
   * 取消
   */

  if (
    isCancelSelection(
      text,
    )
  ) {

    return {

      handled:
        true,

      changed:
        false,

      replyText:
        '角色風格切換已取消。',

      reason:
        'style-selection-cancelled',

    };

  }


  /*
   * 純編號／純風格名稱
   */

  const requestedStyle =
    findRequestedStyle(
      text,
    );


  if (
    !requestedStyle
  ) {

    return {

      handled:
        false,

      changed:
        false,

      reason:
        'style-selection-invalid-next-message',

    };

  }


  return switchToStyle(
    requestedStyle,
  );

}


/**
 * =========================================================
 * Main Handler
 * =========================================================
 *
 * conversationKey：
 *
 * 群組：
 * groupId
 *
 * 私訊：
 * userId
 *
 * =========================================================
 */

export function handleStyleSwitch(
  message: string,
  conversationKey: string = 'default',
  hasTrigger: boolean = false,
  now: number = Date.now(),
): StyleSwitchResult {

  const originalText =
    message.trim();


  if (
    !originalText
  ) {

    return {

      handled:
        false,

      changed:
        false,

      reason:
        'empty-message',

    };

  }


  /*
   * ---------------------------------------------------------
   * 優先處理 Pending Selection
   * ---------------------------------------------------------
   *
   * 不需要呼叫詞。
   *
   * 但只承接下一則訊息。
   */

  const pending =
    getPendingStyleSelection(
      conversationKey,
    );


  if (
    pending
  ) {

    return handlePendingStyleSelection(
      originalText,
      conversationKey,
    );

  }


  /*
   * ---------------------------------------------------------
   * 沒有 Pending State 時，
   * 必須明確呼叫總管。
   * ---------------------------------------------------------
   */

  if (
    !hasTrigger
  ) {

    return {

      handled:
        false,

      changed:
        false,

      reason:
        'no-invocation',

    };

  }


  const text =
    removeLeadingCallName(
      originalText,
    );


  /*
   * ---------------------------------------------------------
   * 開啟 Style 選單
   * ---------------------------------------------------------
   */

  if (
    isStyleListRequest(
      text,
    )
  ) {

    openPendingStyleSelection(
      conversationKey,
    );


    return {

      handled:
        true,

      changed:
        false,

      replyText:
        buildStyleListReply(),

      reason:
        'style-selection-opened',

    };

  }


  /*
   * ---------------------------------------------------------
   * 直接切換
   *
   * 阿福，切換成西方貴族
   * 阿福，切換成 2
   * ---------------------------------------------------------
   */

  if (
    hasStyleSwitchIntent(
      text,
    )
  ) {

    const targetText =
      extractStyleTarget(
        text,
      );


    const requestedStyle =
      findRequestedStyle(
        targetText,
      );


    if (
      !requestedStyle
    ) {

      return {

        handled:
          true,

        changed:
          false,

        replyText:
          '總管目前找不到您指定的角色風格。請使用「阿福，切換風格」查看可用選項。',

        reason:
          'style-not-found',

      };

    }


    return switchToStyle(
      requestedStyle,
    );

  }


  /*
   * ---------------------------------------------------------
   * 不是 Style 功能
   * ---------------------------------------------------------
   */

  return {

    handled:
      false,

    changed:
      false,

    reason:
      'not-style-switch-request',

  };

}