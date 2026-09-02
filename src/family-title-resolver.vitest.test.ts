import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { resolveFamilyTitle } from './family-title-resolver';
import { setActiveStyle } from './style-state';

describe('family-title-resolver', () => {
  beforeEach(() => {
    setActiveStyle('palace');
  });

  afterEach(() => {
    setActiveStyle('palace');
  });

  it('宮廷 Style：主上應解析為爸爸', () => {
    const target = resolveFamilyTitle('阿福主上喜歡什麼');

    expect(target?.member.identity).toBe('你本人');
    expect(target?.title).toBe('主上');
  });

  it('宮廷 Style：娘娘應解析為媽媽', () => {
    const target = resolveFamilyTitle('阿福娘娘喜歡什麼');

    expect(target?.member.identity).toBe('妻子');
    expect(target?.title).toBe('娘娘');
  });

  it('童話 Style：王后應解析為媽媽', () => {
    setActiveStyle('fairy_tale');

    const target = resolveFamilyTitle('阿福王后喜歡什麼');

    expect(target?.member.identity).toBe('妻子');
    expect(target?.title).toBe('王后');
  });

  it('海盜 Style：船長同時對應爸爸與媽媽時不得猜測', () => {
    setActiveStyle('pirate');

    const target = resolveFamilyTitle('阿福船長睡多久');

    expect(target).toBeNull();
  });

  it('未知稱呼不得解析', () => {
    const target = resolveFamilyTitle('阿福王后喜歡什麼');

    expect(target).toBeNull();
  });
});
