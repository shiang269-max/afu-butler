/**
 * =========================================================
 * Location Index Intent Integration Diagnostic Test
 * =========================================================
 *
 * 目的：
 *
 *   只檢查 src/index.ts 是否正確接上
 *   Location Intent Handler。
 *
 * 不啟動 Express
 * 不經 LINE
 * 不呼叫 Gemini
 * 不呼叫 Google API
 *
 * =========================================================
 *
 * 核心規則：
 *
 * 1. Location Intent 必須在 AI Core 前處理
 * 2. handled=true 必須停止後續流程
 * 3. handled=true 必須使用 LINE replyMessage
 * 4. handled=true 後不得再進 Reminder / Observer / AI Core
 * 5. handled=false 才能繼續既有流程
 * 6. Location Route Handler 與 Location Intent 不得重複處理
 * 7. Location Intent 不得重複呼叫
 *
 * =========================================================
 */

import * as fs from 'fs';
import * as path from 'path';


const INDEX_PATH =
  path.join(
    process.cwd(),
    'src',
    'index.ts',
  );


let passed =
  0;

let failed =
  0;


function section(
  title: string,
): void {

  console.log('');

  console.log(
    '---------------------------------------------------------',
  );

  console.log(
    title,
  );

  console.log(
    '---------------------------------------------------------',
  );
}


function assert(
  condition: boolean,
  message: string,
): void {

  if (
    condition
  ) {

    console.log(
      `[PASS] ${message}`,
    );

    passed += 1;

    return;
  }


  console.log(
    `[FAIL] ${message}`,
  );

  failed += 1;
}


function readIndex(): string {

  if (
    !fs.existsSync(
      INDEX_PATH,
    )
  ) {

    throw new Error(
      `找不到 ${INDEX_PATH}`,
    );
  }


  return fs.readFileSync(
    INDEX_PATH,
    'utf8',
  );
}


function countOccurrences(
  text: string,
  search: string,
): number {

  return (
    text.split(
      search,
    ).length - 1
  );
}


function positionOf(
  text: string,
  search: string,
): number {

  return text.indexOf(
    search,
  );
}


/**
 * =========================================================
 * Test 1
 * Import
 * =========================================================
 */

function testImport(
  source: string,
): void {

  section(
    'Test 1：Location Intent Handler Import',
  );


  assert(
    source.includes(
      "from './location/location-intent-handler'",
    ),
    'index.ts 必須 import location-intent-handler',
  );


  assert(
    source.includes(
      'handleLocationIntent',
    ),
    'index.ts 必須使用 handleLocationIntent',
  );


  assert(
    source.includes(
      'canExecuteLocationIntent',
    ),
    'index.ts 必須使用 canExecuteLocationIntent',
  );
}


/**
 * =========================================================
 * Test 2
 * Intent Handler 呼叫數量
 * =========================================================
 */

function testCallCount(
  source: string,
): void {

  section(
    'Test 2：Location Intent Handler 呼叫數量',
  );


  const count =
    countOccurrences(
      source,
      'handleLocationIntent(',
    );


  /*
   * 這裡預期：
   *
   * 1 次 import 名稱不會形成
   * "handleLocationIntent("
   *
   * 所以實際應只有 1 次。
   */

  assert(
    count === 1,
    `handleLocationIntent 必須只有 1 個實際呼叫，實際=${count}`,
  );
}


/**
 * =========================================================
 * Test 3
 * Intent Handler 必須在 AI Core 前
 * =========================================================
 */

function testPriorityBeforeAICore(
  source: string,
): void {

  section(
    'Test 3：Location Intent 必須優先於 AI Core',
  );


  const intentPosition =
    positionOf(
      source,
      'handleLocationIntent(',
    );


  const aiCorePosition =
    Math.min(
      ...[
        positionOf(
          source,
          'callGemini',
        ),

        positionOf(
          source,
          'generateAIResponse',
        ),

        positionOf(
          source,
          'handleAI',
        ),
      ].filter(
        (value) =>
          value >= 0,
      ),
    );


  assert(
    intentPosition >= 0,
    '必須找到 handleLocationIntent 實際呼叫',
  );


  if (
    aiCorePosition >= 0
  ) {

    assert(
      intentPosition <
        aiCorePosition,
      'Location Intent 必須位於 AI Core 前',
    );

  } else {

    console.log(
      '[PASS] 目前 index.ts 找不到指定 AI Core 呼叫名稱，跳過相對位置判斷',
    );

    passed += 1;
  }
}


/**
 * =========================================================
 * Test 4
 * handled 結果必須被保存
 * =========================================================
 */

function testResultVariable(
  source: string,
): void {

  section(
    'Test 4：Location Intent 結果必須被保存',
  );


  assert(
    source.includes(
      'locationIntentResult',
    ),
    'index.ts 必須將 Intent 結果存入 locationIntentResult',
  );


  assert(
    source.includes(
      'locationIntentResult.handled',
    ),
    'index.ts 必須檢查 locationIntentResult.handled',
  );
}


/**
 * =========================================================
 * Test 5
 * handled=true 必須停止流程
 * =========================================================
 */

function testHandledControlFlow(
  source: string,
): void {

  section(
    'Test 5：handled=true 必須停止後續流程',
  );


  const handledPosition =
    positionOf(
      source,
      'if (',
    );


  assert(
    source.includes(
      'locationIntentResult.handled',
    ),
    '必須存在 handled 判斷',
  );


  assert(
    source.includes(
      'locationReply',
    ),
    'handled=true 後必須建立 Location Intent 回覆內容',
  );


  assert(
    source.includes(
      'lineClient.replyMessage',
    ),
    'handled=true 後必須呼叫 lineClient.replyMessage',
  );


  assert(
    source.includes(
      'event.replyToken',
    ),
    'Location Intent 回覆必須使用 event.replyToken',
  );


  /*
   * 找 Location Intent 區塊附近的 return。
   */

  const intentPosition =
    positionOf(
      source,
      'handleLocationIntent(',
    );


  const returnPosition =
    source.indexOf(
      'return;',
      intentPosition,
    );


  assert(
    intentPosition >= 0 &&
    returnPosition > intentPosition,
    'Location Intent handled=true 後必須存在 return',
  );
}


/**
 * =========================================================
 * Test 6
 * Reminder 必須在 Location Intent 後
 * =========================================================
 */

function testBeforeReminder(
  source: string,
): void {

  section(
    'Test 6：Location Intent 必須優先於 Reminder',
  );


  const intentPosition =
    positionOf(
      source,
      'handleLocationIntent(',
    );


  /*
   * 不使用全檔案的「Reminder」字串位置。
   * index.ts 前面的 import / 註解本身就可能包含 Reminder。
   *
   * 這裡改用實際 Reminder Handler 的呼叫位置。
   */

  const reminderMarkers = [
    'handleReminderMessage(',
    'handleReminder(',
  ];

  const reminderPositions =
    reminderMarkers
      .map(
        (marker) =>
          positionOf(
            source,
            marker,
          ),
      )
      .filter(
        (value) =>
          value >= 0,
      );

  const reminderPosition =
    reminderPositions.length > 0
      ? Math.min(
          ...reminderPositions,
        )
      : -1;


  assert(
    intentPosition >= 0,
    '必須找到 Location Intent',
  );


  if (
    reminderPosition >= 0
  ) {

    assert(
      intentPosition <
        reminderPosition,
      'Location Intent 必須位於 Reminder Handler 前',
    );

  } else {

    console.log(
      '[PASS] 目前 index.ts 找不到實際 Reminder Handler 呼叫，跳過相對位置判斷',
    );

    passed += 1;
  }
}


/**
 * =========================================================
 * Test 7
 * Observer 必須在 Location Intent 後
 * =========================================================
 */

function testBeforeObserver(
  source: string,
): void {

  section(
    'Test 7：Location Intent 必須優先於 Observer',
  );


  const intentPosition =
    positionOf(
      source,
      'handleLocationIntent(',
    );


  /*
   * 不使用全檔案的「Observer」字串位置。
   * import / 註解可能比 Location Intent 更早出現。
   *
   * 改用實際 Observer Handler 的呼叫位置。
   */

  const observerMarkers = [
    'observeMessage(',
    'handleObserver(',
  ];

  const observerPositions =
    observerMarkers
      .map(
        (marker) =>
          positionOf(
            source,
            marker,
          ),
      )
      .filter(
        (value) =>
          value >= 0,
      );

  const observerPosition =
    observerPositions.length > 0
      ? Math.min(
          ...observerPositions,
        )
      : -1;


  assert(
    intentPosition >= 0,
    '必須找到 Location Intent',
  );


  if (
    observerPosition >= 0
  ) {

    assert(
      intentPosition <
        observerPosition,
      'Location Intent 必須位於 Observer Handler 前',
    );

  } else {

    console.log(
      '[PASS] 目前 index.ts 找不到實際 Observer Handler 呼叫，跳過相對位置判斷',
    );

    passed += 1;
  }
}


/**
 * =========================================================
 * Test 8
 * Route Handler 與 Intent 不得重複
 * =========================================================
 */

function testRouteIntegration(
  source: string,
): void {

  section(
    'Test 8：Location Route Handler 與 Intent Handler 接線',
  );


  const routeCount =
    countOccurrences(
      source,
      'handleHomeRouteRequest(',
    );


  const intentCount =
    countOccurrences(
      source,
      'handleLocationIntent(',
    );


  assert(
    routeCount === 1,
    `handleHomeRouteRequest 必須只有 1 個實際呼叫，實際=${routeCount}`,
  );


  assert(
    intentCount === 1,
    `handleLocationIntent 必須只有 1 個實際呼叫，實際=${intentCount}`,
  );


  const routePosition =
    positionOf(
      source,
      'handleHomeRouteRequest(',
    );


  const intentPosition =
    positionOf(
      source,
      'handleLocationIntent(',
    );


  assert(
    routePosition >= 0,
    'Route Handler 實際呼叫必須存在',
  );


  assert(
    intentPosition >= 0,
    'Intent Handler 實際呼叫必須存在',
  );
}


/**
 * =========================================================
 * Test 9
 * Location Message Handler 不得被移除
 * =========================================================
 */

function testLocationMessageHandler(
  source: string,
): void {

  section(
    'Test 9：既有 LINE Location Message Handler 必須保留',
  );


  assert(
    source.includes(
      'handleLocationMessage',
    ),
    'index.ts 必須仍保留 handleLocationMessage',
  );


  assert(
    source.includes(
      './location/location-handler',
    ),
    'index.ts 必須仍保留 location-handler import',
  );
}


/**
 * =========================================================
 * Test 10
 * AI Core 不得被移除
 * =========================================================
 */

function testAICoreStillExists(
  source: string,
): void {

  section(
    'Test 10：AI Core 必須仍存在',
  );


  const aiMarkers = [
    'Gemini',
    'AI Core',
    'gemini',
  ];


  const found =
    aiMarkers.some(
      (marker) =>
        source.includes(
          marker,
        ),
    );


  assert(
    found,
    'index.ts 必須仍保留 AI Core / Gemini 流程',
  );
}


/**
 * =========================================================
 * Test 11
 * Location Intent 不得重複接線
 * =========================================================
 */

function testNoDuplicateIntentBlock(
  source: string,
): void {

  section(
    'Test 11：Location Intent 不得重複接線',
  );


  const importCount =
    countOccurrences(
      source,
      'handleLocationIntent',
    );


  /*
   * 1 次 import 名稱
   * 1 次實際呼叫
   *
   * 因此 source 中完整名稱至少應出現 2 次。
   */

  assert(
    importCount >= 2,
    `handleLocationIntent 至少應存在 import + 實際呼叫，實際=${importCount}`,
  );


  assert(
    countOccurrences(
      source,
      'locationIntentResult',
    ) >= 2,
    'locationIntentResult 必須同時存在賦值與 handled 判斷',
  );
}


/**
 * =========================================================
 * Test 12
 * 位置系統不得直接呼叫 Gemini
 * =========================================================
 */

function testLocationIsolation(
  source: string,
): void {

  section(
    'Test 12：Location Intent 區塊不得直接呼叫 Gemini',
  );


  const intentPosition =
    positionOf(
      source,
      'handleLocationIntent(',
    );


  const nextSectionPosition =
    source.indexOf(
      '/*',
      intentPosition + 1,
    );


  const blockEnd =
    nextSectionPosition > intentPosition
      ? nextSectionPosition
      : Math.min(
          source.length,
          intentPosition + 10000,
        );


  const block =
    source.slice(
      intentPosition,
      blockEnd,
    );


  assert(
    !block.includes(
      'callGemini(',
    ),
    'Location Intent 區塊不得直接呼叫 callGemini',
  );


  assert(
    !block.includes(
      'generateAIResponse(',
    ),
    'Location Intent 區塊不得直接呼叫 generateAIResponse',
  );
}


/**
 * =========================================================
 * Run
 * =========================================================
 */

console.log(
  '=========================================================',
);

console.log(
  'Location Index Intent Integration Diagnostic Test',
);

console.log(
  '=========================================================',
);

console.log(
  '[MODE] 不啟動 Express / 不經 LINE / 不呼叫 Gemini / 不呼叫 Google API',
);

console.log(
  '[MODE] 只檢查目前 src/index.ts Location Intent 接線',
);

console.log(
  '[RULE] handled=true 後必須停止後續流程',
);

console.log(
  '=========================================================',
);


let source: string;


try {

  source =
    readIndex();

} catch (
  error
) {

  console.error(
    error,
  );

  process.exit(
    1,
  );
}


testImport(
  source,
);

testCallCount(
  source,
);

testPriorityBeforeAICore(
  source,
);

testResultVariable(
  source,
);

testHandledControlFlow(
  source,
);

testBeforeReminder(
  source,
);

testBeforeObserver(
  source,
);

testRouteIntegration(
  source,
);

testLocationMessageHandler(
  source,
);

testAICoreStillExists(
  source,
);

testNoDuplicateIntentBlock(
  source,
);

testLocationIsolation(
  source,
);


console.log('');

console.log(
  '=========================================================',
);

if (
  failed === 0
) {

  console.log(
    'Location Index Intent Integration Diagnostic Test PASSED',
  );

} else {

  console.log(
    'Location Index Intent Integration Diagnostic Test FAILED',
  );
}


console.log(
  `Passed: ${passed}`,
);

console.log(
  `Failed: ${failed}`,
);

console.log(
  '=========================================================',
);


if (
  failed > 0
) {

  process.exit(
    1,
  );
}