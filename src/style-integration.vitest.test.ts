import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  getActiveCallNames,
  hasCallName,
} from './call-names';

import {
  getActiveStyle,
  getActiveStyleId,
  setActiveStyle,
} from './style-state';

import {
  getActiveStylePrompt,
} from './styles/style-language';

describe('Style Integration', () => {
  it('目前預設 Style 應為 palace', () => {
    expect(getActiveStyleId()).toBe('palace');
    expect(getActiveStyle().id).toBe('palace');
  });

  it('palace Style 應提供正確的專屬呼叫詞', () => {
    setActiveStyle('palace');
    const callNames = getActiveCallNames();
    expect(callNames).toContain('阿福');
    expect(callNames).toContain('總管');
    expect(callNames).toContain('內內');
    expect(callNames).toContain('喳子');
    expect(callNames).toContain('渣子');
  });

  it('Active Style 的呼叫詞判斷應生效', () => {
    setActiveStyle('palace');
    expect(hasCallName('喳子')).toBe(true);
    expect(hasCallName('渣子')).toBe(true);
    expect(hasCallName('阿福')).toBe(true);
  });

  it('Active Style 的 AI Prompt 應為 palace Prompt', () => {
    setActiveStyle('palace');
    const prompt = getActiveStylePrompt();
    expect(prompt).toContain('【目前角色風格】');
    expect(prompt).toContain('大內總管');
    expect(prompt).toContain('第五個家人');
  });

  it('Style 切換後 Active Style 應立即影響相關模組', () => {
    const switched = setActiveStyle('palace');
    expect(switched).toBe(true);
    expect(getActiveStyleId()).toBe('palace');
    expect(getActiveStyle().id).toBe('palace');
    expect(getActiveCallNames()).toContain('總管');
    expect(getActiveStylePrompt()).toContain('大內總管');
  });

  it('不存在的 Style 不應改變目前 Active Style', () => {
    setActiveStyle('palace');
    const switched = setActiveStyle('not-exist-style');
    expect(switched).toBe(false);
    expect(getActiveStyleId()).toBe('palace');
  });
});
