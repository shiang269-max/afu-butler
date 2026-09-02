import { parseFamilyMemoryIntent } from './family-memory-intent';

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

test('記住家庭資訊可解析為 add_memory', () => {
  const intent = parseFamilyMemoryIntent('記住爸爸不吃香菜');
  assert(intent.type === 'add_memory', '應為 add_memory');
  if (intent.type !== 'add_memory') return;
  assert(intent.input.subject === '爸爸', 'subject 應為爸爸');
  assert(intent.input.content === '不吃香菜', 'content 應正確');
});

test('查詢人物記憶可解析為 query_memory', () => {
  const intent = parseFamilyMemoryIntent('幫我查爸爸的記憶');
  assert(intent.type === 'query_memory', '應為 query_memory');
  if (intent.type !== 'query_memory') return;
  assert(intent.query.subject === '爸爸', 'subject 應為爸爸');
});

test('忘記人物資訊可解析為 forget_memory', () => {
  const intent = parseFamilyMemoryIntent('忘記媽媽喜歡無糖茶');
  assert(intent.type === 'forget_memory', '應為 forget_memory');
  if (intent.type !== 'forget_memory') return;
  assert(intent.query.subject === '媽媽', 'subject 應為媽媽');
});

test('生活數據可解析為 add_record', () => {
  const intent = parseFamilyMemoryIntent('媽媽今天體重 58.2 公斤');
  assert(intent.type === 'add_record', '應為 add_record');
  if (intent.type !== 'add_record') return;
  assert(intent.input.subject === '媽媽', 'subject 應為媽媽');
  assert(intent.input.category === '體重', 'category 應為體重');
  assert(intent.input.value === 58.2, 'value 應為 58.2');
  assert(intent.input.unit === '公斤', 'unit 應為公斤');
});

test('平均睡眠問題可解析為 average', () => {
  const intent = parseFamilyMemoryIntent('爸爸這個月平均睡多久');
  assert(intent.type === 'average', '應為 average');
  if (intent.type !== 'average') return;
  assert(intent.query.subject === '爸爸', 'subject 應為爸爸');
  assert(intent.query.category === '睡眠', 'category 應為睡眠');
});

test('趨勢問題可解析為 trend', () => {
  const intent = parseFamilyMemoryIntent('媽媽體重最近趨勢如何');
  assert(intent.type === 'trend', '應為 trend');
  if (intent.type !== 'trend') return;
  assert(intent.query.subject === '媽媽', 'subject 應為媽媽');
  assert(intent.query.category === '體重', 'category 應為體重');
});

test('查詢生活紀錄可解析為 list_records', () => {
  const intent = parseFamilyMemoryIntent('查爸爸的體重紀錄');
  assert(intent.type === 'list_records', '應為 list_records');
  if (intent.type !== 'list_records') return;
  assert(intent.query.subject === '爸爸', 'subject 應為爸爸');
  assert(intent.query.category === '體重', 'category 應為體重');
});

test('未知語句不得誤判成 Memory 操作', () => {
  const intent = parseFamilyMemoryIntent('明天天氣怎麼樣');
  assert(intent.type === 'unknown', '應維持 unknown');
});

test('空白輸入應安全回傳 unknown', () => {
  const intent = parseFamilyMemoryIntent('   ');
  assert(intent.type === 'unknown', '應維持 unknown');
});

console.log('Memory 2.0 Intent 語意層測試完成');
