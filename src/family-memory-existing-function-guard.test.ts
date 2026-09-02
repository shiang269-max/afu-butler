import { detectExistingFunctionMatch, hasReminderLikeSignal } from './family-memory-existing-function-guard';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('Vote 已 handled 時 Memory 必須退讓', () => {
  const result = detectExistingFunctionMatch('幫我開投票', {
    voteHandled: true,
  });

  assert(result.matched, '應視為既有功能已認領');
  assert(result.reason === 'vote', '原因應為 vote');
});

test('Reminder 已 handled 時 Memory 必須退讓', () => {
  const result = detectExistingFunctionMatch('提醒我明天買牛奶', {
    reminderHandled: true,
  });

  assert(result.matched, '應視為既有功能已認領');
  assert(result.reason === 'reminder', '原因應為 reminder');
});

test('Location 已 handled 時 Memory 必須退讓', () => {
  const result = detectExistingFunctionMatch('附近有什麼咖啡廳', {
    locationHandled: true,
  });

  assert(result.matched, '應視為既有功能已認領');
  assert(result.reason === 'location', '原因應為 location');
});

test('Function Help 已 handled 時 Memory 必須退讓', () => {
  const result = detectExistingFunctionMatch('有哪些功能', {
    functionHelpHandled: true,
  });

  assert(result.matched, '應視為既有功能已認領');
  assert(result.reason === 'function-help', '原因應為 function-help');
});

test('沒有既有功能 handled 時 Guard 不應攔截 Memory', () => {
  const result = detectExistingFunctionMatch('記住爸爸不吃香菜');

  assert(!result.matched, '不應攔截');
});

test('handled 訊號同時存在時，以已知既有功能優先', () => {
  const result = detectExistingFunctionMatch('提醒我', {
    voteHandled: true,
    reminderHandled: true,
  });

  assert(result.matched, '應視為已認領');
  assert(result.reason === 'vote', '應固定由第一優先序原因回報');
});

test('Reminder 保守訊號只能作為訊號，不代表已 handled', () => {
  assert(
    hasReminderLikeSignal('提醒我明天買牛奶'),
    '應辨識為 Reminder-like 訊號',
  );

  const result = detectExistingFunctionMatch('提醒我明天買牛奶');
  assert(!result.matched, '沒有實際 handled 結果時不得假設 Reminder 已認領');
});

console.log('Memory 2.0 Existing Function Guard 測試完成');
