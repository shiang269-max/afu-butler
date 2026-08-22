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
    '大家自己提供候選項目',
    async () => {
      const groupId = 'group-4';

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '喳子，投票決定晚餐吃什麼',
      });

      const sourceResult = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '自己提供',
      });

      assertEqual(
        sourceResult.handled,
        true,
        '選擇自己提供應被處理',
      );

      assert(
        sourceResult.message?.includes('候選選項'),
        '應要求提供候選選項',
      );

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

      const vote = getActiveVote(groupId);

      assert(vote !== null, 'Vote Session 應存在');
      assertEqual(
        vote.options.length,
        3,
        '應有三個候選項目',
      );
      assertEqual(
        vote.status,
        'READY',
        '候選項目達標後應為 READY',
      );
    },
  );


  await test(
    '系統協助提供候選項目',
    async () => {
      const groupId = 'group-5';

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '內內，投票決定下午要幹嘛',
      });

      const sourceResult = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '你提供',
      });

      assertEqual(
        sourceResult.handled,
        true,
        '選擇系統提供應被處理',
      );

      assert(
        sourceResult.message?.includes('幾位參與投票'),
        '系統提供模式應先詢問參與人數',
      );

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
        'READY',
        '系統產生候選項目後應為 READY',
      );
    },
  );


  await test(
    '正式開始投票後不需要呼叫詞',
    async () => {
      const groupId = 'group-6';

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '總管，投票決定晚餐吃什麼：火鍋、燒肉',
      });

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '3人',
      });

      const startResult = await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '開始',
      });

      assert(
        startResult.message?.includes('投票開始'),
        '應開始正式投票',
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
      const groupId = 'group-7';

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
        userId: 'creator',
        message: '開始',
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

      assert(
        changed.message?.includes('燒肉'),
        '應回覆新的投票選項',
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
        userId: 'creator',
        message: '開始',
      });

      const result = await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '我不想吃火鍋',
      });

      assertEqual(
        result.handled,
        false,
        '負面句子不應被視為投票',
      );

      const vote = getActiveVote(groupId);
      assert(vote !== null, '投票應存在');
      assertEqual(
        Object.keys(vote.votes).length,
        0,
        '負面句子不應產生投票紀錄',
      );
    },
  );


  await test(
    '系統提供階段可以移除不想要的候選項目並替換',
    async () => {
      const groupId = 'group-9';

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '喳子，投票決定下午要幹嘛',
      });

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '你提供',
      });

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '4人',
        generateOptions: async () => [
          '看電影',
          '去逛街',
          '吃東西',
          '在家休息',
        ],
      });

      const result = await handleVoteMessage({
        groupId,
        userId: 'user-2',
        message: '我不想吃東西',
        generateOptions: async (prompt) => {
          assert(
            prompt.includes('看電影'),
            '替換候選項目時應保留現有項目資訊',
          );

          return ['打保齡球'];
        },
      });

      assertEqual(
        result.handled,
        true,
        '候選項目拒絕應被處理',
      );

      const vote = getActiveVote(groupId);
      assert(vote !== null, 'Vote Session 應存在');

      assert(
        !vote.options.some(
          (option) => option.text === '吃東西',
        ),
        '被拒絕項目應移除',
      );

      assert(
        vote.options.some(
          (option) => option.text === '打保齡球',
        ),
        '應加入替代候選項目',
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
        userId: 'creator',
        message: '開始',
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

      assert(
        finalResult.message?.includes('火鍋'),
        '應公布最終結果',
      );

      assertEqual(
        getActiveVote(groupId),
        null,
        '全部投完後應自動結束',
      );
    },
  );


  await test(
    '同群組第二場投票先詢問處理上一場',
    async () => {
      const groupId = 'group-11';

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
        userId: 'creator',
        message: '開始',
      });

      const result = await handleVoteMessage({
        groupId,
        userId: 'user-2',
        message: '喳子，投票決定下午要幹嘛',
      });

      assertEqual(
        result.handled,
        true,
        '第二場投票應被攔截',
      );

      assert(
        result.message?.includes('晚餐'),
        '應指出目前投票題目',
      );

      assert(
        result.message?.includes('先結束'),
        '應詢問是否先結束上一場',
      );
    },
  );


  await test(
    '手動完成投票',
    async () => {
      const groupId = 'group-12';

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
        userId: 'creator',
        message: '開始',
      });

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '火鍋',
      });

      const result = await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '完成投票',
      });

      assertEqual(
        result.handled,
        true,
        '手動完成應被處理',
      );

      assertEqual(
        getActiveVote(groupId),
        null,
        '手動完成後不應保留 ACTIVE Vote',
      );
    },
  );


  await test(
    '平手後可以選擇只重投平手項目',
    async () => {
      const groupId = 'group-13';

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '喳子，投票決定晚餐：火鍋、燒肉、牛肉麵',
      });

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '2人',
      });

      await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '開始',
      });

      await handleVoteMessage({
        groupId,
        userId: 'user-1',
        message: '火鍋',
      });

      await handleVoteMessage({
        groupId,
        userId: 'user-2',
        message: '燒肉',
      });

      const tieVote = getActiveVote(groupId);
      assert(tieVote !== null, '平手狀態應保留 Vote Session');
      assertEqual(tieVote.status, 'TIE', '應進入 TIE');

      const revote = await handleVoteMessage({
        groupId,
        userId: 'creator',
        message: '1',
      });

      assertEqual(
        revote.handled,
        true,
        '平手再投應被處理',
      );

      const active = getActiveVote(groupId);
      assert(active !== null, '應重新進入投票');
      assertEqual(active.status, 'ACTIVE', '應回到 ACTIVE');
      assertEqual(active.options.length, 2, '只保留平手項目');
    },
  );


  console.log(
    '\n🎉 所有 Vote Handler v6 整合測試完成。',
  );
}


main().catch((error) => {
  console.error('\n測試中止。');
  console.error(error);
  process.exitCode = 1;
});