import {
  handleVoteMessage,
} from './vote-handler';

import {
  clearVoteState,
  getActiveVote,
} from './vote';


function assert(
  condition: unknown,
  message: string,
): asserts condition {

  if (!condition) {
    throw new Error(`❌ ${message}`);
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


async function main(): Promise<void> {

  await test(
    '普通聊天不被誤判為投票',
    async () => {
      const result = await handleVoteMessage({
        groupId: 'group-1',
        userId: 'user-1',
        message: '今天好熱',
      });

      assertEqual(
        result.handled,
        false,
        '普通聊天不應進入投票 Handler',
      );
    },
  );


  await test(
    '沒有呼叫詞時不啟動新投票',
    async () => {
      const result = await handleVoteMessage({
        groupId: 'group-2',
        userId: 'user-1',
        message: '投票決定晚餐吃什麼',
      });

      assertEqual(
        result.handled,
        false,
        '沒有呼叫詞的新投票指令不應啟動',
      );

      assertEqual(
        getActiveVote('group-2'),
        null,
        '沒有呼叫詞不應建立 Vote Session',
      );
    },
  );


  await test(
    '有呼叫詞時啟動投票並詢問選項來源',
    async () => {
      const result = await handleVoteMessage({
        groupId: 'group-3',
        userId: 'user-1',
        message: '喳子，投票決定晚餐吃什麼',
      });

      assertEqual(
        result.handled,
        true,
        '有呼叫詞的投票指令應被接管',
      );

      assert(
        result.message?.includes('大家自己提供'),
        '應提供成員提供選項的方式',
      );

      assert(
        result.message?.includes('由系統協助提供'),
        '應提供系統協助提供選項的方式',
      );

      const vote = getActiveVote('group-3');

      assert(vote !== null, '應建立 Vote Session');
      assertEqual(vote.status, 'SETUP', '初始應為 SETUP');
      assertEqual(
        vote.title,
        '晚餐吃什麼',
        '投票題目解析錯誤',
      );
    },
  );


  await test(
    '大家自己提供候選項目後設定人數直接進入 ACTIVE',
    async () => {
      const groupId = 'group-4';

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '喳子，投票決定晚餐吃什麼',
      });

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '自己提供',
      });

      const optionsResult = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '火鍋、燒肉、牛肉麵',
      });

      assertEqual(
        optionsResult.handled,
        true,
        '候選項目應被處理',
      );

      const countResult = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '3人',
      });

      assertEqual(
        countResult.handled,
        true,
        '參與人數應被處理',
      );

      const vote = getActiveVote(groupId);

      assert(vote !== null, 'Vote Session 應存在');
      assertEqual(
        vote.options.length,
        3,
        '應有三個候選項目',
      );
      assertEqual(
        vote.expectedVoterCount,
        3,
        '參與人數應為 3',
      );
      assertEqual(
        vote.status,
        'ACTIVE',
        '候選項目與人數完成後應直接開始投票',
      );

      assert(
        countResult.message?.includes('投票開始'),
        '設定人數後應直接回覆投票開始',
      );
    },
  );


  await test(
    '大家自己提供候選項目支援空白分隔',
    async () => {
      const groupId = 'group-5';

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '喳子，投票決定晚餐',
      });

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '1',
      });

      const optionsResult = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '牛肉麵 水餃 泡麵 肉',
      });

      assertEqual(
        optionsResult.handled,
        true,
        '空白分隔候選項目應被處理',
      );

      const vote = getActiveVote(groupId);

      assert(vote !== null, 'Vote Session 應存在');
      assertEqual(
        vote.options.length,
        4,
        '空白分隔應解析為四個候選項目',
      );

      assert(
        vote.options.some(
          (option) => option.text === '牛肉麵',
        ),
        '應包含牛肉麵',
      );

      assert(
        vote.options.some(
          (option) => option.text === '水餃',
        ),
        '應包含水餃',
      );
    },
  );


  await test(
    '系統協助提供候選項目後直接進入 ACTIVE',
    async () => {
      const groupId = 'group-6';

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '內內，投票決定下午要幹嘛',
      });

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '你提供',
      });

      const countResult = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '4人',
        generateOptions: async (prompt) => {
          assert(
            prompt.includes('下午要幹嘛'),
            'AI 選項產生器應收到正確題目',
          );

          return [
            '看電影',
            '去逛街',
            '吃東西',
            '在家休息',
          ];
        },
      });

      assertEqual(
        countResult.handled,
        true,
        '設定人數應被處理',
      );

      const vote = getActiveVote(groupId);

      assert(vote !== null, 'Vote Session 應存在');
      assertEqual(
        vote.expectedVoterCount,
        4,
        '參與人數應為 4',
      );
      assertEqual(
        vote.options.length,
        4,
        '系統應產生四個候選項目',
      );
      assertEqual(
        vote.status,
        'ACTIVE',
        '系統產生候選項目後應直接進入 ACTIVE',
      );

      assert(
        countResult.message?.includes('投票開始'),
        'AI 候選項目完成後應直接回覆投票開始',
      );
    },
  );


  await test(
    '正式投票後不需要呼叫詞',
    async () => {
      const groupId = 'group-7';

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '總管，投票決定晚餐吃什麼：火鍋、燒肉',
      });

      const startResult = await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '3人',
      });

      assert(
        startResult.message?.includes('投票開始'),
        '設定人數後應直接開始正式投票',
      );

      const voteResult = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '我要投火鍋',
      });

      assertEqual(
        voteResult.handled,
        true,
        '正式投票後自然語言投票不需要呼叫詞',
      );

      const vote = getActiveVote(groupId);
      assert(vote !== null, '投票應仍在進行中');
      assertEqual(
        Object.keys(vote.votes).length,
        1,
        '應記錄一票',
      );
    },
  );


  await test(
    '自然語言改票',
    async () => {
      const groupId = 'group-8';

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '喳子，投票決定晚餐：火鍋、燒肉',
      });

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '3人',
      });

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '火鍋',
      });

      const changed = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '改投燒肉',
      });

      assertEqual(
        changed.handled,
        true,
        '改票應被處理',
      );

      const vote = getActiveVote(groupId);
      assert(vote !== null, '投票應存在');
      assertEqual(
        vote.votes['user-1']?.optionId,
        vote.options[1]?.id,
        '使用者應改投燒肉',
      );
    },
  );


  await test(
    '正式投票後負面句子不誤判',
    async () => {
      const groupId = 'group-9';

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '喳子，投票決定晚餐：火鍋、燒肉',
      });

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '3人',
      });

      const result = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '我不想吃火鍋',
      });

      assertEqual(
        result.handled,
        false,
        'ACTIVE 負面句子不應被視為投票',
      );
    },
  );


  await test(
    '所有人投完後自動結束',
    async () => {
      const groupId = 'group-10';

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '喳子，投票決定晚餐：火鍋、燒肉',
      });

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '2人',
      });

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '火鍋',
      });

      const finalResult = await handleVoteMessage({
        groupId,
        userId: 'user-2',
        message: '我要投火鍋',
      });

      assertEqual(
        finalResult.handled,
        true,
        '最後一票應被處理',
      );

      assertEqual(
        getActiveVote(groupId),
        null,
        '全部投完後應自動結束',
      );
    },
  );


  console.log(
    '\n🎉 所有 Vote Handler v6.1 整合測試完成。',
  );
}


main().catch((error) => {
  console.error('\n測試中止。');
  console.error(error);
  process.exitCode = 1;
});