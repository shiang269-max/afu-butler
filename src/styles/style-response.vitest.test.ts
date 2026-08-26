import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  buildStyleResponse,
} from './style-response';


describe(
  'style-response',
  () => {


    describe(
      'buildStyleResponse',
      () => {


        it(
          '宮廷 Style 應保留原始功能內容',
          () => {

            const content =
              '目前投票已開始，請大家進行投票。';

            const response =
              buildStyleResponse(
                content,
              );

            expect(
              response,
            ).toBe(
              content,
            );

          },
        );


        it(
          '應保留多行系統回覆',
          () => {

            const content = [
              '投票開始。',
              '',
              '1. 火鍋',
              '2. 燒肉',
              '',
              '請直接輸入選項。',
            ].join(
              '\n',
            );

            const response =
              buildStyleResponse(
                content,
              );

            expect(
              response,
            ).toBe(
              content,
            );

          },
        );


        it(
          '應正確處理空字串',
          () => {

            const response =
              buildStyleResponse(
                '',
              );

            expect(
              response,
            ).toBe(
              '',
            );

          },
        );


        it(
          '傳入 options 不應影響目前內容',
          () => {

            const content =
              '提醒已設定完成。';

            const response =
              buildStyleResponse(
                content,
                {
                  preserveContent:
                    true,
                },
              );

            expect(
              response,
            ).toBe(
              content,
            );

          },
        );


      },
    );


  },
);