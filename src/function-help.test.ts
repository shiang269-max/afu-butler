import {
  handleFunctionHelp,
} from './function-help';


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


async function main() {

  /*
   * =====================================================
   * 沒有呼叫詞
   * =====================================================
   */

  await test(
    '沒有呼叫詞時不接管',
    () => {

      const result =
        handleFunctionHelp(
          '有什麼功能',
          false,
        );

      assertEqual(
        result.handled,
        false,
        '沒有呼叫詞不應進入 Function Help',
      );
    },
  );


  /*
   * =====================================================
   * 功能列表
   * =====================================================
   */

  await test(
    '有呼叫詞時可以查看功能列表',
    () => {

      const result =
        handleFunctionHelp(
          '有什麼功能',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '功能列表應被處理',
      );

      assert(
        typeof result.reply === 'string' &&
        result.reply.length > 0,
        '應回傳功能列表內容',
      );
    },
  );


  await test(
    '功能列表包含目前主要可操作功能',
    () => {

      const result =
        handleFunctionHelp(
          '功能',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '功能列表應被處理',
      );

      const reply =
        result.reply || '';

      assert(
        reply.includes('投票'),
        '功能列表應包含投票',
      );

      assert(
        reply.includes('提醒'),
        '功能列表應包含提醒',
      );

      assert(
        reply.includes('位置'),
        '功能列表應包含位置',
      );
    },
  );


  /*
   * =====================================================
   * 投票功能說明
   * =====================================================
   */

  await test(
    '可以查看投票功能說明',
    () => {

      const result =
        handleFunctionHelp(
          '投票怎麼用',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '投票說明應被處理',
      );

      const reply =
        result.reply || '';

      assert(
        reply.includes('投票'),
        '投票說明應包含投票內容',
      );
    },
  );


  await test(
    '直接說功能名稱可以查看投票功能說明',
    () => {

      const result =
        handleFunctionHelp(
          '投票',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '直接說投票應可查看功能說明',
      );

      const reply =
        result.reply || '';

      assert(
        reply.includes('投票'),
        '投票說明應包含投票內容',
      );
    },
  );


  await test(
    '投票詳細說明可以被處理',
    () => {

      const result =
        handleFunctionHelp(
          '投票詳細說明',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '投票詳細說明應被處理',
      );
    },
  );


  await test(
    '投票可以做什麼可以被處理',
    () => {

      const result =
        handleFunctionHelp(
          '投票可以做什麼',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '投票功能詢問應被處理',
      );
    },
  );


  await test(
    '正式投票指令不被 Function Help 接管',
    () => {

      const result =
        handleFunctionHelp(
          '投票今天玩什麼遊戲',
          true,
        );

      assertEqual(
        result.handled,
        false,
        '正式投票指令不應被 Function Help 接管',
      );
    },
  );


  await test(
    '另一種正式投票指令不被 Function Help 接管',
    () => {

      const result =
        handleFunctionHelp(
          '投票晚上去哪裡玩',
          true,
        );

      assertEqual(
        result.handled,
        false,
        '正式投票指令不應被 Function Help 接管',
      );
    },
  );


  /*
   * =====================================================
   * 提醒功能說明
   * =====================================================
   */

  await test(
    '可以查看提醒功能說明',
    () => {

      const result =
        handleFunctionHelp(
          '提醒怎麼用',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '提醒說明應被處理',
      );

      const reply =
        result.reply || '';

      assert(
        reply.includes('提醒'),
        '提醒說明應包含提醒內容',
      );
    },
  );


  await test(
    '直接說提醒可以查看功能說明',
    () => {

      const result =
        handleFunctionHelp(
          '提醒',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '直接說提醒應可查看功能說明',
      );
    },
  );


  /*
   * =====================================================
   * 位置功能說明
   * =====================================================
   */

  await test(
    '可以查看位置功能說明',
    () => {

      const result =
        handleFunctionHelp(
          '位置怎麼用',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '位置說明應被處理',
      );

      const reply =
        result.reply || '';

      assert(
        reply.includes('位置'),
        '位置說明應包含位置內容',
      );
    },
  );


  await test(
    '直接說位置可以查看功能說明',
    () => {

      const result =
        handleFunctionHelp(
          '位置',
          true,
        );

      assertEqual(
        result.handled,
        true,
        '直接說位置應可查看功能說明',
      );
    },
  );


  /*
   * =====================================================
   * 未來可擴充功能
   * =====================================================
   *
   * 不直接檢查目前是否存在「切換」。
   *
   * 因為切換功能目前尚未正式加入，
   * 不應讓測試依賴尚不存在的功能。
   *
   * 之後新增功能時，
   * 只需要補上對應測試即可。
   * =====================================================
   */


  /*
   * =====================================================
   * 呼叫詞
   * =====================================================
   *
   * Function Help 本身接收 hasTrigger，
   * 不自己判斷實際呼叫詞。
   *
   * 因此這裡確認：
   * 只要上游傳入 true，
   * Function Help 都可以正常處理。
   * =====================================================
   */

  await test(
    '上游確認有呼叫詞後可以處理',
    () => {

      const result =
        handleFunctionHelp(
          '有什麼功能',
          true,
        );

      assertEqual(
        result.handled,
        true,
        'hasTrigger=true 時應可處理',
      );
    },
  );


  console.log(
    '\n🎉 所有 Function Help 測試完成。',
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