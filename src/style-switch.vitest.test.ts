import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  handleStyleSwitch,
} from './style-switch';

import {
  getActiveStyleId,
  setActiveStyle,
} from './style-state';


describe(
  'Style Switch',
  () => {

    beforeEach(
      () => {

        setActiveStyle(
          'palace',
        );

      },
    );


    it(
      '普通聊天不應被誤判',
      () => {

        const result =
          handleStyleSwitch(
            '今天天氣很好',
          );


        expect(
          result.handled,
        ).toBe(
          false,
        );


        expect(
          result.changed,
        ).toBe(
          false,
        );

      },
    );


    it(
      '可以查詢目前可用風格',
      () => {

        const result =
          handleStyleSwitch(
            '阿福，切換風格',
          );


        expect(
          result.handled,
        ).toBe(
          true,
        );


        expect(
          result.changed,
        ).toBe(
          false,
        );


        expect(
          result.replyText,
        ).toContain(
          '大內總管',
        );

      },
    );


    it(
      '可以查詢有哪些風格',
      () => {

        const result =
          handleStyleSwitch(
            '總管，有哪些風格',
          );


        expect(
          result.handled,
        ).toBe(
          true,
        );


        expect(
          result.replyText,
        ).toContain(
          '目前可用的角色風格',
        );

      },
    );


    it(
      '切換目前已使用的風格',
      () => {

        const result =
          handleStyleSwitch(
            '阿福，切換成大內總管',
          );


        expect(
          result.handled,
        ).toBe(
          true,
        );


        expect(
          result.changed,
        ).toBe(
          false,
        );


        expect(
          result.reason,
        ).toBe(
          'already-active',
        );

      },
    );


    it(
      '未知風格應被處理但不能切換',
      () => {

        const result =
          handleStyleSwitch(
            '阿福，切換成武俠',
          );


        expect(
          result.handled,
        ).toBe(
          true,
        );


        expect(
          result.changed,
        ).toBe(
          false,
        );


        expect(
          result.reason,
        ).toBe(
          'style-not-found',
        );


        expect(
          getActiveStyleId(),
        ).toBe(
          'palace',
        );

      },
    );


  },
);