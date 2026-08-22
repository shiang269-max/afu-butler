import {
  handleVoteMessage,
} from './vote-handler';

import {
  clearVoteState,
  getActiveVote,
} from './vote';


interface MockLineEvent {

  source: {
    type:
      | 'group'
      | 'user';

    groupId?:
      string;

    userId?:
      string;
  };

  message: {
    type:
      'text';

    text:
      string;
  };

  replyToken:
    string;
}


interface SimulatedRouteResult {

  routedToVote:
    boolean;

  handled:
    boolean;

  reply?:
    string;

  enteredAiCore:
    boolean;
}


/**
 * =========================================================
 * Vote Route Simulator
 * =========================================================
 *
 * 模擬目前 index.ts 的 Vote Route。
 *
 * 真實流程：
 *
 * LINE Event
 *     ↓
 * source.type === group ?
 *     ↓
 * groupId
 *     ↓
 * handleVoteMessage()
 *     ↓
 * handled=true
 *     ↓
 * LINE reply
 *     ↓
 * return
 *
 *
 * handled=false：
 *
 * Vote 不接管
 *     ↓
 * 保留後續既有流程
 *
 *
 * 私訊：
 *
 * source.type === user
 *     ↓
 * 不建立群組投票
 *     ↓
 * 保留既有私訊流程
 *
 *
 * 本測試不啟動：
 *
 * - Express
 * - LINE SDK
 * - Gemini
 * - Memory
 * - Observer
 * - Reminder
 *
 *
 * 也不修改：
 *
 * - index.ts
 * - vote.ts
 * - vote-handler.ts
 *
 * =========================================================
 */


function assert(
  condition:
    unknown,

  message:
    string,
): asserts condition {

  if (!condition) {

    throw new Error(
      `❌ ${message}`,
    );

  }

}


function assertEqual<T>(
  actual:
    T,

  expected:
    T,

  message:
    string,
): void {

  if (
    actual !==
    expected
  ) {

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
  name:
    string,

  callback:
    () =>
      Promise<void>
      | void,
): Promise<void> {

  clearVoteState();

  try {

    await callback();

    console.log(
      `✅ ${name}`,
    );

  } catch (
    error
  ) {

    console.error(
      `❌ ${name}`,
    );

    throw error;

  }

}


/**
 * =========================================================
 * 模擬 index.ts Vote Route
 * =========================================================
 */

async function simulateVoteRoute(
  event:
    MockLineEvent,
): Promise<SimulatedRouteResult> {

  /**
   * -------------------------------------------------------
   * 私訊
   * -------------------------------------------------------
   */

  if (
    event.source.type !==
      'group'
    ||
    !event.source.groupId
  ) {

    return {

      routedToVote:
        false,

      handled:
        false,

      enteredAiCore:
        true,

    };

  }


  /**
   * -------------------------------------------------------
   * 群組
   * -------------------------------------------------------
   */

  const result =
    await handleVoteMessage({

      groupId:
        event.source.groupId,

      userId:
        event.source.userId ||
        '',

      message:
        event.message.text,

    });


  /**
   * -------------------------------------------------------
   * Vote Handler 已接管
   * -------------------------------------------------------
   */

  if (
    result.handled
  ) {

    return {

      routedToVote:
        true,

      handled:
        true,

      reply:
        result.message,

      enteredAiCore:
        false,

    };

  }


  /**
   * -------------------------------------------------------
   * Vote 不接管
   * -------------------------------------------------------
   *
   * 後續應交回既有流程。
   * -------------------------------------------------------
   */

  return {

    routedToVote:
      true,

    handled:
      false,

    reply:
      result.message,

    enteredAiCore:
      true,

  };

}


/**
 * =========================================================
 * 測試
 * =========================================================
 */

async function runTests(): Promise<void> {


  /**
   * =======================================================
   * 1. 普通群組聊天
   * =======================================================
   */

  await test(
    '普通群組聊天不被 Vote Route 接管',

    async () => {

      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId:
              'route-group-1',

            userId:
              'user-1',

          },

          message: {

            type:
              'text',

            text:
              '今天真的好熱。',

          },

          replyToken:
            'mock-reply-1',

        });


      assertEqual(
        result.routedToVote,
        true,
        '群組訊息應經過 Vote Route',
      );


      assertEqual(
        result.handled,
        false,
        '普通聊天不應被 Vote 接管',
      );


      assertEqual(
        result.enteredAiCore,
        true,
        'Vote 不接管後應保留後續流程',
      );

    },
  );


  /**
   * =======================================================
   * 2. 新投票
   * =======================================================
   */

  await test(
    '群組的新投票指令由 Vote Route 接管',

    async () => {

      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId:
              'route-group-2',

            userId:
              'user-1',

          },

          message: {

            type:
              'text',

            text:
              '喳子，投票今天玩什麼遊戲',

          },

          replyToken:
            'mock-reply-2',

        });


      assertEqual(
        result.routedToVote,
        true,
        '應進 Vote Route',
      );


      assertEqual(
        result.handled,
        true,
        '新投票應由 Vote 接管',
      );


      assertEqual(
        result.enteredAiCore,
        false,
        '投票接管後不得進 AI Core',
      );


      assert(
        typeof result.reply ===
          'string',

        '應有 Vote 回覆',
      );


      const vote =
        getActiveVote(
          'route-group-2',
        );


      assert(
        vote !==
          null,

        '應建立 Vote Session',
      );


      assertEqual(
        vote?.title,
        '今天玩什麼遊戲',
        '投票題目解析正確',
      );

    },
  );


  /**
   * =======================================================
   * 3. 沒有呼叫詞
   * =======================================================
   */

  await test(
    '沒有呼叫詞時不能建立新投票',

    async () => {

      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId:
              'route-group-3',

            userId:
              'user-1',

          },

          message: {

            type:
              'text',

            text:
              '投票今天玩什麼遊戲',

          },

          replyToken:
            'mock-reply-3',

        });


      assertEqual(
        result.handled,
        false,
        '沒有呼叫詞不能建立新投票',
      );


      assertEqual(
        result.enteredAiCore,
        true,
        '應回到既有後續流程',
      );


      assertEqual(
        getActiveVote(
          'route-group-3',
        ),
        null,
        '不應建立 Vote Session',
      );

    },
  );


  /**
   * =======================================================
   * 4. 呼叫詞直接連接投票
   * =======================================================
   */

  await test(
    '呼叫詞與投票指令直接相連仍能啟動',

    async () => {

      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId:
              'route-group-4',

            userId:
              'user-1',

          },

          message: {

            type:
              'text',

            text:
              '喳子投票晚上去哪裡玩',

          },

          replyToken:
            'mock-reply-4',

        });


      assertEqual(
        result.handled,
        true,
        '無空格格式仍應啟動',
      );


      assertEqual(
        result.enteredAiCore,
        false,
        '不應進 AI Core',
      );


      const vote =
        getActiveVote(
          'route-group-4',
        );


      assert(
        vote !==
          null,

        '應建立 Vote Session',
      );


      assertEqual(
        vote?.title,
        '晚上去哪裡玩',

        '題目不可保留呼叫詞',
      );

    },
  );


  /**
   * =======================================================
   * 5. 呼叫詞標點變化
   * =======================================================
   */

  await test(
    '不同呼叫詞標點格式都能啟動',

    async () => {

      const messages = [

        '喳子，投票去哪裡',

        '喳子投票去哪裡',

        '喳子：投票去哪裡',

        '喳子、投票去哪裡',

      ];


      for (
        const [
          index,
          message,
        ]
        of messages.entries()
      ) {

        const groupId =
          `route-group-5-${index}`;


        const result =
          await simulateVoteRoute({

            source: {

              type:
                'group',

              groupId,

              userId:
                'user-1',

            },

            message: {

              type:
                'text',

              text:
                message,

            },

            replyToken:
              `mock-reply-5-${index}`,

          });


        assertEqual(
          result.handled,
          true,

          `格式 ${index + 1} 應成功啟動`,
        );


        assertEqual(
          result.enteredAiCore,
          false,

          `格式 ${index + 1} 不應進 AI Core`,
        );

      }

    },
  );


  /**
   * =======================================================
   * 6. Session 建立後
   *    後續訊息不需要呼叫詞
   * =======================================================
   */

  await test(
    'Vote Session 建立後後續訊息不需要呼叫詞',

    async () => {

      const groupId =
        'route-group-6';


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '喳子，投票今天玩什麼遊戲',

        },

        replyToken:
          'mock-reply-6a',

      });


      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId,

            userId:
              'creator',

          },

          message: {

            type:
              'text',

            text:
              '2',

          },

          replyToken:
            'mock-reply-6b',

        });


      assertEqual(
        result.handled,
        true,

        'Session 內後續訊息應由 Vote 處理',
      );


      assertEqual(
        result.enteredAiCore,
        false,

        '不應進 AI Core',
      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !==
          null,

        'Vote Session 應存在',
      );


      assertEqual(
        vote?.optionSource,
        'AI',

        '2 應代表系統提供',
      );

    },
  );


  /**
   * =======================================================
   * 7. Session 內直接提供候選項目
   * =======================================================
   */

  await test(
    'Session 內可以直接提供候選項目',

    async () => {

      const groupId =
        'route-group-7';


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '喳子，投票今天玩什麼',

        },

        replyToken:
          'mock-reply-7a',

      });


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '自己提供',

        },

        replyToken:
          'mock-reply-7b',

      });


      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId,

            userId:
              'creator',

          },

          message: {

            type:
              'text',

            text:
              '看電影、打電動、去逛街',

          },

          replyToken:
            'mock-reply-7c',

        });


      assertEqual(
        result.handled,
        true,

        '候選項目應被 Vote 接管',
      );


      assertEqual(
        result.enteredAiCore,
        false,

        '候選項目不能進 AI Core',
      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !==
          null,

        'Vote Session 應存在',
      );


      assertEqual(
        vote?.options.length,
        3,

        '應有 3 個候選項目',
      );

    },
  );


  /**
   * =======================================================
   * 8. ACTIVE 投票自然語言
   * =======================================================
   */

  await test(
    'ACTIVE 投票可以不用呼叫詞直接投票',

    async () => {

      const groupId =
        'route-group-8';


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '喳子，投票今天玩什麼',

        },

        replyToken:
          'mock-reply-8a',

      });


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '自己提供',

        },

        replyToken:
          'mock-reply-8b',

      });


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '看電影、打電動、去逛街',

        },

        replyToken:
          'mock-reply-8c',

      });


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '3',

        },

        replyToken:
          'mock-reply-8d',

      });


      const startResult =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId,

            userId:
              'creator',

          },

          message: {

            type:
              'text',

            text:
              '開始',

          },

          replyToken:
            'mock-reply-8e',

        });


      assertEqual(
        startResult.handled,
        true,

        '開始指令應被接管',
      );


      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId,

            userId:
              'user-1',

          },

          message: {

            type:
              'text',

            text:
              '我要投看電影',

          },

          replyToken:
            'mock-reply-8f',

        });


      assertEqual(
        result.handled,
        true,

        '自然語言投票應被接管',
      );


      assertEqual(
        result.enteredAiCore,
        false,

        '有效投票不能進 AI Core',
      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !==
          null,

        'Vote Session 應存在',
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


  /**
   * =======================================================
   * 9. ACTIVE 普通聊天不誤判
   * =======================================================
   */

  await test(
    'ACTIVE 階段普通負面句不誤判為投票',

    async () => {

      const groupId =
        'route-group-9';


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '喳子，投票今天吃什麼',

        },

        replyToken:
          'mock-reply-9a',

      });


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '自己提供',

        },

        replyToken:
          'mock-reply-9b',

      });


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '火鍋、燒肉、牛肉麵',

        },

        replyToken:
          'mock-reply-9c',

      });


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '3',

        },

        replyToken:
          'mock-reply-9d',

      });


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'creator',

        },

        message: {

          type:
            'text',

          text:
            '開始',

        },

        replyToken:
          'mock-reply-9e',

      });


      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId,

            userId:
              'user-2',

          },

          message: {

            type:
              'text',

            text:
              '我不想吃火鍋',

          },

          replyToken:
            'mock-reply-9f',

        });


      assertEqual(
        result.handled,
        false,

        '普通負面句不應被 Vote 接管',
      );


      assertEqual(
        result.enteredAiCore,
        true,

        '應回到後續 AI 流程',
      );


      const vote =
        getActiveVote(
          groupId,
        );


      assert(
        vote !==
          null,

        'Vote Session 應仍存在',
      );


      assertEqual(
        Object.keys(
          vote.votes,
        ).length,
        0,

        '負面句不應產生票數',
      );

    },
  );


  /**
   * =======================================================
   * 10. 同群組第二場投票
   * =======================================================
   */

  await test(
    '同群組第二場投票由現有 Vote Session 優先處理',

    async () => {

      const groupId =
        'route-group-10';


      await simulateVoteRoute({

        source: {

          type:
            'group',

          groupId,

          userId:
            'user-1',

        },

        message: {

          type:
            'text',

          text:
            '喳子，投票今天玩什麼',

        },

        replyToken:
          'mock-reply-10a',

      });


      const result =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId,

            userId:
              'user-2',

          },

          message: {

            type:
              'text',

            text:
              '喳子，投票晚上去哪裡',

          },

          replyToken:
            'mock-reply-10b',

        });


      assertEqual(
        result.handled,
        true,

        '第二場請求應被 Vote 接住',
      );


      assertEqual(
        result.enteredAiCore,
        false,

        '不能把第二場請求丟到 AI Core',
      );


      assert(
        result.reply?.includes(
          '目前已有一場',
        ),

        '應提示已有投票',
      );

    },
  );


  /**
   * =======================================================
   * 11. 不同群組隔離
   * =======================================================
   */

  await test(
    '不同群組的 Vote Session 完全隔離',

    async () => {

      const resultA =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId:
              'route-group-11-A',

            userId:
              'user-a',

          },

          message: {

            type:
              'text',

            text:
              '喳子，投票A',

          },

          replyToken:
            'mock-reply-11a',

        });


      const resultB =
        await simulateVoteRoute({

          source: {

            type:
              'group',

            groupId:
              'route-group-11-B',

            userId:
              'user-b',

          },

          message: {

            type:
              'text',

            text:
              '喳子，投票B',

          },

          replyToken:
            'mock-reply-11b',

        });


      assertEqual(
        resultA.handled,
        true,

        'A 群組應成功建立投票',
      );


      assertEqual(
        resultB.handled,
        true,

        'B 群組應成功建立投票',
      );


      assert(
        getActiveVote(
          'route-group-11-A',
        ) !== null,

        'A 群組應有獨立投票',
      );


      assert(
        getActiveVote(
          'route-group-11-B',
        ) !== null,

        'B 群組應有獨立投票',
      );

    },
  );


  /**
   * =======================================================
   * 12. 私訊
   * =======================================================
   */

  await test(
    '私訊完全不進 Vote Route',

    async () => {

      const result =
        await simulateVoteRoute({

          source: {

            type:
              'user',

            userId:
              'private-user',

          },

          message: {

            type:
              'text',

            text:
              '喳子，投票今天玩什麼',

          },

          replyToken:
            'mock-reply-12',

        });


      assertEqual(
        result.routedToVote,
        false,

        '私訊不應建立群組 Vote',
      );


      assertEqual(
        result.handled,
        false,

        '私訊不應由 Vote Route 接管',
      );


      assertEqual(
        result.enteredAiCore,
        true,

        '私訊應保留既有流程',
      );

    },
  );


  console.log(
    '\n🎉 所有 Vote Route Simulator 測試完成。',
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