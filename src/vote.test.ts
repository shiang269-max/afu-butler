import {

  startVote,

  createVote,

  setVoteOptionSource,

  setExpectedVoterCount,

  addVoteOptions,

  removeVoteOption,

  startVoting,

  getActiveVote,

  findVoteOption,

  castVote,

  getVoteResult,

  finishVote,

  resolveVoteTie,

  cancelVote,

  getVoteById,

  clearVoteState,

} from './vote';


/**
 * =========================================================
 * Test Helpers
 * =========================================================
 */

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

  if (
    actual !==
    expected
  ) {

    throw new Error(

      [
        `❌ ${message}`,
        `Expected: ${expected}`,
        `Actual: ${actual}`,
      ].join(
        '\n',
      ),

    );

  }

}


function test(
  name: string,
  callback: () => void,
): void {

  clearVoteState();


  try {

    callback();


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


/**
 * =========================================================
 * 1. 發起投票
 * =========================================================
 */

test(
  '發起投票',
  () => {

    const vote =
      startVote({

        groupId:
          'group-1',

        title:
          '晚餐吃什麼',

        createdBy:
          'user-1',

      });


    assertEqual(
      vote.status,
      'SETUP',
      '新投票應為 SETUP',
    );


    assertEqual(
      vote.title,
      '晚餐吃什麼',
      '投票題目錯誤',
    );

  },
);


/**
 * =========================================================
 * 2. 群組隔離
 * =========================================================
 */

test(
  '不同群組隔離',
  () => {

    startVote({

      groupId:
        'group-a',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    startVote({

      groupId:
        'group-b',

      title:
        '下午活動',

      createdBy:
        'user-2',

    });


    assert(
      getActiveVote(
        'group-a',
      )
      !==
      null,
      'group-a 應存在投票',
    );


    assert(
      getActiveVote(
        'group-b',
      )
      !==
      null,
      'group-b 應存在投票',
    );

  },
);


/**
 * =========================================================
 * 3. 同群組禁止第二場
 * =========================================================
 */

test(
  '同群組禁止同時第二場投票',
  () => {

    startVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    let failed =
      false;


    try {

      startVote({

        groupId:
          'group-1',

        title:
          '下午活動',

        createdBy:
          'user-2',

      });

    } catch {

      failed =
        true;

    }


    assert(
      failed,
      '應禁止同群組第二場投票',
    );

  },
);


/**
 * =========================================================
 * 4. 設定選項來源
 * =========================================================
 */

test(
  '設定選項來源',
  () => {

    startVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    const vote =
      setVoteOptionSource({

        groupId:
          'group-1',

        optionSource:
          'AI',

      });


    assertEqual(
      vote.optionSource,
      'AI',
      '選項來源錯誤',
    );


    assertEqual(
      vote.status,
      'COLLECTING_OPTIONS',
      '應進入 COLLECTING_OPTIONS',
    );

  },
);


/**
 * =========================================================
 * 5. 設定參與人數
 * =========================================================
 */

test(
  '設定參與人數',
  () => {

    startVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    const vote =
      setExpectedVoterCount({

        groupId:
          'group-1',

        expectedVoterCount:
          4,

      });


    assertEqual(
      vote.expectedVoterCount,
      4,
      '參與人數錯誤',
    );

  },
);


/**
 * =========================================================
 * 6. 新增候選項目
 * =========================================================
 */

test(
  '新增候選項目',
  () => {

    startVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    setVoteOptionSource({

      groupId:
        'group-1',

      optionSource:
        'MEMBERS',

    });


    const vote =
      addVoteOptions(

        'group-1',

        [
          '火鍋',
          '燒肉',
          '牛肉麵',
        ],

      );


    assertEqual(
      vote.options.length,
      3,
      '候選項目數量錯誤',
    );


    assertEqual(
      vote.status,
      'READY',
      '三個候選項目後應 READY',
    );

  },
);


/**
 * =========================================================
 * 7. 候選項目去重
 * =========================================================
 */

test(
  '候選項目去重',
  () => {

    startVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    setVoteOptionSource({

      groupId:
        'group-1',

      optionSource:
        'MEMBERS',

    });


    const vote =
      addVoteOptions(

        'group-1',

        [
          '火鍋',
          '燒肉',
          '火鍋',
          ' 燒肉 ',
        ],

      );


    assertEqual(
      vote.options.length,
      2,
      '重複選項應被去除',
    );

  },
);


/**
 * =========================================================
 * 8. 移除候選項目
 * =========================================================
 */

test(
  '候選項目討論階段可以移除',
  () => {

    startVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    setVoteOptionSource({

      groupId:
        'group-1',

      optionSource:
        'AI',

    });


    addVoteOptions(

      'group-1',

      [
        '火鍋',
        '燒肉',
        '牛肉麵',
      ],

    );


    const vote =
      removeVoteOption(

        'group-1',

        '火鍋',

      );


    assertEqual(
      vote.options.length,
      2,
      '火鍋應被移除',
    );


    assert(
      !vote.options.some(
        (option) =>
          option.text ===
          '火鍋',
      ),
      '候選項目不應再有火鍋',
    );

  },
);


/**
 * =========================================================
 * 9. 開始投票
 * =========================================================
 */

test(
  '開始正式投票',
  () => {

    startVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    setExpectedVoterCount({

      groupId:
        'group-1',

      expectedVoterCount:
        3,

    });


    setVoteOptionSource({

      groupId:
        'group-1',

      optionSource:
        'MEMBERS',

    });


    addVoteOptions(

      'group-1',

      [
        '火鍋',
        '燒肉',
      ],

    );


    const vote =
      startVoting(
        'group-1',
      );


    assertEqual(
      vote.status,
      'ACTIVE',
      '應進入 ACTIVE',
    );

  },
);


/**
 * =========================================================
 * 10. 未設定人數不能開始
 * =========================================================
 */

test(
  '未設定參與人數不能開始投票',
  () => {

    startVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      createdBy:
        'user-1',

    });


    setVoteOptionSource({

      groupId:
        'group-1',

      optionSource:
        'MEMBERS',

    });


    addVoteOptions(

      'group-1',

      [
        '火鍋',
        '燒肉',
      ],

    );


    let failed =
      false;


    try {

      startVoting(
        'group-1',
      );

    } catch {

      failed =
        true;

    }


    assert(
      failed,
      '未設定人數不能開始',
    );

  },
);


/**
 * =========================================================
 * 11. 數字投票
 * =========================================================
 */

test(
  '數字投票',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        3,

    });


    const result =
      castVote(

        'group-1',

        'user-1',

        '1',

      );


    assertEqual(
      result.option.text,
      '火鍋',
      '數字 1 應投給火鍋',
    );

  },
);


/**
 * =========================================================
 * 12. 文字投票
 * =========================================================
 */

test(
  '文字選項投票',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        3,

    });


    const result =
      castVote(

        'group-1',

        'user-1',

        '燒肉',

      );


    assertEqual(
      result.option.text,
      '燒肉',
      '文字應投給燒肉',
    );

  },
);


/**
 * =========================================================
 * 13. 重複投同一選項
 * =========================================================
 */

test(
  '重複投同一選項不增加票數',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        3,

    });


    castVote(
      'group-1',
      'user-1',
      '1',
    );


    const result =
      castVote(
        'group-1',
        'user-1',
        '1',
      );


    assertEqual(
      result.changed,
      false,
      '重複投同一選項不應視為改票',
    );


    const vote =
      getActiveVote(
        'group-1',
      );


    assert(
      vote !== null,
      '投票應仍存在',
    );


    assertEqual(
      Object.keys(
        vote.votes,
      ).length,
      1,
      '重複投票仍只能有一票',
    );

  },
);


/**
 * =========================================================
 * 14. 改票
 * =========================================================
 */

test(
  '改票',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        3,

    });


    castVote(
      'group-1',
      'user-1',
      '火鍋',
    );


    const result =
      castVote(
        'group-1',
        'user-1',
        '燒肉',
      );


    assertEqual(
      result.changed,
      true,
      '應視為改票',
    );


    assertEqual(
      result.previousOption?.text,
      '火鍋',
      '原本選項錯誤',
    );


    assertEqual(
      result.option.text,
      '燒肉',
      '新選項錯誤',
    );

  },
);


/**
 * =========================================================
 * 15. 不存在選項
 * =========================================================
 */

test(
  '不存在選項',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        3,

    });


    let failed =
      false;


    try {

      castVote(
        'group-1',
        'user-1',
        '壽司',
      );

    } catch {

      failed =
        true;

    }


    assert(
      failed,
      '不存在選項應失敗',
    );

  },
);


/**
 * =========================================================
 * 16. 自動結束
 * =========================================================
 */

test(
  '所有人投票後自動結束',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        3,

    });


    castVote(
      'group-1',
      'user-1',
      '火鍋',
    );


    castVote(
      'group-1',
      'user-2',
      '火鍋',
    );


    const result =
      castVote(
        'group-1',
        'user-3',
        '燒肉',
      );


    assertEqual(
      result.isComplete,
      true,
      '第三人投票後應完成',
    );


    assert(
      result.finishResult !==
      null,
      '應有自動結束結果',
    );


    assertEqual(
      result.finishResult?.state,
      'WINNER',
      '火鍋應勝出',
    );


    assertEqual(
      getActiveVote(
        'group-1',
      ),
      null,
      '勝出後不應保留進行中投票',
    );

  },
);


/**
 * =========================================================
 * 17. 手動結束
 * =========================================================
 */

test(
  '手動結束投票',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        4,

    });


    castVote(
      'group-1',
      'user-1',
      '火鍋',
    );


    castVote(
      'group-1',
      'user-2',
      '燒肉',
    );


    const result =
      finishVote(
        'group-1',
      );


    assertEqual(
      result.state,
      'TIE',
      '兩票平手應進入 TIE',
    );

  },
);


/**
 * =========================================================
 * 18. 平手重新投票
 * =========================================================
 */

test(
  '平手項目再次投票',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
          '牛肉麵',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        2,

    });


    castVote(
      'group-1',
      'user-1',
      '火鍋',
    );


    const tieResult =
      castVote(
        'group-1',
        'user-2',
        '燒肉',
      );


    assertEqual(
      tieResult.finishResult?.state,
      'TIE',
      '應進入平手',
    );


    const vote =
      resolveVoteTie(
        'group-1',
        'REVOTE_TIED',
      );


    assertEqual(
      vote.status,
      'ACTIVE',
      '應直接重新投票',
    );


    assertEqual(
      vote.options.length,
      2,
      '應只保留平手項目',
    );


    assert(
      vote.options.every(
        (option) =>
          option.text === '火鍋'
          ||
          option.text === '燒肉',
      ),
      '只應保留平手項目',
    );

  },
);


/**
 * =========================================================
 * 19. 平手後加入選項
 * =========================================================
 */

test(
  '平手後保留平手項目加入新選項',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
          '牛肉麵',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        2,

    });


    castVote(
      'group-1',
      'user-1',
      '火鍋',
    );


    castVote(
      'group-1',
      'user-2',
      '燒肉',
    );


    const vote =
      resolveVoteTie(
        'group-1',
        'ADD_OPTIONS',
      );


    assertEqual(
      vote.status,
      'COLLECTING_OPTIONS',
      '應回到候選項目收集',
    );


    addVoteOptions(
      'group-1',
      [
        '壽司',
      ],
    );


    assertEqual(
      vote.options.length,
      3,
      '應保留兩個平手項目並加入壽司',
    );

  },
);


/**
 * =========================================================
 * 20. 投票開始後禁止新增選項
 * =========================================================
 */

test(
  '投票開始後禁止新增選項',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        3,

    });


    let failed =
      false;


    try {

      addVoteOptions(
        'group-1',
        [
          '壽司',
        ],
      );

    } catch {

      failed =
        true;

    }


    assert(
      failed,
      '投票開始後不應新增選項',
    );

  },
);


/**
 * =========================================================
 * 21. 投票開始後禁止移除選項
 * =========================================================
 */

test(
  '投票開始後禁止移除選項',
  () => {

    createVote({

      groupId:
        'group-1',

      title:
        '晚餐',

      options:
        [
          '火鍋',
          '燒肉',
        ],

      createdBy:
        'user-1',

      expectedVoterCount:
        3,

    });


    let failed =
      false;


    try {

      removeVoteOption(
        'group-1',
        '火鍋',
      );

    } catch {

      failed =
        true;

    }


    assert(
      failed,
      '投票開始後不應移除選項',
    );

  },
);


/**
 * =========================================================
 * 22. 取消投票
 * =========================================================
 */

test(
  '取消投票',
  () => {

    const vote =
      startVote({

        groupId:
          'group-1',

        title:
          '晚餐',

        createdBy:
          'user-1',

      });


    const cancelled =
      cancelVote(
        'group-1',
      );


    assertEqual(
      cancelled.status,
      'CANCELLED',
      '應變為 CANCELLED',
    );


    assertEqual(
      getActiveVote(
        'group-1',
      ),
      null,
      '取消後不應保留進行中投票',
    );


    const history =
      getVoteById(
        vote.id,
      );


    assert(
      history !== null,
      '取消投票應保留歷史',
    );

  },
);


/**
 * =========================================================
 * 23. 直接建立完整投票
 * =========================================================
 */

test(
  '直接建立完整投票',
  () => {

    const vote =
      createVote({

        groupId:
          'group-1',

        title:
          '晚餐',

        options:
          [
            '火鍋',
            '燒肉',
          ],

        createdBy:
          'user-1',

        expectedVoterCount:
          2,

        optionSource:
          'AI',

      });


    assertEqual(
      vote.status,
      'ACTIVE',
      '完整建立後應直接 ACTIVE',
    );


    assertEqual(
      vote.optionSource,
      'AI',
      '選項來源應保留',
    );


    assertEqual(
      vote.expectedVoterCount,
      2,
      '參與人數錯誤',
    );

  },
);


/**
 * =========================================================
 * 24. 查詢選項
 * =========================================================
 */

test(
  '選項查詢',
  () => {

    const vote =
      createVote({

        groupId:
          'group-1',

        title:
          '晚餐',

        options:
          [
            '火鍋',
            '燒肉',
          ],

        createdBy:
          'user-1',

        expectedVoterCount:
          2,

      });


    assertEqual(
      findVoteOption(
        vote,
        '1',
      )?.text,
      '火鍋',
      '數字查詢錯誤',
    );


    assertEqual(
      findVoteOption(
        vote,
        '燒肉',
      )?.text,
      '燒肉',
      '文字查詢錯誤',
    );

  },
);


/**
 * =========================================================
 * 25. 投票統計
 * =========================================================
 */

test(
  '投票統計',
  () => {

    const vote =
      createVote({

        groupId:
          'group-1',

        title:
          '晚餐',

        options:
          [
            '火鍋',
            '燒肉',
            '牛肉麵',
          ],

        createdBy:
          'user-1',

        expectedVoterCount:
          4,

      });


    castVote(
      'group-1',
      'user-1',
      '火鍋',
    );


    castVote(
      'group-1',
      'user-2',
      '火鍋',
    );


    castVote(
      'group-1',
      'user-3',
      '燒肉',
    );


    const result =
      getVoteResult(
        vote,
      );


    assertEqual(
      result.totalVotes,
      3,
      '總票數應為 3',
    );


    assertEqual(
      result.remainingVotes,
      1,
      '剩餘票數應為 1',
    );


    assertEqual(
      result.winners[0]?.text,
      '火鍋',
      '火鍋應暫時領先',
    );

  },
);


console.log(
  '\n🎉 所有新版 Vote System 測試完成。',
);