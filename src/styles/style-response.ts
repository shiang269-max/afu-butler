import {
  getActiveStyle,
} from '../style-state';

import {
  getActiveCallNames,
  getActiveCallNamesText,
} from '../call-names';

export interface StyleResponseOptions { preserveContent?: boolean; }

export function buildStyleResponse(content: string, options: StyleResponseOptions = {}): string {
  const activeStyle = getActiveStyle();
  if (activeStyle.id === 'palace') return content;
  const replacements: Array<[string, string]> = [];
  switch (activeStyle.id) {
    case 'aristocracy': replacements.push(['主上', '主人'], ['奴才', '管家'], ['喳', '遵命'], ['總管', '管家']); break;
    case 'pirate': replacements.push(['主上', '船長'], ['奴才', '水手'], ['喳', '收到'], ['總管', '水手']); break;
    case 'fairy_tale': replacements.push(['主上', '主人'], ['奴才', '小精靈'], ['喳', '知道了'], ['總管', '小精靈']); break;
    case 'space_fleet': replacements.push(['主上', '艦長'], ['奴才', '艦橋'], ['喳', '收到'], ['總管', '艦橋']); break;
    case 'military_command': replacements.push(['主上', '指揮官'], ['奴才', '勤務'], ['喳', '收到'], ['總管', '勤務']); break;
    default: return content;
  }
  let result = content;
  for (const [from, to] of replacements) result = result.split(from).join(to);
  void options;
  return result;
}

export function buildReminderResponse(content: string): string { return buildStyleResponse(content, { preserveContent: true }); }
export function buildVoteResponse(content: string): string { return buildStyleResponse(content, { preserveContent: true }); }
export function buildLocationResponse(content: string): string { return buildStyleResponse(content, { preserveContent: true }); }
export function buildErrorResponse(content: string): string { return buildStyleResponse(content, { preserveContent: true }); }

export interface StyleFunctionHelpResponse {
  functionList: string;
  voteDetail: string;
  reminderDetail: string;
  locationDetail: string;
  memoryDetail: string;
  styleSwitchDetail: string;
  callNamesDetail: string;
  intro: string;
  outro: string;
}

export function getActiveFunctionHelpResponse(): StyleFunctionHelpResponse {
  const activeStyle = getActiveStyle();
  const activeCallNames = getActiveCallNames();
  const primaryCallName = activeCallNames[0] || '阿福';

  return {
    functionList: [
      '📖 目前可以幫大家處理：', '',
      '1️⃣ 🗳️ 投票', '設定與管理群組投票。', '',
      '2️⃣ ⏰ 提醒', '設定指定時間的提醒。', '',
      '3️⃣ 📍 位置', '分享或查詢位置相關功能。', '',
      '4️⃣ 🧠 記憶', '記住、查詢、修改與取消家庭成員的記憶，也可記錄生活數據並查看平均值與趨勢。', '',
      '5️⃣ 🎭 切換', '查看與切換目前使用的角色風格。', '',
      '6️⃣ 🏷️ 呼叫詞', '查看目前風格可以使用哪些稱呼。', '',
      '直接回覆「1～6」或功能名稱即可查看詳細說明。', '',
      '想知道詳細用法，也可以直接問：',
      `「${primaryCallName}，投票怎麼用」`, `「${primaryCallName}，提醒怎麼用」`,
      `「${primaryCallName}，位置怎麼用」`, `「${primaryCallName}，記憶怎麼用」`,
      `「${primaryCallName}，切換怎麼用」`, `「${primaryCallName}，可以怎麼叫你」`,
    ].join('\n'),

    voteDetail: ['🗳️ 投票功能', '', '可以直接告訴我你想投什麼。', '例如：', `「${primaryCallName}，幫我們投票晚餐吃什麼」`, '', '接著依照提示提供候選項目與參與人數即可。'].join('\n'),
    reminderDetail: ['⏰ 提醒功能', '', '可以直接告訴我要提醒什麼，以及什麼時候提醒。', '例如：', `「${primaryCallName}，明天早上 8 點提醒我吃藥」`].join('\n'),
    locationDetail: ['📍 位置功能', '', '可以直接詢問位置相關資訊。', '例如：', `「${primaryCallName}，我現在在哪裡」`, `或直接提供位置資訊讓${primaryCallName}協助處理。`].join('\n'),
    memoryDetail: [
      '🧠 記憶功能', '',
      '可以記住家庭成員的喜好與重要資訊，也可以查詢、修改或取消已記住的內容。', '',
      '例如：',
      `「${primaryCallName}，記住媽媽喜歡吃火鍋」`,
      `「${primaryCallName}，媽媽喜歡什麼」`,
      `「${primaryCallName}，記住辰喜歡吃肉」`, '',
      '也可以記錄生活數據，並查詢平均值與趨勢。',
      `例如：「${primaryCallName}，記錄爸爸體重 70 公斤」`, '',
      '查詢後如果有列出編號，下一句可以使用「取消 N」或「修改 N 為新內容」。',
    ].join('\n'),
    styleSwitchDetail: ['🎭 風格切換', '', `目前使用的是「${activeStyle.name}」風格。`, '', '可以直接詢問目前有哪些風格可以使用，', '或直接告訴我要切換成哪一種風格。', '例如：', `「${primaryCallName}，有哪些風格」`, `「${primaryCallName}，切換成海盜」`].join('\n'),
    callNamesDetail: ['🏷️ 目前可用呼叫詞', '', `目前使用的是「${activeStyle.name}」風格。`, '', '目前可以這樣叫我：', getActiveCallNamesText(), '', '不論目前切換成哪一種風格，', '「阿福」都可以使用。'].join('\n'),
    intro: '',
    outro: '',
  };
}
