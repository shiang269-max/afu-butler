import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  getStyleLanguage,
  getActiveStyleLanguage,
  getActiveStylePrompt,
} from './style-language';


describe(
  'style-language',
  () => {


    describe(
      'getStyleLanguage',
      () => {


        it(
          '應取得宮廷 Style 的語言設定',
          () => {

            const language =
              getStyleLanguage(
                'palace',
              );

            expect(
              language.styleId,
            ).toBe(
              'palace',
            );

            expect(
              language.identity,
            ).toContain(
              '第五個家人',
            );

            expect(
              language.identity,
            ).toContain(
              '大內總管',
            );

          },
        );


        it(
          '未知 Style 應使用預設語言設定',
          () => {

            const language =
              getStyleLanguage(
                'unknown-style',
              );

            expect(
              language.styleId,
            ).toBe(
              'default',
            );

            expect(
              language.identity,
            ).toContain(
              '第五個家人',
            );

          },
        );


        it(
          '宮廷 Style 應包含語言規則',
          () => {

            const language =
              getStyleLanguage(
                'palace',
              );

            expect(
              language.languageRules.length,
            ).toBeGreaterThan(
              0,
            );

          },
        );


        it(
          '宮廷 Style 應提供完整 Prompt',
          () => {

            const language =
              getStyleLanguage(
                'palace',
              );

            expect(
              language.prompt,
            ).toContain(
              '【目前角色風格】',
            );

            expect(
              language.prompt,
            ).toContain(
              '宮廷 Style',
            );

            expect(
              language.prompt,
            ).toContain(
              '【角色定位】',
            );

            expect(
              language.prompt,
            ).toContain(
              '【語言規則】',
            );

          },
        );


      },
    );


    describe(
      'getActiveStyleLanguage',
      () => {


        it(
          '目前應取得宮廷 Style 的語言設定',
          () => {

            const language =
              getActiveStyleLanguage();

            expect(
              language.styleId,
            ).toBe(
              'palace',
            );

          },
        );


      },
    );


    describe(
      'getActiveStylePrompt',
      () => {


        it(
          '應取得目前 Style 的 AI Prompt',
          () => {

            const prompt =
              getActiveStylePrompt();

            expect(
              prompt,
            ).toContain(
              '宮廷 Style',
            );

            expect(
              prompt,
            ).toContain(
              '第五個家人',
            );

          },
        );


      },
    );


  },
);