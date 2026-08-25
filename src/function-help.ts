export type FunctionHelpResult = {
  handled: boolean;
  reply?: string;
};


type FunctionDefinition = {
  id: string;
  name: string;
  keywords: string[];
  summary: string;
  detail: string;
};


const FUNCTIONS: FunctionDefinition[] = [
  {
    id: 'vote',
    name: '投票',
    keywords: [
      '投票',
    ],
    summary:
      '建立群組投票，由系統協助整理候選項目、進行投票並統計結果。',
    detail: [
      '【投票】',
      '',
      '可以用來決定群組內的任何事情，例如：',
      '晚餐吃什麼、今天玩什麼、晚上去哪裡、要不要出門等。',
      '',
      '開始方式：',
      '直接加上呼叫詞後說明投票主題。',
      '',
      '例如：',
      '阿福，投票今天玩什麼遊戲',
      '阿福，投票晚上去哪裡',
      '阿福，投票決定晚餐吃什麼',
      '',
      '之後可以選擇：',
      '1. 大家自己提供候選項目',
      '2. 系統協助提供候選項目',
      '',
      '設定參與人數並開始後，',
      '參加者可以直接用數字或選項名稱投票，也可以改票。',
      '',
      '所有人完成投票後會自動結束，也可以手動結束。',
    ].join('\n'),
  },
  {
    id: 'reminder',
    name: '提醒',
    keywords: [
      '提醒',
      '提醒功能',
    ],
    summary:
      '建立、查詢、修改與取消提醒。',
    detail: [
      '【提醒】',
      '',
      '可以建立時間提醒，也可以查詢、修改或取消既有提醒。',
      '',
      '例如：',
      '阿福，明天早上提醒我倒垃圾',
      '阿福，下午五點提醒大家吃飯',
      '阿福，查看提醒',
      '阿福，取消第一個提醒',
      '',
      '提醒建立後，系統會依照確認流程完成設定。',
    ].join('\n'),
  },
  {
    id: 'location',
    name: '位置',
    keywords: [
      '位置',
      '定位',
      '位置功能',
    ],
    summary:
      '根據目前位置或固定位置進行位置相關操作。',
    detail: [
      '【位置】',
      '',
      '可以分享 LINE 位置，讓總管取得目前位置，',
      '也可以依目前位置或固定家附近進行相關操作。',
      '',
      '例如：',
      '直接分享 LINE 位置',
      '阿福，我現在在哪裡',
      '阿福，附近有什麼',
      '阿福，幫我找附近的店',
      '',
      '部分功能會依目前已保存的位置資料執行。',
    ].join('\n'),
  },
];


const FUNCTION_LIST_REPLY = [
  '目前可以直接使用的功能：',
  '',
  '1. 投票',
  '　建立群組投票、候選項目與投票統計。',
  '',
  '2. 提醒',
  '　建立、查詢、修改與取消提醒。',
  '',
  '3. 位置',
  '　位置分享、目前位置與附近相關操作。',
  '',
  '如果想知道其中一項，可以直接加上呼叫詞詢問。',
  '',
  '例如：',
  '阿福，投票',
  '阿福，提醒詳細說明',
  '阿福，位置可以做什麼',
].join('\n');


const LIST_INTENT_PATTERNS = [
  /^(?:有什麼|有哪些|目前有哪些|能做什麼|可以做什麼)(?:功能|功能可以用|可以使用)?$/,
  /^(?:功能|功能列表|功能清單|查看功能|查看有哪些功能)$/,
];


const HELP_INTENT_WORDS = [
  '怎麼用',
  '如何使用',
  '怎麼操作',
  '如何操作',
  '詳細',
  '詳細說明',
  '說明',
  '介紹',
  '可以做什麼',
  '能做什麼',
  '功能是什麼',
  '功能有哪些',
  '有什麼功能',
  '有什麼用',
  '用途',
  '效果',
];


const EXECUTION_PATTERNS = [
  /投票(?:決定|今天|今晚|晚上|中午|早餐|午餐|晚餐|要不要|是否|去哪|去哪裡|玩什麼|吃什麼)/,
  /提醒(?:我|大家|所有人|全家人|[0-9一二三四五六七八九十]+(?:點|時|分|天|週|星期|月))/,
  /(?:附近|家附近|現在在哪裡|我在哪裡)/,
];


function normalizeText(
  message: string,
): string {
  return message
    .trim()
    .replace(
      /^[\s，,、。！？!?.:：;；]+/,
      '',
    )
    .replace(
      /[，,、。！？!?.:：;；]+$/g,
      '',
    )
    .trim();
}


function removeKnownTriggerPrefix(
  message: string,
): string {
  return message
    .replace(
      /^(?:大內總管|總管|內內|喳子|渣子|阿福)[\s，,、。！？!?.:：;；]*/i,
      '',
    )
    .trim();
}


function findFunction(
  message: string,
): FunctionDefinition | null {
  for (const item of FUNCTIONS) {
    if (
      item.keywords.some(
        (keyword) =>
          message.includes(keyword),
      )
    ) {
      return item;
    }
  }

  return null;
}


function hasListIntent(
  message: string,
): boolean {
  return LIST_INTENT_PATTERNS.some(
    (pattern) =>
      pattern.test(message),
  );
}


function hasHelpIntent(
  message: string,
): boolean {
  return HELP_INTENT_WORDS.some(
    (word) =>
      message.includes(word),
  );
}


function hasExecutionIntent(
  message: string,
): boolean {
  return EXECUTION_PATTERNS.some(
    (pattern) =>
      pattern.test(message),
  );
}


export function handleFunctionHelp(
  message: string,
  hasTrigger: boolean,
): FunctionHelpResult {
  if (!hasTrigger) {
    return {
      handled: false,
    };
  }

  const normalized =
    normalizeText(
      removeKnownTriggerPrefix(
        message,
      ),
    );

  if (!normalized) {
    return {
      handled: false,
    };
  }

  if (
    hasListIntent(
      normalized,
    )
  ) {
    return {
      handled: true,
      reply:
        FUNCTION_LIST_REPLY,
    };
  }

  const targetFunction =
    findFunction(
      normalized,
    );

  if (!targetFunction) {
    return {
      handled: false,
    };
  }

  /*
   * =====================================================
   * 正式執行優先
   * =====================================================
   *
   * 例如：
   *
   * 投票今天玩什麼遊戲
   * 投票晚上去哪裡
   *
   * 不能被 Function Help 接管。
   * =====================================================
   */

  if (
    hasExecutionIntent(
      normalized,
    )
  ) {
    return {
      handled: false,
    };
  }

  /*
   * =====================================================
   * 只要明確提到已知功能名稱，
   * 就可以直接查看該功能說明。
   *
   * 例如：
   *
   * 投票
   * 投票怎麼用
   * 投票詳細說明
   * 投票可以做什麼
   * =====================================================
   */

  if (
    normalized === targetFunction.name ||
    hasHelpIntent(
      normalized,
    )
  ) {
    return {
      handled: true,
      reply:
        targetFunction.detail,
    };
  }

  return {
    handled: false,
  };
}