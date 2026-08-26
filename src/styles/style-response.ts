export interface StyleResponseOptions {
  preserveContent?: boolean;
}


export function buildStyleResponse(
  content: string,
  options: StyleResponseOptions = {},
): string {

  void options;

  return content;

}


export interface StyleFunctionHelpResponse {
  functionList: string;
  voteDetail: string;
  reminderDetail: string;
  locationDetail: string;
  intro: string;
  outro: string;
}


export function getActiveFunctionHelpResponse(): StyleFunctionHelpResponse {

  return {
    functionList: [
      '📖 目前可以幫大家處理：',
      '',
      '🗳️ 投票',
      '設定與管理群組投票。',
      '',
      '⏰ 提醒',
      '設定指定時間的提醒。',
      '',
      '📍 位置',
      '分享或查詢位置相關功能。',
      '',
      '想知道詳細用法，可以直接問：',
      '「阿福，投票怎麼用」',
      '「阿福，提醒怎麼用」',
      '「阿福，位置怎麼用」',
    ].join(
      '\n',
    ),

    voteDetail: [
      '🗳️ 投票功能',
      '',
      '可以直接告訴總管你想投什麼。',
      '例如：',
      '「阿福，幫我們投票晚餐吃什麼」',
      '',
      '接著依照總管的提示提供候選項目與參與人數即可。',
    ].join(
      '\n',
    ),

    reminderDetail: [
      '⏰ 提醒功能',
      '',
      '可以直接告訴總管要提醒什麼，以及什麼時候提醒。',
      '例如：',
      '「阿福，明天早上 8 點提醒我吃藥」',
    ].join(
      '\n',
    ),

    locationDetail: [
      '📍 位置功能',
      '',
      '可以直接詢問位置相關資訊。',
      '例如：',
      '「阿福，我現在在哪裡」',
      '或直接提供位置資訊讓總管協助處理。',
    ].join(
      '\n',
    ),

    intro: '',

    outro: '',
  };

}