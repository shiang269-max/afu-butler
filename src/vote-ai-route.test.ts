import {
  handleVoteMessage,
} from './vote-handler';

import {
  clearVoteState,
  getActiveVote,
} from './vote';


interface MockLineGroupMessage {
  groupId: string;
  userId: string;
  message: string;
}


function assert(
  condition: unknown,
  message: string,
): asserts condition {

  if (!condition) {
    throw new Error(
      `❌ ${message}`,
    );
  }

}


function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {

  if (actual !== expected) {
    throw new Error(
      [
        `❌ ${message}`,
        `Expected: ${String(expected)}`,
        `Actual: ${String(actual)}`,
      ].join('\n'),
    );
  }

}


async function test(
  name: string,
  callback: () => Promise<void> | void,
): Promise<void> {

  clearVoteState();

  try {

    await callback();

    console.log(
      `✅ ${name}`,
    );

  } catch (error) {

    console.error(
      `❌ ${name}`,
    );

    throw error;

  }

}


async function sendGroupMessage(
  input: MockLineGroupMessage,
  generateOptions?: (
    prompt: string,
  ) => Promise<string[]>,
) {

  return await handleVoteMessage({

    groupId:
      input.groupId,

    userId:
      input.userId,

    message:
      input.message,

    generateOptions,

  });

}


/**
 * =========================================================
 * Vote AI Route Test
 * =========================================================
 *
 * 目的：
 *
 * 不實際呼叫 Gemini。
 * 用可控的 generateOptions() 模擬 index.ts
 * 傳入 vote-handler 的候選項目生成器。
 *
 * 驗證完整流程：
 *
 * 呼叫詞 + 投票
 *     ↓
 * 選擇「系統協助」
 *     ↓
 * 設定參與人數
 *     ↓
 * generateOptions()
 *     ↓
 * 候選項目
 *     ↓
 * READY
 *
 * 同時驗證：
 *
 * - AI 只提供候選項目
 * - AI 不決定票數
 * - AI 不決定投票狀態
 * - 候選項目可以被拒絕
 * - 拒絕後要求新的候選項目
 * - 補項後仍維持 READY
 * - 正式投票開始後不能新增 / 移除選項
 *
 * 本測試不修改：
 *
 * - index.ts
 * - vote.ts
 * - vote-handler.ts
 *
 * =========================================================
 */


/**
 * =========================================================
 * 1. 系統提供候選項目
 * =========================================================
 */

async function runTests(): Promise<void> {

  await test(
    '系統協助提供候選項目並進入 READY',

    async () => {

      const groupId =
        'ai-route-group-1';


      const prompts: string[] = [];


      const startResult =
        await sendGroupMessage({

          groupId,

          userId:
            'creator',

          message:
            '喳子，投票今天玩什麼遊戲',

        });


      assertEqual(
        startResult.handled,
        true,
        '新投票應被接管',
      );


      const sourceResult =
        await sendGroupMessage({

          groupId,

          userId:
            'creator',

          message:
            '2',

        });


      assertEqual(
        sourceResult.handled,
        true,
        '選擇 2 應代表系統協助提供',
      );


      const countResult =
        await sendGroupMessage(

          {

            groupId,

            userId:
              'creator',

            message:
              '3',

          },

          async (
            prompt,
          ) => {

            prompts.push(
              prompt,
            );

            return [
              '看電影',
              '打保齡球',
              '去逛街',
              '桌遊',
            ];

          },

        );


      assertEqual(
        countResult.handled,
        true,
        '設定參與人數後應被處理',
      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !== null,
        'Vote Session 應存在',
      );


      assertEqual(
        vote?.optionSource,
        'AI',
        '選項來源應為 AI',
      );


      assertEqual(
        vote?.expectedVoterCount,
        3,
        '參與人數應為 3',
      );


      assertEqual(
        vote?.options.length,
        4,
        'AI 應產生四個候選項目',
      );


      assertEqual(
        vote?.status,
        'READY',
        '候選項目完成後應進入 READY',
      );


      assert(
        prompts.length === 1,
        '應只呼叫一次候選項目生成器',
      );


      assert(
        prompts[0]?.includes(
          '今天玩什麼遊戲',
        ),
        'AI prompt 應包含正確投票題目',
      );


      assert(
        countResult.message?.includes(
          '本次共有 3 人參與',
        ),
        '應回傳參與人數',
      );


      assert(
        countResult.message?.includes(
          '1. 看電影',
        ),
        '應列出 AI 候選項目',
      );

    },
  );


  /**
   * =======================================================
   * 2. AI 回傳不合理選項也不由 Core 自行變成票數
   * =======================================================
   */

  await test(
    'AI 只負責提供候選項目，票數仍由 Vote Core 管理',

    async () => {

      const groupId =
        'ai-route-group-2';


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '喳子，投票今天玩什麼',

      });


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '2',

      });


      await sendGroupMessage(

        {

          groupId,

          userId:
            'creator',

          message:
            '3',

        },

        async () => [
          '看電影',
          '打電動',
          '吃宵夜',
        ],

      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !== null,
        'Vote Session 應存在',
      );


      assertEqual(
        Object.keys(
          vote.votes,
        ).length,
        0,
        'AI 產生候選項目不能直接產生票數',
      );


      assertEqual(
        vote.status,
        'READY',
        '尚未正式開始前應維持 READY',
      );

    },
  );


  /**
   * =======================================================
   * 3. 拒絕 AI 候選項目後由 AI 補一個
   * =======================================================
   */

  await test(
    '拒絕 AI 候選項目後由系統補上新的候選項目',

    async () => {

      const groupId =
        'ai-route-group-3';


      let generationCount =
        0;


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '喳子，投票今天玩什麼',

      });


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '2',

      });


      await sendGroupMessage(

        {

          groupId,

          userId:
            'creator',

          message:
            '3',

        },

        async () => {

          generationCount += 1;

          return [
            '看電影',
            '打電動',
            '吃宵夜',
          ];

        },

      );


      const replacementResult =
        await sendGroupMessage(

          {

            groupId,

            userId:
              'user-2',

            message:
              '我不想吃宵夜',

          },

          async () => {

            generationCount += 1;

            return [
              '去唱歌',
            ];

          },

        );


      assertEqual(
        replacementResult.handled,
        true,
        '拒絕候選項目應被 Vote Handler 接管',
      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !== null,
        'Vote Session 應存在',
      );


      assert(
        !vote.options.some(
          (
            option,
          ) =>
            option.text ===
            '吃宵夜',
        ),
        '被拒絕的候選項目應被移除',
      );


      assert(
        vote.options.some(
          (
            option,
          ) =>
            option.text ===
            '去唱歌',
        ),
        '新的候選項目應加入',
      );


      assertEqual(
        vote.status,
        'READY',
        '補項後應維持 READY',
      );


      assertEqual(
        generationCount,
        2,
        '原始生成與補項生成各一次',
      );

    },
  );


  /**
   * =======================================================
   * 4. 正式開始後不能再透過 AI 補候選項目
   * =======================================================
   */

  await test(
    '正式開始投票後不能新增 AI 候選項目',

    async () => {

      const groupId =
        'ai-route-group-4';


      let replacementCalled =
        false;


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '喳子，投票今天玩什麼',

      });


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '2',

      });


      await sendGroupMessage(

        {

          groupId,

          userId:
            'creator',

          message:
            '3',

        },

        async () => [
          '看電影',
          '打電動',
          '吃宵夜',
        ],

      );


      const startResult =
        await sendGroupMessage({

          groupId,

          userId:
            'creator',

          message:
            '開始',

        });


      assertEqual(
        startResult.handled,
        true,
        '應正式開始投票',
      );


      const voteBefore =
        getActiveVote(
          groupId,
        );


      assertEqual(
        voteBefore?.status,
        'ACTIVE',
        '狀態應為 ACTIVE',
      );


      const result =
        await sendGroupMessage(

          {

            groupId,

            userId:
              'user-2',

            message:
              '我不想吃宵夜',

          },

          async () => {

            replacementCalled =
              true;

            return [
              '去唱歌',
            ];

          },

        );


      assertEqual(
        result.handled,
        false,
        'ACTIVE 負面句不應被當成候選項目修改',
      );


      assertEqual(
        replacementCalled,
        false,
        'ACTIVE 階段不應呼叫候選項目生成器',
      );


      const voteAfter =
        getActiveVote(
          groupId,
        );


      assert(
        voteAfter !== null,
        'Vote Session 應仍存在',
      );


      assertEqual(
        voteAfter?.status,
        'ACTIVE',
        '仍應維持正式投票',
      );


      assertEqual(
        voteAfter?.options.length,
        3,
        '選項數量不可被修改',
      );

    },
  );


  /**
   * =======================================================
   * 5. AI 產生的候選項目不得自動開始投票
   * =======================================================
   */

  await test(
    'AI 產生候選項目後仍須明確開始',

    async () => {

      const groupId =
        'ai-route-group-5';


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '喳子，投票週末去哪裡',

      });


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '2',

      });


      const result =
        await sendGroupMessage(

          {

            groupId,

            userId:
              'creator',

            message:
              '4',

          },

          async () => [
            '台北',
            '宜蘭',
            '新竹',
            '苗栗',
          ],

        );


      assertEqual(
        result.handled,
        true,
        'AI 候選流程應成功',
      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !== null,
        'Vote Session 應存在',
      );


      assertEqual(
        vote?.status,
        'READY',
        '不能因為 AI 完成候選項目就自動開始',
      );


      assertEqual(
        Object.keys(
          vote.votes,
        ).length,
        0,
        '開始前不可有票數',
      );

    },
  );


  /**
   * =======================================================
   * 6. AI 回傳重複選項時由 Core 去重
   * =======================================================
   */

  await test(
    'AI 候選項目重複時由 Vote Core 去重',

    async () => {

      const groupId =
        'ai-route-group-6';


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '喳子，投票週末去哪裡',

      });


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '2',

      });


      await sendGroupMessage(

        {

          groupId,

          userId:
            'creator',

          message:
            '3',

        },

        async () => [
          '台北',
          '台北',
          '宜蘭',
          '台北',
        ],

      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !== null,
        'Vote Session 應存在',
      );


      assertEqual(
        vote.options.length,
        2,
        '重複候選項目應由 Core 去重',
      );


      assert(
        vote.options.some(
          (
            option,
          ) =>
            option.text ===
            '台北',
        ),
        '應保留台北',
      );


      assert(
        vote.options.some(
          (
            option,
          ) =>
            option.text ===
            '宜蘭',
        ),
        '應保留宜蘭',
      );

    },
  );


  /**
   * =======================================================
   * 7. 不同投票題目應傳給 AI 不同 prompt
   * =======================================================
   */

  await test(
    '不同投票題目會建立對應的候選項目生成 prompt',

    async () => {

      const groupId =
        'ai-route-group-7';

      let receivedPrompt =
        '';


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '喳子，投票週末去哪裡玩',

      });


      await sendGroupMessage({

        groupId,

        userId:
          'creator',

        message:
          '2',

      });


      await sendGroupMessage(

        {

          groupId,

          userId:
            'creator',

          message:
            '3',

        },

        async (
          prompt,
        ) => {

          receivedPrompt =
            prompt;

          return [
            '海邊',
            '遊樂園',
            '爬山',
          ];

        },

      );


      assert(
        receivedPrompt.includes(
          '週末去哪裡玩',
        ),
        'Prompt 應包含真正的投票題目',
      );


      assert(
        receivedPrompt.includes(
          '請提供 4 個',
        ),
        'Prompt 應要求候選項目',
      );

    },
  );


  console.log(
    '\n🎉 所有 Vote AI Route 測試完成。',
  );

}


runTests()
  .catch(
    (
      error,
    ) => {

      console.error(
        '\n測試中止。',
      );

      console.error(
        error,
      );

      process.exitCode =
        1;

    },
  );