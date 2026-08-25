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
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
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
 * 新流程：
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
 * ACTIVE
 *
 * 不再需要輸入「開始」。
 *
 * 驗證：
 *
 * - AI 只提供候選項目
 * - AI 不決定票數
 * - 人數與候選項目完成後直接 ACTIVE
 * - ACTIVE 後可以直接投票
 * - ACTIVE 負面句不觸發候選替換
 * - AI 產生候選項目後不再需要明確開始
 *
 * =========================================================
 */


async function runTests(): Promise<void> {

  await test(
    '系統協助提供候選項目並直接進入 ACTIVE',
    async () => {

      const groupId =
        'ai-route-group-1';

      const prompts: string[] = [];

      await sendGroupMessage({
        groupId,
        userId:
          'creator',
        message:
          '喳子，投票今天玩什麼遊戲',
      });

      await sendGroupMessage({
        groupId,
        userId:
          'creator',
        message:
          '2',
      });

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
        vote.optionSource,
        'AI',
        '選項來源應為 AI',
      );

      assertEqual(
        vote.expectedVoterCount,
        3,
        '參與人數應為 3',
      );

      assertEqual(
        vote.options.length,
        4,
        'AI 應產生四個候選項目',
      );

      assertEqual(
        vote.status,
        'ACTIVE',
        '候選項目完成後應直接進入 ACTIVE',
      );

      assert(
        countResult.message?.includes(
          '投票開始',
        ),
        '應直接回覆投票開始',
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
    },
  );


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
        'ACTIVE',
        '候選項目與人數完成後應直接 ACTIVE',
      );
    },
  );


  await test(
    'ACTIVE 後可以直接投票',
    async () => {

      const groupId =
        'ai-route-group-3';

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
            '2',
        },
        async () => [
          '看電影',
          '打電動',
          '吃宵夜',
        ],
      );

      const voteResult =
        await sendGroupMessage({
          groupId,
          userId:
            'user-1',
          message:
            '我要投打電動',
        });

      assertEqual(
        voteResult.handled,
        true,
        'ACTIVE 後應可直接投票',
      );

      const vote =
        getActiveVote(
          groupId,
        );

      assert(
        vote !== null,
        '第一票後 Vote Session 應仍存在',
      );

      assertEqual(
        Object.keys(
          vote.votes,
        ).length,
        1,
        '應記錄一票',
      );
    },
  );


  await test(
    'ACTIVE 負面句不觸發 AI 候選替換',
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

      const vote =
        getActiveVote(
          groupId,
        );

      assert(
        vote !== null,
        'Vote Session 應仍存在',
      );

      assertEqual(
        vote.status,
        'ACTIVE',
        '仍應維持正式投票',
      );

      assertEqual(
        vote.options.length,
        3,
        '選項數量不可被修改',
      );
    },
  );


  await test(
    'AI 產生候選項目後不需要明確開始',
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
              '2',
          },
          async () => [
            '陽明山',
            '淡水',
            '九份',
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
        vote.status,
        'ACTIVE',
        '不需要開始指令應直接進入 ACTIVE',
      );

      assert(
        result.message?.includes(
          '投票開始',
        ),
        '應直接顯示正式投票內容',
      );

      const voteResult =
        await sendGroupMessage({
          groupId,
          userId:
            'user-1',
          message:
            '1',
        });

      assertEqual(
        voteResult.handled,
        true,
        '應可直接以數字投票',
      );
    },
  );


  console.log(
    '\n🎉 所有 Vote AI Route v6.1 測試完成。',
  );
}


runTests().catch((error) => {

  console.error(
    '\n測試中止。',
  );

  console.error(
    error,
  );

  process.exitCode = 1;
});