import {
  handleFunctionHelp,
} from './function-help';

import {
  handleVoteMessage,
} from './vote-handler';


type RouteName =
  | 'FUNCTION_HELP'
  | 'VOTE'
  | 'OTHER';


function assert(
  condition: unknown,
  message: string,
): void {
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
  callback: () => void | Promise<void>,
): Promise<void> {
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


/*
 * =====================================================
 * 模擬 index.ts 的呼叫詞判斷
 * =====================================================
 */

const triggerWords = [
  '大內總管',
  '總管',
  '內內',
  '喳子',
  '渣子',
  '阿福',
];


function detectTrigger(
  message: string,
): boolean {

  return triggerWords.some(
    (trigger) =>
      message.includes(
        trigger,
      ),
  );
}


/*
 * =====================================================
 * Function Help → Vote Route Simulator
 * =====================================================
 *
 * 模擬 index.ts 目前的處理順序：
 *
 * Function Help
 *      ↓
 * Vote
 *      ↓
 * OTHER
 *
 * 不測 LINE API。
 *
 * 只測：
 *
 * - 路由優先順序
 * - 呼叫詞
 * - Function Help 是否搶走 Vote
 * - Vote 是否能正常取得投票指令
 * =====================================================
 */

async function simulateRoute(
  input: {
    message: string;
    sourceType: 'group' | 'user';
    groupId?: string;
    userId: string;
  },
): Promise<{
  route: RouteName;
  reply?: string;
}> {

  const {
    message,
    sourceType,
    groupId,
    userId,
  } = input;


  const hasTrigger =
    detectTrigger(
      message,
    );


  /*
   * =====================================================
   * Function Help
   * =====================================================
   */

  const functionHelpResult =
    handleFunctionHelp(
      message,
      hasTrigger,
    );

  if (
    functionHelpResult.handled
  ) {
    return {
      route:
        'FUNCTION_HELP',

      reply:
        functionHelpResult.reply,
    };
  }


  /*
   * =====================================================
   * Vote
   * =====================================================
   */

  if (
    sourceType === 'group' &&
    groupId
  ) {

    const voteResult =
      await handleVoteMessage({
        groupId,
        userId,
        message,

        generateOptions:
          async () => [],
      });

    if (
      voteResult.handled
    ) {
      return {
        route:
          'VOTE',

        reply:
          voteResult.message,
      };
    }
  }


  /*
   * =====================================================
   * OTHER
   * =====================================================
   */

  return {
    route:
      'OTHER',
  };
}


async function main() {


  /*
   * =====================================================
   * 普通聊天
   * =====================================================
   */

  await test(
    '普通聊天不被 Function Help 或 Vote 接管',
    async () => {

      const result =
        await simulateRoute({
          message:
            '今天好累',

          sourceType:
            'group',

          groupId:
            'function-help-route-normal-chat',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'OTHER',
        '普通聊天應進入 OTHER',
      );
    },
  );


  /*
   * =====================================================
   * 沒有呼叫詞
   * =====================================================
   */

  await test(
    '沒有呼叫詞的功能詢問不被 Function Help 接管',
    async () => {

      const result =
        await simulateRoute({
          message:
            '有什麼功能',

          sourceType:
            'group',

          groupId:
            'function-help-route-no-trigger-help',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'OTHER',
        '沒有呼叫詞不應進入 Function Help',
      );
    },
  );


  await test(
    '沒有呼叫詞不能建立新投票',
    async () => {

      const result =
        await simulateRoute({
          message:
            '投票今天玩什麼遊戲',

          sourceType:
            'group',

          groupId:
            'function-help-route-no-trigger-vote',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'OTHER',
        '沒有呼叫詞不能建立新投票',
      );
    },
  );


  /*
   * =====================================================
   * 所有呼叫詞
   * =====================================================
   */

  await test(
    '喳子可以進入 Function Help',
    async () => {

      const result =
        await simulateRoute({
          message:
            '喳子，有什麼功能',

          sourceType:
            'group',

          groupId:
            'function-help-route-trigger-1',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '喳子應進入 Function Help',
      );
    },
  );


  await test(
    '內內可以進入 Function Help',
    async () => {

      const result =
        await simulateRoute({
          message:
            '內內，有什麼功能',

          sourceType:
            'group',

          groupId:
            'function-help-route-trigger-2',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '內內應進入 Function Help',
      );
    },
  );


  await test(
    '總管可以進入 Function Help',
    async () => {

      const result =
        await simulateRoute({
          message:
            '總管，有什麼功能',

          sourceType:
            'group',

          groupId:
            'function-help-route-trigger-3',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '總管應進入 Function Help',
      );
    },
  );


  await test(
    '大內總管可以進入 Function Help',
    async () => {

      const result =
        await simulateRoute({
          message:
            '大內總管，有什麼功能',

          sourceType:
            'group',

          groupId:
            'function-help-route-trigger-4',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '大內總管應進入 Function Help',
      );
    },
  );


  await test(
    '渣子可以進入 Function Help',
    async () => {

      const result =
        await simulateRoute({
          message:
            '渣子，有什麼功能',

          sourceType:
            'group',

          groupId:
            'function-help-route-trigger-5',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '渣子應進入 Function Help',
      );
    },
  );


  await test(
    '阿福可以進入 Function Help',
    async () => {

      const result =
        await simulateRoute({
          message:
            '阿福，有什麼功能',

          sourceType:
            'group',

          groupId:
            'function-help-route-trigger-af',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '阿福應進入 Function Help',
      );
    },
  );


  /*
   * =====================================================
   * Function Help 優先於 Vote
   * =====================================================
   */

  await test(
    '投票怎麼用由 Function Help 處理而不是 Vote',
    async () => {

      const result =
        await simulateRoute({
          message:
            '喳子，投票怎麼用',

          sourceType:
            'group',

          groupId:
            'function-help-route-vote-help',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '投票說明應優先進入 Function Help',
      );
    },
  );


  await test(
    '直接詢問投票由 Function Help 處理',
    async () => {

      const result =
        await simulateRoute({
          message:
            '喳子，投票',

          sourceType:
            'group',

          groupId:
            'function-help-route-vote-direct',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '直接詢問投票應進入 Function Help',
      );
    },
  );


  await test(
    '投票詳細說明由 Function Help 處理',
    async () => {

      const result =
        await simulateRoute({
          message:
            '阿福，投票詳細說明',

          sourceType:
            'group',

          groupId:
            'function-help-route-vote-detail',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '投票詳細說明應進入 Function Help',
      );
    },
  );


  await test(
    '提醒怎麼用由 Function Help 處理',
    async () => {

      const result =
        await simulateRoute({
          message:
            '總管，提醒怎麼用',

          sourceType:
            'group',

          groupId:
            'function-help-route-reminder-help',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '提醒說明應進入 Function Help',
      );
    },
  );


  await test(
    '位置怎麼用由 Function Help 處理',
    async () => {

      const result =
        await simulateRoute({
          message:
            '大內總管，位置怎麼用',

          sourceType:
            'group',

          groupId:
            'function-help-route-location-help',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '位置說明應進入 Function Help',
      );
    },
  );


  /*
   * =====================================================
   * 正式投票
   * =====================================================
   */

  await test(
    '正式投票指令不被 Function Help 攔截',
    async () => {

      const result =
        await simulateRoute({
          message:
            '喳子，投票今天玩什麼遊戲',

          sourceType:
            'group',

          groupId:
            'function-help-route-real-vote',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'VOTE',
        '正式投票應進入 Vote Route',
      );
    },
  );


  await test(
    '阿福可以建立正式投票',
    async () => {

      const result =
        await simulateRoute({
          message:
            '阿福，投票今天玩什麼遊戲',

          sourceType:
            'group',

          groupId:
            'function-help-route-af-vote',

          userId:
            'user-1',
        });

      assertEqual(
        result.route,
        'VOTE',
        '阿福的正式投票應進入 Vote Route',
      );
    },
  );


  /*
   * =====================================================
   * 私訊
   * =====================================================
   */

  await test(
    '私訊可以使用 Function Help',
    async () => {

      const result =
        await simulateRoute({
          message:
            '喳子，有什麼功能',

          sourceType:
            'user',

          userId:
            'user-private-1',
        });

      assertEqual(
        result.route,
        'FUNCTION_HELP',
        '私訊應可以使用 Function Help',
      );
    },
  );


  await test(
    '私訊不建立 Vote',
    async () => {

      const result =
        await simulateRoute({
          message:
            '喳子，投票今天玩什麼遊戲',

          sourceType:
            'user',

          userId:
            'user-private-2',
        });

      assertEqual(
        result.route,
        'OTHER',
        '私訊不應建立 Vote',
      );
    },
  );


  console.log(
    '\n🎉 所有 Function Help Route 測試完成。',
  );
}


main()
  .catch(
    (error) => {

      console.error(
        '\n測試中止。',
      );

      console.error(
        error,
      );

      process.exit(
        1,
      );
    },
  );