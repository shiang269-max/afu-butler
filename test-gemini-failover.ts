import dotenv from 'dotenv';

dotenv.config();

import { GoogleGenAI } from '@google/genai';

import {
  geminiApiManager,
} from './src/ai/gemini-api-manager';


async function main(): Promise<void> {

  console.log(
    '\n========== Gemini Failover Test ==========\n',
  );


  console.log(
    '[1] 目前 Key 狀態：',
  );

  console.log(
    geminiApiManager.getStatus(),
  );


  /*
   * -------------------------------------------------------
   * 第一次測試
   * -------------------------------------------------------
   *
   * 故意讓第一個 Key 的 operation 拋出
   * Key / quota 類錯誤。
   *
   * Manager 應該：
   *
   * Primary
   *   ↓
   * 模擬 quota / 429
   *   ↓
   * 標記 Primary 暫時不可用
   *   ↓
   * Backup
   *   ↓
   * 成功
   * -------------------------------------------------------
   */

  let operationCount = 0;


  const result =
    await geminiApiManager.execute(
      async (
        gemini: GoogleGenAI,
      ) => {

        operationCount += 1;


        console.log(
          `[Test] operation 第 ${operationCount} 次`,
        );


        /*
         * 第一次故意模擬 Gemini quota / 429。
         */

        if (
          operationCount === 1
        ) {

          throw Object.assign(
            new Error(
              'RESOURCE_EXHAUSTED: simulated quota error',
            ),
            {
              status: 429,
              code: 429,
            },
          );
        }


        /*
         * 第二次真正呼叫目前取得的 Gemini Client。
         */

        const response =
          await gemini.models.generateContent(
            {
              model:
                'gemini-3.5-flash-lite',

              contents:
                '請只回答：Failover 測試成功。',
            },
          );


        return response;
      },
    );


  console.log(
    '\n[Test] Gemini 回覆：',
  );

  console.log(
    result.text,
  );


  console.log(
    '\n[Test] operation 次數：',
    operationCount,
  );


  console.log(
    '\n[2] Failover 後 Key 狀態：',
  );

  console.log(
    geminiApiManager.getStatus(),
  );


  console.log(
    '\n========== Test Finished ==========\n',
  );
}


main().catch(
  (error) => {

    console.error(
      '\n========== Test Failed ==========\n',
    );

    console.error(
      error,
    );

    process.exit(
      1,
    );
  },
);