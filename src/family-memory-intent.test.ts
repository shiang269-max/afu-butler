import { describe, expect, it } from 'vitest';
import { parseFamilyMemoryIntent } from './family-memory-intent';

describe('Memory 2.0 Intent 呼叫詞防誤觸', () => {
  it('記住家庭資訊可解析為 add_memory', () => {
    const intent = parseFamilyMemoryIntent('記住爸爸不吃香菜');
    expect(intent.type).toBe('add_memory');
    if (intent.type !== 'add_memory') return;
    expect(intent.input.subject).toBe('爸爸');
    expect(intent.input.content).toBe('不吃香菜');
  });

  it('沒有指定人物的記憶保留為待身份解析', () => {
    const intent = parseFamilyMemoryIntent('記住我愛喝茶');
    expect(intent.type).toBe('add_memory');
    if (intent.type !== 'add_memory') return;
    expect(intent.input.subject).toBe('我');
    expect(intent.input.content).toBe('愛喝茶');
  });

  it('阿福查詢人物記憶可解析為 query_memory', () => {
    const intent = parseFamilyMemoryIntent('阿福，幫我查爸爸的記憶');
    expect(intent.type).toBe('query_memory');
    if (intent.type !== 'query_memory') return;
    expect(intent.query.subject).toBe('爸爸');
    expect(intent.query.keyword).toBeUndefined();
  });

  it('阿福自然語句查詢人物記憶可解析為 query_memory', () => {
    const cases = [
      { text: '阿福，媽媽喜歡什麼', subject: '媽媽', keyword: '喜歡' },
      { text: '阿福媽媽喜歡什麼', subject: '媽媽', keyword: '喜歡' },
      { text: '阿福，爸爸不吃什麼', subject: '爸爸', keyword: '不吃' },
    ];

    for (const { text, subject, keyword } of cases) {
      const intent = parseFamilyMemoryIntent(text);
      expect(intent.type).toBe('query_memory');
      if (intent.type !== 'query_memory') continue;
      expect(intent.query.subject).toBe(subject);
      expect(intent.query.keyword).toBe(keyword);
    }
  });

  it('自然查詢結尾的疑問詞不應污染關鍵字', () => {
    const intent = parseFamilyMemoryIntent('阿福，媽媽喜歡無糖茶嗎');
    expect(intent.type).toBe('query_memory');
    if (intent.type !== 'query_memory') return;
    expect(intent.query.subject).toBe('媽媽');
    expect(intent.query.keyword).toBe('喜歡無糖茶');
  });

  it('沒有阿福的查詢不得喚起 Memory', () => {
    for (const text of [
      '查爸爸的記憶',
      '找爸爸的資料',
      '看看爸爸的事情',
      '有沒有爸爸的記憶',
      '媽媽喜歡什麼',
      '爸爸不吃什麼',
    ]) {
      expect(parseFamilyMemoryIntent(text).type).toBe('unknown');
    }
  });

  it('阿福忘記人物資訊可解析為 forget_memory', () => {
    const intent = parseFamilyMemoryIntent('阿福，忘記媽媽喜歡無糖茶');
    expect(intent.type).toBe('forget_memory');
    if (intent.type !== 'forget_memory') return;
    expect(intent.query.subject).toBe('媽媽');
    expect(intent.query.keyword).toBe('喜歡無糖茶');
  });

  it('沒有阿福的忘記不得喚起 Memory', () => {
    expect(parseFamilyMemoryIntent('忘記媽媽喜歡無糖茶').type).toBe('unknown');
  });

  it('生活數據可直接解析為 add_record', () => {
    const intent = parseFamilyMemoryIntent('媽媽今天體重 58.2 公斤');
    expect(intent.type).toBe('add_record');
    if (intent.type !== 'add_record') return;
    expect(intent.input.subject).toBe('媽媽');
    expect(intent.input.category).toBe('體重');
    expect(intent.input.value).toBe(58.2);
    expect(intent.input.unit).toBe('公斤');
  });

  it('阿福平均睡眠問題可解析為 average', () => {
    const intent = parseFamilyMemoryIntent('阿福，爸爸這個月平均睡多久');
    expect(intent.type).toBe('average');
    if (intent.type !== 'average') return;
    expect(intent.query.subject).toBe('爸爸');
    expect(intent.query.category).toBe('睡眠');
  });

  it('沒有阿福的平均問題不得喚起 Memory', () => {
    expect(parseFamilyMemoryIntent('爸爸這個月平均睡多久').type).toBe('unknown');
  });

  it('阿福趨勢問題可解析為 trend', () => {
    const intent = parseFamilyMemoryIntent('阿福，媽媽體重最近趨勢如何');
    expect(intent.type).toBe('trend');
    if (intent.type !== 'trend') return;
    expect(intent.query.subject).toBe('媽媽');
    expect(intent.query.category).toBe('體重');
  });

  it('沒有阿福的趨勢問題不得喚起 Memory', () => {
    expect(parseFamilyMemoryIntent('媽媽體重最近趨勢如何').type).toBe('unknown');
  });

  it('阿福查詢生活紀錄可解析為 list_records', () => {
    const intent = parseFamilyMemoryIntent('阿福，查爸爸的體重紀錄');
    expect(intent.type).toBe('list_records');
    if (intent.type !== 'list_records') return;
    expect(intent.query.subject).toBe('爸爸');
    expect(intent.query.category).toBe('體重');
  });

  it('沒有阿福的生活紀錄查詢不得喚起 Memory', () => {
    expect(parseFamilyMemoryIntent('查爸爸的體重紀錄').type).toBe('unknown');
  });

  it('未知語句不得誤判成 Memory 操作', () => {
    expect(parseFamilyMemoryIntent('明天天氣怎麼樣').type).toBe('unknown');
  });

  it('空白輸入應安全回傳 unknown', () => {
    expect(parseFamilyMemoryIntent('   ').type).toBe('unknown');
  });
});
