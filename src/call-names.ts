/**
 * =====================================================
 * 總管呼叫詞統一管理
 * =====================================================
 */

import {
  getActiveStyle,
} from './style-state';

export const UNIVERSAL_CALL_NAMES = [
  '阿福',
] as const;

export const PALACE_CALL_NAMES = [
  '大內總管',
  '總管',
  '內內',
  '喳子',
  '渣子',
] as const;

export function getActiveStyleCallNames(): string[] {
  const activeStyle = getActiveStyle();
  const callNames = activeStyle.callNames;
  if (!Array.isArray(callNames)) return [];
  return [...callNames];
}

function isMemoryCommandLike(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  if (/^(?:阿福[，,、]?\s*)?(?:請)?(?:幫我)?(?:記住|記得|記下|保存|存下)/u.test(normalized)) {
    return true;
  }

  const body = normalized
    .replace(/^阿福[，,、]?\s*/u, '')
    .replace(/^(?:請)?(?:幫我)?\s*/u, '')
    .trim();

  if (/^(?:忘記|忘了|刪除記憶|不要記得|平均|趨勢|變化|上升還是下降)/u.test(body)) {
    return true;
  }

  return (
    /(?:什麼|甚麼|哪些|哪個|有沒有|嗎|喜歡|愛吃|愛喝|不吃|不喝|習慣|偏好|喜好|討厭|不喜歡|喜愛)/u.test(body) &&
    /(?:爸爸|媽媽|哥哥|姐姐|弟弟|妹妹|辰|我|娘娘|皇后|太子|辰王|老婆|妻子|大兒子|小兒子)/u.test(body)
  );
}

export function isMemoryCommand(message: string): boolean {
  return isMemoryCommandLike(message);
}

export function getActiveCallNames(): string[] {
  return [
    ...new Set([
      ...UNIVERSAL_CALL_NAMES,
      ...getActiveStyleCallNames(),
    ]),
  ];
}

export function hasCallName(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  if (isMemoryCommandLike(text)) {
    return true;
  }

  return getActiveCallNames().some((callName) =>
    text.includes(callName),
  );
}

export function cleanCallNames(message: string): string {
  let text = message;
  const callNames = [...getActiveCallNames()].sort(
    (a, b) => b.length - a.length,
  );

  for (const callName of callNames) {
    text = text.split(callName).join('');
  }

  return text
    .replace(/^[\s，,、：:；;。！？!?]+/, '')
    .trim();
}

export function getActiveCallNamesText(): string {
  return getActiveCallNames().join('、');
}

export function isCallNameHelpIntent(message: string): boolean {
  const rawText = message.replace(/\s+/g, '').trim();
  const text = cleanCallNames(message).replace(/\s+/g, '').trim();
  if (!rawText) return false;

  const patterns = [
    /可以怎麼叫你/,
    /可以怎樣叫你/,
    /能怎麼叫你/,
    /能怎樣叫你/,
    /怎麼叫你/,
    /怎樣叫你/,
    /怎麼稱呼你/,
    /怎樣稱呼你/,
    /怎麼呼叫你/,
    /怎樣呼叫你/,
    /可以怎麼稱呼你/,
    /可以怎樣稱呼你/,
    /可以怎麼呼叫你/,
    /可以怎樣呼叫你/,
    /你叫什麼/,
    /你叫甚麼/,
    /你叫啥/,
    /你的名字/,
    /你的名稱/,
    /你叫什麼名字/,
    /你叫甚麼名字/,
    /有哪些呼叫詞/,
    /有什麼呼叫詞/,
    /有那些呼叫詞/,
    /可以用哪些呼叫詞/,
    /可以用什麼呼叫詞/,
    /有哪些稱呼/,
    /有什麼稱呼/,
    /有那些稱呼/,
    /怎麼叫總管/,
    /怎麼稱呼總管/,
    /怎麼叫你們這個角色/,
    /這個角色叫什麼/,
    /這個風格叫什麼/,
    /這個風格怎麼叫你/,
  ];

  return patterns.some((pattern) => pattern.test(text) || pattern.test(rawText));
}

export function buildActiveCallNamesHelpMessage(): string {
  const activeStyle = getActiveStyle();
  const activeStyleCallNames = getActiveStyleCallNames();

  return [
    `目前使用的是「${activeStyle.name}」風格。`,
    '',
    '固定都可以叫我：',
    UNIVERSAL_CALL_NAMES.join('、'),
    '',
    `目前「${activeStyle.name}」風格也可以這樣叫我：`,
    activeStyleCallNames.join('、'),
  ].join('\n');
}
