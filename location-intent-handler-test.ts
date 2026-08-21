/**
 * =========================================================
 * Location Intent Handler Diagnostic Test
 * =========================================================
 *
 * [MODE]
 * 不經 LINE
 * 不呼叫 Gemini
 * 不呼叫 Google API
 *
 * [RULE]
 * 不知道位置就不猜
 * 沒有明確位置不得進入 Action
 * 一般訊息不得被 Location Intent 攔截
 *
 * =========================================================
 */

import {
  handleLocationIntent,
  canExecuteLocationIntent,
} from './src/location/location-intent-handler';

import {
  setLatestLocation,
  clearLatestLocation,
} from './src/location/location-state';

import {
  setHomeLocation,
  clearHomeLocation,
} from './src/location/home-location';

import {
  resetLocationQuotaForTesting,
  getLocationQuotaUsed,
} from './src/location/location-quota';


const TEST_USER_ID =
  'location-intent-test-user';


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


function cleanup(): void {

  clearLatestLocation(
    TEST_USER_ID,
  );

  clearHomeLocation();

  resetLocationQuotaForTesting();
}


function createCurrentLocation(): void {

  setLatestLocation(
    {
      userId:
        TEST_USER_ID,

      title:
        '測試目前位置',

      address:
        '新北市板橋區測試位置',

      latitude:
        25.023375,

      longitude:
        121.454642,

      sourceType:
        'user',

      updatedAt:
        new Date().toISOString(),
    },
  );
}


function createHomeLocation(): void {

  setHomeLocation(
    {
      userId:
        TEST_USER_ID,

      title:
        '測試家',

      address:
        '新北市板橋區測試家',

      latitude:
        25.0339,

      longitude:
        121.5645,

      sourceType:
        'group',

      sourceGroupId:
        'MUST-NOT-REMAIN',

      updatedAt:
        'SHOULD-NOT-BE-USED',
    },
  );
}


/**
 * =========================================================
 * Test 1
 * 「我現在在哪」有目前位置
 * =========================================================
 */

function testCurrentLocationWithKnownLocation(): void {

  section(
    'Test 1：已有目前位置時「我現在在哪」可以解析',
  );


  createCurrentLocation();


  const result =
    handleLocationIntent(
      '我現在在哪',
      TEST_USER_ID,
    );


  assert(
    result.handled === true,
    '「我現在在哪」必須被 Location Intent 接住',
  );


  assert(
    result.intent === 'CURRENT_LOCATION',
    `intent 必須是 CURRENT_LOCATION，實際=${result.intent}`,
  );


  assert(
    result.resolved === true,
    '已有目前位置時必須 resolved',
  );


  assert(
    result.clarificationRequired === false,
    '已有目前位置時不需要確認',
  );


  assert(
    result.action === 'RETURN_CURRENT_LOCATION',
    'Action 必須是 RETURN_CURRENT_LOCATION',
  );


  assert(
    result.locationResolution?.location !== undefined,
    '解析結果必須包含目前位置',
  );


  assert(
    canExecuteLocationIntent(
      result,
    ) === true,
    '已有明確目前位置時可以執行 Action',
  );
}


/**
 * =========================================================
 * Test 2
 * 「我現在在哪」沒有目前位置
 * =========================================================
 */

function testCurrentLocationWithoutLocation(): void {

  section(
    'Test 2：沒有目前位置時不得猜測',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    handleLocationIntent(
      '我現在在哪',
      TEST_USER_ID,
    );


  assert(
    result.handled === true,
    '「我現在在哪」必須被 Location Intent 接住',
  );


  assert(
    result.intent === 'CURRENT_LOCATION',
    `intent 必須是 CURRENT_LOCATION，實際=${result.intent}`,
  );


  assert(
    result.resolved === false,
    '沒有目前位置時不得 resolved',
  );


  assert(
    result.clarificationRequired === true,
    '沒有目前位置時必須要求確認',
  );


  assert(
    typeof result.clarificationMessage === 'string' &&
    result.clarificationMessage.length > 0,
    '沒有目前位置時必須產生確認訊息',
  );


  assert(
    result.locationResolution?.location === undefined,
    '沒有目前位置時不得產生虛構 LocationRecord',
  );


  assert(
    canExecuteLocationIntent(
      result,
    ) === false,
    '沒有目前位置時不得進入 Action',
  );
}


/**
 * =========================================================
 * Test 3
 * 「我附近有什麼好吃的」有目前位置
 * =========================================================
 */

function testNearCurrentWithKnownLocation(): void {

  section(
    'Test 3：已有目前位置時「我附近有什麼好吃的」可以解析',
  );


  createCurrentLocation();


  const result =
    handleLocationIntent(
      '我附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.handled === true,
    '附近需求必須被 Location Intent 接住',
  );


  assert(
    result.intent === 'NEAR_CURRENT',
    `intent 必須是 NEAR_CURRENT，實際=${result.intent}`,
  );


  assert(
    result.resolved === true,
    '已有目前位置時附近需求必須 resolved',
  );


  assert(
    result.clarificationRequired === false,
    '已有目前位置時附近需求不需要確認',
  );


  assert(
    result.action === 'SEARCH_NEAR_CURRENT',
    'Action 必須是 SEARCH_NEAR_CURRENT',
  );


  assert(
    result.locationResolution?.location !== undefined,
    '附近搜尋必須取得目前 LocationRecord',
  );


  assert(
    canExecuteLocationIntent(
      result,
    ) === true,
    '已有目前位置時附近搜尋可以進入 Action',
  );
}


/**
 * =========================================================
 * Test 4
 * 「我附近有什麼好吃的」沒有目前位置
 * =========================================================
 */

function testNearCurrentWithoutLocation(): void {

  section(
    'Test 4：沒有目前位置時「我附近」不得猜測',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    handleLocationIntent(
      '我附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.handled === true,
    '附近需求必須被 Location Intent 接住',
  );


  assert(
    result.intent === 'NEAR_CURRENT',
    `intent 必須是 NEAR_CURRENT，實際=${result.intent}`,
  );


  assert(
    result.resolved === false,
    '沒有目前位置時附近需求不得 resolved',
  );


  assert(
    result.clarificationRequired === true,
    '沒有目前位置時附近需求必須要求確認',
  );


  assert(
    result.locationResolution?.location === undefined,
    '沒有目前位置時不得產生猜測位置',
  );


  assert(
    canExecuteLocationIntent(
      result,
    ) === false,
    '沒有目前位置時附近搜尋不得進入 Action',
  );
}


/**
 * =========================================================
 * Test 5
 * 「我家附近有什麼好吃的」有固定家位置
 * =========================================================
 */

function testNearHomeWithKnownHome(): void {

  section(
    'Test 5：已有固定家位置時「我家附近有什麼好吃的」可以解析',
  );


  createHomeLocation();


  const result =
    handleLocationIntent(
      '我家附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.handled === true,
    '我家附近需求必須被 Location Intent 接住',
  );


  assert(
    result.intent === 'NEAR_HOME',
    `intent 必須是 NEAR_HOME，實際=${result.intent}`,
  );


  assert(
    result.resolved === true,
    '已有固定家位置時必須 resolved',
  );


  assert(
    result.clarificationRequired === false,
    '已有固定家位置時不需要確認',
  );


  assert(
    result.action === 'SEARCH_NEAR_HOME',
    'Action 必須是 SEARCH_NEAR_HOME',
  );


  assert(
    result.locationResolution?.location !== undefined,
    '我家附近搜尋必須取得固定家 LocationRecord',
  );


  assert(
    result.locationResolution?.location?.latitude === 25.0339,
    '固定家 latitude 必須正確',
  );


  assert(
    result.locationResolution?.location?.longitude === 121.5645,
    '固定家 longitude 必須正確',
  );


  assert(
    canExecuteLocationIntent(
      result,
    ) === true,
    '已有固定家位置時附近搜尋可以進入 Action',
  );
}


/**
 * =========================================================
 * Test 6
 * 「我家附近有什麼好吃的」沒有固定家位置
 * =========================================================
 */

function testNearHomeWithoutHome(): void {

  section(
    'Test 6：沒有固定家位置時「我家附近」不得猜測',
  );


  clearHomeLocation();


  const result =
    handleLocationIntent(
      '我家附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.handled === true,
    '我家附近需求必須被 Location Intent 接住',
  );


  assert(
    result.intent === 'NEAR_HOME',
    `intent 必須是 NEAR_HOME，實際=${result.intent}`,
  );


  assert(
    result.resolved === false,
    '沒有固定家位置時不得 resolved',
  );


  assert(
    result.clarificationRequired === true,
    '沒有固定家位置時必須要求確認',
  );


  assert(
    result.locationResolution?.location === undefined,
    '沒有固定家位置時不得產生猜測座標',
  );


  assert(
    canExecuteLocationIntent(
      result,
    ) === false,
    '沒有固定家位置時不得進入 Action',
  );
}


/**
 * =========================================================
 * Test 7
 * 回家 Routes
 * =========================================================
 */

function testHomeRouteIntent(): void {

  section(
    'Test 7：回家路線需求必須被正確分流',
  );


  const result =
    handleLocationIntent(
      '我回家要多久',
      TEST_USER_ID,
    );


  assert(
    result.handled === true,
    '回家路線需求必須被 Location Intent 接住',
  );


  assert(
    result.intent === 'HOME_ROUTE',
    `intent 必須是 HOME_ROUTE，實際=${result.intent}`,
  );


  assert(
    result.action === 'CALCULATE_HOME_ROUTE',
    'Action 必須是 CALCULATE_HOME_ROUTE',
  );


  assert(
    result.clarificationRequired === false,
    'Routes 應交給既有 Route Handler，不在此層重複詢問',
  );


  assert(
    canExecuteLocationIntent(
      result,
    ) === true,
    'HOME_ROUTE 必須可以交給既有 Route Handler',
  );
}


/**
 * =========================================================
 * Test 8
 * 一般「回家吃飯」不得誤判
 * =========================================================
 */

function testNormalHomeMessage(): void {

  section(
    'Test 8：一般「回家吃飯」不得被誤判為路線需求',
  );


  const result =
    handleLocationIntent(
      '我今天回家吃飯',
      TEST_USER_ID,
    );


  assert(
    result.handled === false,
    '一般回家聊天不得被 Location Intent 攔截',
  );


  assert(
    result.intent === 'UNKNOWN',
    `一般回家聊天 intent 必須是 UNKNOWN，實際=${result.intent}`,
  );


  assert(
    canExecuteLocationIntent(
      result,
    ) === false,
    '一般回家聊天不得進入 Location Action',
  );
}


/**
 * =========================================================
 * Test 9
 * 一般訊息不得被攔截
 * =========================================================
 */

function testNormalMessage(): void {

  section(
    'Test 9：一般訊息不得被 Location Intent 攔截',
  );


  const messages = [
    '今天吃什麼',
    '你在幹嘛',
    '幫我提醒晚上八點',
    '今天天氣怎麼樣',
    '晚安',
  ];


  for (
    const message
    of messages
  ) {

    const result =
      handleLocationIntent(
        message,
        TEST_USER_ID,
      );


    assert(
      result.handled === false,
      `「${message}」不得被 Location Intent 攔截`,
    );


    assert(
      result.intent === 'UNKNOWN',
      `「${message}」intent 必須是 UNKNOWN`,
    );
  }
}


/**
 * =========================================================
 * Test 10
 * Intent Test 不得消耗 Location Quota
 * =========================================================
 */

function testNoLocationQuotaConsumption(): void {

  section(
    'Test 10：Intent Handler 不得消耗 Location Quota',
  );


  cleanup();


  const before =
    getLocationQuotaUsed();


  handleLocationIntent(
    '我現在在哪',
    TEST_USER_ID,
  );


  handleLocationIntent(
    '我附近有什麼好吃的',
    TEST_USER_ID,
  );


  handleLocationIntent(
    '我家附近有什麼好吃的',
    TEST_USER_ID,
  );


  handleLocationIntent(
    '我回家要多久',
    TEST_USER_ID,
  );


  const after =
    getLocationQuotaUsed();


  assert(
    before ===
      after,
    `Intent 測試期間 quota 必須維持不變，實際=${after}`,
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
  'Location Intent Handler Diagnostic Test',
);

console.log(
  '=========================================================',
);

console.log(
  '[MODE] 不經 LINE / 不呼叫 Gemini / 不呼叫 Google API',
);

console.log(
  '[RULE] 不知道位置就不猜',
);

console.log(
  '[RULE] 沒有明確位置不得進入 Action',
);

console.log(
  '[RULE] 一般訊息不得被 Location Intent 攔截',
);

console.log(
  '=========================================================',
);


cleanup();


testCurrentLocationWithKnownLocation();

testCurrentLocationWithoutLocation();

testNearCurrentWithKnownLocation();

testNearCurrentWithoutLocation();

testNearHomeWithKnownHome();

testNearHomeWithoutHome();

testHomeRouteIntent();

testNormalHomeMessage();

testNormalMessage();

testNoLocationQuotaConsumption();


cleanup();


console.log('');

console.log(
  '=========================================================',
);

if (
  failed === 0
) {

  console.log(
    'Location Intent Handler Diagnostic Test PASSED',
  );

} else {

  console.log(
    'Location Intent Handler Diagnostic Test FAILED',
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