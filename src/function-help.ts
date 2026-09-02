import {
  cleanCallNames,
  buildActiveCallNamesHelpMessage,
} from './call-names';

import {
  getActiveFunctionHelpResponse,
} from './styles/style-response';

export type FunctionHelpResult = {
  handled: boolean;
  reply?: string;
};

type FunctionDefinition = {
  id: string;
  name: string;
  keywords: string[];
};

type FunctionHelpSelectionSession = {
  createdAt: number;
};

const FUNCTION_HELP_SELECTION_TIMEOUT_MS = 60 * 1000;

const functionHelpSelectionSessions = new Map<string, FunctionHelpSelectionSession>();

const FUNCTIONS: FunctionDefinition[] = [
  { id: 'vote', name: '投票', keywords: ['投票'] },
  { id: 'reminder', name: '提醒', keywords: ['提醒', '提醒功能'] },
  { id: 'location', name: '位置', keywords: ['位置', '定位', '位置功能'] },
  { id: 'memory', name: '記憶', keywords: ['記憶', '記憶功能'] },
  {
    id: 'style_switch',
    name: '切換',
    keywords: ['切換', '風格', '切換風格', '風格切換', '切換角色', '角色切換'],
  },
  { id: 'call_names', name: '呼叫詞', keywords: ['呼叫詞', '稱呼', '別稱', '名字'] },
];

const LIST_INTENT_PATTERNS = [
  /^(?:你)?(?:有什麼|有哪些|目前有哪些)(?:功能|功能可以用|可以使用)?$/,
  /^(?:你)?(?:能做什麼|可以做什麼|會做什麼|會什麼|能幹嘛|可以幹嘛|會幹嘛)$/,
  /^(?:功能|功能列表|功能清單|查看功能|查看有哪些功能|看功能)$/,
];

const CALL_NAMES_INTENT_PATTERNS = [
  /(?:可以|能|該)?怎麼叫你/, /怎麼稱呼你/, /怎麼稱呼/, /有哪些稱呼/, /有什麼稱呼/,
  /有哪些別稱/, /有什麼別稱/, /可以怎麼稱呼/, /可以怎麼叫/, /能怎麼叫你/,
  /該怎麼叫你/, /怎麼叫/, /你叫什麼/, /你叫什麼名字/, /叫你什麼/,
];

const HELP_INTENT_WORDS = [
  '怎麼用', '如何使用', '怎麼操作', '如何操作', '詳細', '詳細說明', '說明', '介紹',
  '可以做什麼', '能做什麼', '功能是什麼', '功能有哪些', '有什麼功能', '有什麼用', '用途', '效果',
];

const EXECUTION_PATTERNS = [
  /投票(?:決定|今天|今晚|晚上|中午|早餐|午餐|晚餐|要不要|是否|去哪|去哪裡|玩什麼|吃什麼)/,
  /提醒(?:我|大家|所有人|全家人|[0-9一二三四五六七八九十]+(?:點|時|分|天|週|星期|月))/,
  /(?:附近|家附近|現在在哪裡|我在哪裡)/,
];

function normalizeText(message: string): string {
  return message.trim().replace(/^[\s，,、。！？!?.:：;；]+/, '').replace(/[，,、。！？!?.:：;；]+$/g, '').trim();
}

function removeKnownTriggerPrefix(message: string): string {
  return cleanCallNames(message);
}

function isCallNamesIntent(message: string): boolean {
  const normalized = normalizeText(message);
  return CALL_NAMES_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function findFunction(message: string): FunctionDefinition | null {
  if (isCallNamesIntent(message)) {
    return FUNCTIONS.find((item) => item.id === 'call_names') || null;
  }
  for (const item of FUNCTIONS) {
    if (item.keywords.some((keyword) => message.includes(keyword))) return item;
  }
  return null;
}

function findFunctionBySelection(message: string): FunctionDefinition | null {
  const normalized = normalizeText(message);
  const numericIndex = Number(normalized);
  if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= FUNCTIONS.length) {
    return FUNCTIONS[numericIndex - 1] || null;
  }
  if (isCallNamesIntent(normalized)) {
    return FUNCTIONS.find((item) => item.id === 'call_names') || null;
  }
  for (const item of FUNCTIONS) {
    if (item.keywords.some((keyword) => normalized === keyword)) return item;
  }
  return null;
}

function hasListIntent(message: string): boolean {
  const normalized = normalizeText(message);
  return LIST_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasHelpIntent(message: string): boolean {
  return HELP_INTENT_WORDS.some((word) => message.includes(word));
}

function hasExecutionIntent(message: string): boolean {
  return EXECUTION_PATTERNS.some((pattern) => pattern.test(message));
}

function createSelectionSession(contextId: string): void {
  if (!contextId) return;
  const session: FunctionHelpSelectionSession = { createdAt: Date.now() };
  functionHelpSelectionSessions.set(contextId, session);
  setTimeout(() => {
    const currentSession = functionHelpSelectionSessions.get(contextId);
    if (currentSession === session) functionHelpSelectionSessions.delete(contextId);
  }, FUNCTION_HELP_SELECTION_TIMEOUT_MS);
}

function clearSelectionSession(contextId: string): void {
  if (contextId) functionHelpSelectionSessions.delete(contextId);
}

export function hasActiveFunctionHelpSession(contextId: string): boolean {
  if (!contextId) return false;
  const session = functionHelpSelectionSessions.get(contextId);
  if (!session) return false;
  if (Date.now() - session.createdAt >= FUNCTION_HELP_SELECTION_TIMEOUT_MS) {
    clearSelectionSession(contextId);
    return false;
  }
  return true;
}

function getFunctionHelpReply(functionId: string): string {
  const response = getActiveFunctionHelpResponse();
  switch (functionId) {
    case 'vote': return response.voteDetail;
    case 'reminder': return response.reminderDetail;
    case 'location': return response.locationDetail;
    case 'memory': return response.memoryDetail;
    case 'style_switch': return response.styleSwitchDetail;
    case 'call_names': return response.callNamesDetail || buildActiveCallNamesHelpMessage();
    default: return '';
  }
}

function handleSelectionSession(message: string, contextId: string): FunctionHelpResult {
  if (!hasActiveFunctionHelpSession(contextId)) return { handled: false };
  const normalized = normalizeText(removeKnownTriggerPrefix(message));
  const targetFunction = findFunctionBySelection(normalized);
  clearSelectionSession(contextId);
  if (!targetFunction) return { handled: false };
  if (hasExecutionIntent(normalized)) return { handled: false };
  return { handled: true, reply: getFunctionHelpReply(targetFunction.id) };
}

export function handleFunctionHelp(message: string, hasTrigger: boolean, contextId = ''): FunctionHelpResult {
  const selectionResult = handleSelectionSession(message, contextId);
  if (selectionResult.handled) return selectionResult;
  if (!hasTrigger) return { handled: false };

  const normalized = normalizeText(removeKnownTriggerPrefix(message));
  if (!normalized) return { handled: false };

  if (hasListIntent(normalized)) {
    createSelectionSession(contextId);
    const response = getActiveFunctionHelpResponse();
    return { handled: true, reply: response.functionList };
  }

  const targetFunction = findFunction(normalized);
  if (!targetFunction) return { handled: false };
  if (hasExecutionIntent(normalized)) return { handled: false };

  if (targetFunction.id === 'call_names') {
    return { handled: true, reply: getFunctionHelpReply(targetFunction.id) };
  }

  if (normalized === targetFunction.name || hasHelpIntent(normalized)) {
    return { handled: true, reply: getFunctionHelpReply(targetFunction.id) };
  }

  return { handled: false };
}

export function clearFunctionHelpSession(contextId: string): void {
  clearSelectionSession(contextId);
}
