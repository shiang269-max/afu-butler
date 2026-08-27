import {
  getActiveStyle,
} from '../style-state';

import {
  getActiveCallNames,
  getActiveCallNamesText,
} from '../call-names';


export interface StyleResponseOptions {
  preserveContent?: boolean;
}


/**
 * =========================================================
 * Style 回覆詞彙轉換
 * =========================================================
 *
 * 原有功能模組中，部分固定回覆文字仍使用舊宮廷詞彙：
 *
 * - 主上
 * - 奴才
 * - 喳
 * - 總管
 *
 * 這裡統一依照目前 Active Style
 * 將「角色稱呼」轉換成目前風格。
 *
 * 重要：
 *
 * - 不修改功能邏輯
 * - 不修改提醒內容
 * - 不修改投票內容
 * - 不修改使用者資料
 * - 只處理系統固定回覆中的角色詞彙
 *
 * preserveContent = true 時：
 *
 * 仍保留原本內容與功能資訊，
 * 只進行必要的角色詞彙轉換。
 *
 * =========================================================
 */

export function buildStyleResponse(
  content: string,
  options: StyleResponseOptions = {},
): string {

  const activeStyle =
    getActiveStyle();


  if (
    activeStyle.id === 'palace'
  ) {

    return content;

  }


  const replacements:
    Array<
      [
        string,
        string,
      ]
    > =
    [];


  switch (
    activeStyle.id
  ) {

    /**
     * =====================================================
     * 西方貴族
     * =====================================================
     */

    case 'aristocracy':

      replacements.push(
        ['主上', '主人'],
        ['奴才', '管家'],
        ['喳', '遵命'],
        ['總管', '管家'],
      );

      break;


    /**
     * =====================================================
     * 海盜
     * =====================================================
     */

    case 'pirate':

      replacements.push(
        ['主上', '船長'],
        ['奴才', '水手'],
        ['喳', '收到'],
        ['總管', '水手'],
      );

      break;


    /**
     * =====================================================
     * 童話世界
     * =====================================================
     */

    case 'fairy_tale':

      replacements.push(
        ['主上', '主人'],
        ['奴才', '小精靈'],
        ['喳', '知道了'],
        ['總管', '小精靈'],
      );

      break;


    /**
     * =====================================================
     * 太空艦隊
     * =====================================================
     */

    case 'space_fleet':

      replacements.push(
        ['主上', '艦長'],
        ['奴才', '艦橋'],
        ['喳', '收到'],
        ['總管', '艦橋'],
      );

      break;


    /**
     * =====================================================
     * 軍事指揮部
     * =====================================================
     */

    case 'military_command':

      replacements.push(
        ['主上', '指揮官'],
        ['奴才', '勤務'],
        ['喳', '收到'],
        ['總管', '勤務'],
      );

      break;


    default:

      return content;

  }


  let result =
    content;


  for (
    const [
      from,
      to,
    ]
    of
    replacements
  ) {

    result =
      result
        .split(
          from,
        )
        .join(
          to,
        );

  }


  void options;


  return result;

}


/**
 * =========================================================
 * 提醒回覆
 * =========================================================
 */

export function buildReminderResponse(
  content: string,
): string {

  return buildStyleResponse(
    content,
    {
      preserveContent: true,
    },
  );

}


/**
 * =========================================================
 * 投票回覆
 * =========================================================
 */

export function buildVoteResponse(
  content: string,
): string {

  return buildStyleResponse(
    content,
    {
      preserveContent: true,
    },
  );

}


/**
 * =========================================================
 * 位置回覆
 * =========================================================
 */

export function buildLocationResponse(
  content: string,
): string {

  return buildStyleResponse(
    content,
    {
      preserveContent: true,
    },
  );

}


/**
 * =========================================================
 * 錯誤回覆
 * =========================================================
 */

export function buildErrorResponse(
  content: string,
): string {

  return buildStyleResponse(
    content,
    {
      preserveContent: true,
    },
  );

}


export interface StyleFunctionHelpResponse {
  functionList: string;
  voteDetail: string;
  reminderDetail: string;
  locationDetail: string;
  styleSwitchDetail: string;
  callNamesDetail: string;
  intro: string;
  outro: string;
}


/**
 * =========================================================
 * 目前 Style 功能說明
 * =========================================================
 *
 * 這裡提供固定功能說明文字。
 *
 * 呼叫詞不硬編碼：
 *
 * - 永久通用呼叫詞
 * - 目前 Active Style 專屬呼叫詞
 *
 * 都直接讀取目前狀態。
 *
 * =========================================================
 */

export function getActiveFunctionHelpResponse():
  StyleFunctionHelpResponse {

  const activeStyle =
    getActiveStyle();


  const activeCallNames =
    getActiveCallNames();


  const primaryCallName =
    activeCallNames[0] ||
    '阿福';


  return {

    /**
     * =====================================================
     * 功能列表
     * =====================================================
     */

    functionList: [
      '📖 目前可以幫大家處理：',

      '',

      '1️⃣ 🗳️ 投票',
      '設定與管理群組投票。',

      '',

      '2️⃣ ⏰ 提醒',
      '設定指定時間的提醒。',

      '',

      '3️⃣ 📍 位置',
      '分享或查詢位置相關功能。',

      '',

      '4️⃣ 🎭 切換',
      '查看與切換目前使用的角色風格。',

      '',

      '5️⃣ 🏷️ 呼叫詞',
      '查看目前風格可以使用哪些稱呼。',

      '',

      '直接回覆「1～5」或功能名稱即可查看詳細說明。',

      '',

      '想知道詳細用法，也可以直接問：',
      `「${primaryCallName}，投票怎麼用」`,
      `「${primaryCallName}，提醒怎麼用」`,
      `「${primaryCallName}，位置怎麼用」`,
      `「${primaryCallName}，切換怎麼用」`,
      `「${primaryCallName}，可以怎麼叫你」`,
    ].join(
      '\n',
    ),


    /**
     * =====================================================
     * 投票
     * =====================================================
     */

    voteDetail: [
      '🗳️ 投票功能',

      '',

      '可以直接告訴我你想投什麼。',

      '例如：',
      `「${primaryCallName}，幫我們投票晚餐吃什麼」`,

      '',

      '接著依照提示提供候選項目與參與人數即可。',
    ].join(
      '\n',
    ),


    /**
     * =====================================================
     * 提醒
     * =====================================================
     */

    reminderDetail: [
      '⏰ 提醒功能',

      '',

      '可以直接告訴我要提醒什麼，以及什麼時候提醒。',

      '例如：',
      `「${primaryCallName}，明天早上 8 點提醒我吃藥」`,
    ].join(
      '\n',
    ),


    /**
     * =====================================================
     * 位置
     * =====================================================
     */

    locationDetail: [
      '📍 位置功能',

      '',

      '可以直接詢問位置相關資訊。',

      '例如：',
      `「${primaryCallName}，我現在在哪裡」`,
      `或直接提供位置資訊讓${primaryCallName}協助處理。`,
    ].join(
      '\n',
    ),


    /**
     * =====================================================
     * Style 切換
     * =====================================================
     */

    styleSwitchDetail: [
      '🎭 風格切換',

      '',

      `目前使用的是「${activeStyle.name}」風格。`,

      '',

      '可以直接詢問目前有哪些風格可以使用，',
      '或直接告訴我要切換成哪一種風格。',

      '例如：',
      `「${primaryCallName}，有哪些風格」`,
      `「${primaryCallName}，切換成海盜」`,
    ].join(
      '\n',
    ),


    /**
     * =====================================================
     * 呼叫詞
     * =====================================================
     */

    callNamesDetail: [
      '🏷️ 目前可用呼叫詞',

      '',

      `目前使用的是「${activeStyle.name}」風格。`,

      '',

      '目前可以這樣叫我：',
      getActiveCallNamesText(),

      '',

      '不論目前切換成哪一種風格，',
      '「阿福」都可以使用。',
    ].join(
      '\n',
    ),


    intro: '',


    outro: '',
  };

}