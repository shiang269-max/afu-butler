/**
 * =========================================================
 * Location Index Route Integration Diagnostic Test v2
 * =========================================================
 *
 * 目的：
 *   驗證目前 src/index.ts 已正確接入 Location Route Handler。
 *
 * [MODE]
 *   不啟動 Express
 *   不經 LINE
 *   不呼叫 Gemini
 *   不呼叫 Google Routes API
 *   不消耗 Location Quota
 *
 * [RULE]
 *   Location Route handled=true 後：
 *   1. 必須使用 event.replyToken 回覆
 *   2. 必須寫入 user / assistant Memory
 *   3. 必須 return
 *   4. 不得繼續進入 Reminder / Observer / AI Core
 *
 * 本測試直接檢查目前 src/index.ts 原始碼。
 * 不執行 index.ts。
 *
 * =========================================================
 */

import * as fs from 'fs';
import * as path from 'path';


const INDEX_FILE =
  path.join(
    process.cwd(),
    'src',
    'index.ts',
  );


let passed = 0;
let failed = 0;


function section(
  title: string,
): void {

  console.log('');
  console.log(
    '---------------------------------------------------------',
  );
  console.log(title);
  console.log(
    '---------------------------------------------------------',
  );
}


function pass(
  message: string,
): void {

  passed++;

  console.log(
    `[PASS] ${message}`,
  );
}


function fail(
  message: string,
): void {

  failed++;

  console.log(
    `[FAIL] ${message}`,
  );
}


function assert(
  condition: boolean,
  message: string,
): void {

  if (
    condition
  ) {

    pass(
      message,
    );

    return;
  }

  fail(
    message,
  );
}


/**
 * =========================================================
 * Header
 * =========================================================
 */

console.log(
  '=========================================================',
);

console.log(
  'Location Index Route Integration Diagnostic Test v2',
);

console.log(
  '=========================================================',
);

console.log(
  '[MODE] 不啟動 Express / 不經 LINE / 不呼叫 Gemini / 不呼叫 Google API',
);

console.log(
  '[MODE] 只檢查目前 src/index.ts Route Handler 接線',
);

console.log(
  '[RULE] handled=true 後必須停止後續流程',
);

console.log(
  '=========================================================',
);


/**
 * =========================================================
 * Load index.ts
 * =========================================================
 */

if (
  !fs.existsSync(
    INDEX_FILE,
  )
) {

  console.error(
    `[FAIL] 找不到 ${INDEX_FILE}`,
  );

  process.exit(
    1,
  );
}


const source =
  fs.readFileSync(
    INDEX_FILE,
    'utf8',
  );


/**
 * =========================================================
 * Test 1：Import
 * =========================================================
 */

section(
  'Test 1：Location Route Handler Import',
);


const hasRouteImport =
  /import\s*\{[\s\S]*?handleHomeRouteRequest[\s\S]*?\}\s*from\s*['"]\.\/location\/location-route-handler['"]\s*;?/
    .test(
      source,
    );


assert(
  hasRouteImport,
  'index.ts 必須 import handleHomeRouteRequest',
);


/**
 * =========================================================
 * Test 2：實際呼叫數量
 * =========================================================
 */

section(
  'Test 2：Location Route Handler 實際呼叫',
);


const callMatches =
  source.match(
    /handleHomeRouteRequest\s*\(/g,
  ) || [];


assert(
  callMatches.length === 1,
  `handleHomeRouteRequest 必須只有 1 個實際呼叫，實際=${callMatches.length}`,
);


/**
 * =========================================================
 * 找出實際呼叫位置
 * =========================================================
 */

const importPosition =
  source.indexOf(
    "from './location/location-route-handler'",
  );


const callPosition =
  source.indexOf(
    'handleHomeRouteRequest(',
    importPosition + 1,
  );


assert(
  importPosition >= 0,
  'Route Handler import 位置存在',
);


assert(
  callPosition > importPosition,
  '實際 Route Handler 呼叫位於 import 之後',
);


/**
 * =========================================================
 * Test 3：實際使用 locationRouteResult
 * =========================================================
 */

section(
  'Test 3：Route Handler 結果控制流程',
);


const hasLocationRouteResultAssignment =
  /const\s+locationRouteResult\s*=\s*await\s+handleHomeRouteRequest\s*\(/.
    test(
      source,
    );


assert(
  hasLocationRouteResultAssignment,
  'index.ts 必須將 handleHomeRouteRequest 結果存入 locationRouteResult',
);


const handledCheckPosition =
  source.indexOf(
    'if (locationRouteResult.handled)',
    callPosition,
  );


assert(
  handledCheckPosition > callPosition,
  'handleHomeRouteRequest 後必須檢查 locationRouteResult.handled',
);


/**
 * =========================================================
 * 取得 Route Handler 控制區塊
 * =========================================================
 */

const reminderPosition =
  source.indexOf(
    'handleReminderMessage(',
    callPosition,
  );


const routeBlockEnd =
  reminderPosition > callPosition
    ? reminderPosition
    : Math.min(
        source.length,
        callPosition + 7000,
      );


const routeBlock =
  source.slice(
    callPosition,
    routeBlockEnd,
  );


/**
 * =========================================================
 * Test 4：Route Reply
 * =========================================================
 */

section(
  'Test 4：handled=true 必須回覆 LINE',
);


const hasHandledReplyBlock =
  /if\s*\(\s*locationRouteResult\.handled\s*\)/.
    test(
      routeBlock,
    );


assert(
  hasHandledReplyBlock,
  '必須存在 locationRouteResult.handled 的分支',
);


const hasLocationRouteReply =
  /const\s+locationRouteReply\s*=/.test(
    routeBlock,
  );


assert(
  hasLocationRouteReply,
  'handled=true 後必須建立 locationRouteReply',
);


const hasReplyMessage =
  /lineClient\.replyMessage\s*\(/.test(
    routeBlock,
  );


assert(
  hasReplyMessage,
  'handled=true 後必須呼叫 lineClient.replyMessage',
);


const hasEventReplyToken =
  /replyToken\s*:\s*event\.replyToken/.test(
    routeBlock,
  );


assert(
  hasEventReplyToken,
  'Route 回覆必須使用 event.replyToken',
);


/**
 * =========================================================
 * Test 5：Route Memory
 * =========================================================
 */

section(
  'Test 5：Route 回覆必須寫入 Memory',
);


const addToMemoryMatches =
  routeBlock.match(
    /addToMemory\s*\(/g,
  ) || [];


assert(
  addToMemoryMatches.length >= 2,
  `Route handled=true 後至少必須有 2 次 addToMemory，實際=${addToMemoryMatches.length}`,
);


const hasUserMemory =
  /addToMemory\s*\([\s\S]{0,500}?'user'/.test(
    routeBlock,
  );


assert(
  hasUserMemory,
  'Route 必須寫入 user Memory',
);


const hasAssistantMemory =
  /addToMemory\s*\([\s\S]{0,500}?'assistant'/.test(
    routeBlock,
  );


assert(
  hasAssistantMemory,
  'Route 必須寫入 assistant Memory',
);


/**
 * =========================================================
 * Test 6：Route 必須 return
 * =========================================================
 */

section(
  'Test 6：Route 回覆後必須停止後續流程',
);


const replyPosition =
  routeBlock.indexOf(
    'lineClient.replyMessage(',
  );


const returnPosition =
  routeBlock.indexOf(
    'return;',
    replyPosition >= 0
      ? replyPosition
      : 0,
  );


assert(
  replyPosition >= 0,
  'Route 回覆位置必須存在',
);


assert(
  returnPosition > replyPosition,
  'Route replyMessage 後必須 return',
);


/**
 * =========================================================
 * Test 7：return 必須發生在 Reminder 前
 * =========================================================
 */

section(
  'Test 7：Route 必須在 Reminder 前結束',
);


assert(
  reminderPosition >= 0,
  'index.ts 必須仍存在 Reminder Handler',
);


assert(
  returnPosition >= 0 &&
  reminderPosition > callPosition,
  'Route 的 return 必須發生在 Reminder Handler 前',
);


/**
 * =========================================================
 * Test 8：Route 必須在 Observer 前
 * =========================================================
 */

section(
  'Test 8：Route 必須優先於 Observer',
);


const observerPosition =
  source.indexOf(
    'observeMessage(',
    callPosition,
  );


assert(
  observerPosition >= 0,
  'index.ts 必須仍存在 Observer',
);


assert(
  callPosition < observerPosition,
  'Location Route Handler 必須在 Observer Handler 前',
);


/**
 * =========================================================
 * Test 9：Route 必須在 AI Core 前
 * =========================================================
 */

section(
  'Test 9：Route 必須優先於 AI Core',
);


const aiCorePosition =
  source.indexOf(
    'runAiCore(',
    callPosition,
  );


assert(
  aiCorePosition >= 0,
  'index.ts 必須仍存在 AI Core',
);


assert(
  callPosition < aiCorePosition,
  'Location Route Handler 必須在 AI Core 前',
);


/**
 * =========================================================
 * Test 10：Route 控制區塊不得重複呼叫
 * =========================================================
 */

section(
  'Test 10：Route Handler 不得重複呼叫',
);


const routeBlockCallMatches =
  routeBlock.match(
    /handleHomeRouteRequest\s*\(/g,
  ) || [];


assert(
  routeBlockCallMatches.length === 1,
  `Route 控制區塊內必須只有 1 次 handleHomeRouteRequest 呼叫，實際=${routeBlockCallMatches.length}`,
);


/**
 * =========================================================
 * Test 11：Route replyToken 不得在 handled=true 後繼續流向 Reminder
 * =========================================================
 */

section(
  'Test 11：Route 必須隔離後續 replyToken 流程',
);


assert(
  returnPosition >= 0 &&
  reminderPosition > returnPosition,
  'Route return 必須位於 Reminder Handler 之前，避免重複使用 replyToken',
);


/**
 * =========================================================
 * Summary
 * =========================================================
 */

console.log('');
console.log(
  '=========================================================',
);

if (
  failed === 0
) {

  console.log(
    'Location Index Route Integration Diagnostic Test v2 PASSED',
  );

} else {

  console.log(
    'Location Index Route Integration Diagnostic Test v2 FAILED',
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


process.exit(
  failed === 0
    ? 0
    : 1,
);