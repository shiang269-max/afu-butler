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
 * 4. 執行 Style 切換
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

    '🎭 目前可用的角色風格：',

    '',

  ];


  for (
    const style
    of
    styles
  ) {

    const isActive =
      style.id ===
      activeStyle.id;


    lines.push(
      `${isActive ? '▶️ ' : '・'}${style.name}${isActive ? '（目前使用中）' : ''}`,
    );


    lines.push(
      style.description,
    );


    lines.push(
      '',
    );

  }


  lines.push(
    '例如：',
  );


  for (
    const style
    of
    styles
  ) {

    lines.push(
      `「阿福，切換成${style.name}」`,
    );

  }


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
 * Find Requested Style
 * =========================================================
 */

function findRequestedStyle(
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
      normalized === styleName
    ) {

      return style;

    }


    if (
      normalized.includes(
        styleName,
      )
    ) {

      return style;

    }

  }


  return null;

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
    '換成',
    '切換到',
    '改成',
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
 * Main Handler
 * =========================================================
 */

export function handleStyleSwitch(
  message: string,
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


  const text =
    removeLeadingCallName(
      originalText,
    );


  /*
   * ---------------------------------------------------------
   * 查詢可用 Style
   * ---------------------------------------------------------
   */

  if (
    isStyleListRequest(
      text,
    )
  ) {

    return {

      handled:
        true,

      changed:
        false,

      replyText:
        buildStyleListReply(),

      reason:
        'style-list-request',

    };

  }


  /*
   * ---------------------------------------------------------
   * 不是切換意圖
   * ---------------------------------------------------------
   */

  if (
    !hasStyleSwitchIntent(
      text,
    )
  ) {

    return {

      handled:
        false,

      changed:
        false,

      reason:
        'not-style-switch-request',

    };

  }


  /*
   * ---------------------------------------------------------
   * 尋找目標 Style
   * ---------------------------------------------------------
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
        true,

      changed:
        false,

      replyText:
        [
          '總管目前找不到您指定的角色風格。',
          '',
          buildStyleListReply(),
        ].join(
          '\n',
        ),

      reason:
        'style-not-found',

    };

  }


  /*
   * ---------------------------------------------------------
   * 已經是目前 Style
   * ---------------------------------------------------------
   */

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


  /*
   * ---------------------------------------------------------
   * 執行切換
   * ---------------------------------------------------------
   */

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
      `角色風格已切換為「${requestedStyle.name}」。`,

    reason:
      'style-switched',

  };

}