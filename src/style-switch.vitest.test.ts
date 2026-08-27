import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  handleStyleSwitch,
} from './style-switch';

import {
  getActiveStyle,
} from './style-state';


describe(
  'Style Switch',
  () => {


    it(
      '普通聊天不應被誤判',
      () => {

        const result =
          handleStyleSwitch(
            '今天晚餐吃什麼？',
            'test-normal-chat',
            false,
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
            'test-style-list',
            true,
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
          '目前可用的角色風格',
        );

      },
    );


    it(
      '可以查詢有哪些風格',
      () => {

        const result =
          handleStyleSwitch(
            '阿福，有哪些風格',
            'test-style-list-2',
            true,
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
          '目前可用的角色風格',
        );

      },
    );


    it(
      '切換目前已使用的風格',
      () => {

        const activeStyle =
          getActiveStyle();


        const result =
          handleStyleSwitch(
            `阿福，切換成${activeStyle.name}`,
            'test-current-style',
            true,
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
            '阿福，切換成不存在的風格',
            'test-unknown-style',
            true,
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

      },
    );


  },
);