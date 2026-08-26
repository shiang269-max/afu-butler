import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  UNIVERSAL_CALL_NAMES,
  PALACE_CALL_NAMES,
  getActiveCallNames,
  hasCallName,
  cleanCallNames,
  getActiveCallNamesText,
  isCallNameHelpIntent,
  buildActiveCallNamesHelpMessage,
} from './call-names';


describe(
  'call-names',
  () => {


    describe(
      'getActiveCallNames',
      () => {

        it(
          '應包含所有通用呼叫詞',
          () => {

            const callNames =
              getActiveCallNames();

            for (
              const callName
              of UNIVERSAL_CALL_NAMES
            ) {

              expect(
                callNames,
              ).toContain(
                callName,
              );

            }

          },
        );


        it(
          '應包含目前宮廷 Style 呼叫詞',
          () => {

            const callNames =
              getActiveCallNames();

            for (
              const callName
              of PALACE_CALL_NAMES
            ) {

              expect(
                callNames,
              ).toContain(
                callName,
              );

            }

          },
        );


        it(
          '目前應包含阿福與全部宮廷呼叫詞',
          () => {

            expect(
              getActiveCallNames(),
            ).toEqual(
              [
                '阿福',
                '大內總管',
                '總管',
                '內內',
                '喳子',
                '渣子',
              ],
            );

          },
        );

      },
    );


    describe(
      'hasCallName',
      () => {

        it.each(
          [
            '阿福',
            '大內總管',
            '總管',
            '內內',
            '喳子',
            '渣子',
          ],
        )(
          '應辨識有效呼叫詞：%s',
          (
            callName,
          ) => {

            expect(
              hasCallName(
                `${callName} 幫我開投票`,
              ),
            ).toBe(
              true,
            );

          },
        );


        it(
          '沒有呼叫詞時應回傳 false',
          () => {

            expect(
              hasCallName(
                '幫我開投票',
              ),
            ).toBe(
              false,
            );

          },
        );


        it(
          '空白訊息應回傳 false',
          () => {

            expect(
              hasCallName(
                '   ',
              ),
            ).toBe(
              false,
            );

          },
        );


        it(
          '空字串應回傳 false',
          () => {

            expect(
              hasCallName(
                '',
              ),
            ).toBe(
              false,
            );

          },
        );

      },
    );


    describe(
      'cleanCallNames',
      () => {

        it.each(
          [
            [
              '阿福 幫我開投票',
              '幫我開投票',
            ],

            [
              '大內總管 幫我開投票',
              '幫我開投票',
            ],

            [
              '總管 幫我開投票',
              '幫我開投票',
            ],

            [
              '內內 幫我開投票',
              '幫我開投票',
            ],

            [
              '喳子 幫我開投票',
              '幫我開投票',
            ],

            [
              '渣子 幫我開投票',
              '幫我開投票',
            ],
          ],
        )(
          '應正確清除呼叫詞：%s',
          (
            message,
            expected,
          ) => {

            expect(
              cleanCallNames(
                message,
              ),
            ).toBe(
              expected,
            );

          },
        );


        it(
          '應清除呼叫詞後的標點符號',
          () => {

            expect(
              cleanCallNames(
                '阿福，幫我開投票',
              ),
            ).toBe(
              '幫我開投票',
            );

          },
        );


        it(
          '應清除呼叫詞後的冒號',
          () => {

            expect(
              cleanCallNames(
                '阿福：幫我開投票',
              ),
            ).toBe(
              '幫我開投票',
            );

          },
        );


        it(
          '應優先處理較長的呼叫詞',
          () => {

            expect(
              cleanCallNames(
                '大內總管 幫我開投票',
              ),
            ).toBe(
              '幫我開投票',
            );

          },
        );


        it(
          '應清除多個不同呼叫詞',
          () => {

            expect(
              cleanCallNames(
                '阿福 總管 幫我開投票',
              ),
            ).toBe(
              '幫我開投票',
            );

          },
        );


        it(
          '沒有呼叫詞時應保留原始內容',
          () => {

            expect(
              cleanCallNames(
                '幫我開投票',
              ),
            ).toBe(
              '幫我開投票',
            );

          },
        );

      },
    );


    describe(
      'getActiveCallNamesText',
      () => {

        it(
          '應列出目前全部可用呼叫詞',
          () => {

            expect(
              getActiveCallNamesText(),
            ).toBe(
              '阿福、大內總管、總管、內內、喳子、渣子',
            );

          },
        );

      },
    );


    describe(
      'isCallNameHelpIntent',
      () => {

        it.each(
          [
            '阿福 可以怎麼叫你',
            '阿福，可以怎麼叫你？',
            '總管 怎麼叫你',
            '內內 怎麼稱呼你',
            '喳子 怎麼呼叫你',
            '阿福 你叫什麼',
            '阿福 你叫啥',
            '阿福 你叫甚麼',
            '阿福 你的名字',
            '阿福 你的名稱',
            '阿福 有哪些呼叫詞',
            '阿福 有什麼呼叫詞',
            '阿福 有那些呼叫詞',
            '阿福 可以用哪些呼叫詞',
            '阿福 可以用什麼呼叫詞',
            '怎麼叫總管',
          ],
        )(
          '應辨識呼叫詞查詢：%s',
          (
            message,
          ) => {

            expect(
              isCallNameHelpIntent(
                message,
              ),
            ).toBe(
              true,
            );

          },
        );


        it.each(
          [
            '阿福 幫我開投票',
            '總管 我要設定提醒',
            '幫我開投票',
            '今天天氣很好',
          ],
        )(
          '一般訊息不應被誤判為呼叫詞查詢：%s',
          (
            message,
          ) => {

            expect(
              isCallNameHelpIntent(
                message,
              ),
            ).toBe(
              false,
            );

          },
        );

      },
    );


    describe(
      'buildActiveCallNamesHelpMessage',
      () => {

        it(
          '應建立目前可用呼叫詞說明',
          () => {

            expect(
              buildActiveCallNamesHelpMessage(),
            ).toBe(
              [
                '目前可以這樣叫我：',
                '阿福、大內總管、總管、內內、喳子、渣子',
              ].join(
                '\n',
              ),
            );

          },
        );

      },
    );


  },
);