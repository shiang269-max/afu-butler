/**
 * =========================================================
 * Location Route Handler Diagnostic Test
 * =========================================================
 *
 * 測試：
 *
 * 1. 回家路線意圖辨識
 * 2. 非回家需求不攔截
 * 3. 沒有目前位置時不得猜
 * 4. 沒有家位置時不得猜
 * 5. 有目前位置 + 有家位置時正確建立 Routes
 * 6. Google Routes 成功結果可以正確轉成 LINE 回覆
 * 7. Google Routes 失敗時不得產生假資料
 *
 * 本測試：
 *
 * - 不經 LINE
 * - 不呼叫 Gemini
 * - 不呼叫真實 Google Routes API
 *
 * =========================================================
 */

import {
  handleHomeRouteRequest,
  isHomeRouteRequest,
} from './src/location/location-route-handler';

import {
  setLatestLocation,
  clearLatestLocation,
} from './src/location/location-state';

import {
  setHomeLocation,
  clearHomeLocation,
} from './src/location/home-location';

import {
  GoogleRouteCoordinate,
  GoogleRoutesServiceResult,
} from './src/location/google-routes-service';


/**
 * =========================================================
 * Test Constants
 * =========================================================
 */

const TEST_USER_ID =
  'location-route-test-user';


const TEST_CURRENT_LOCATION =
  {
    latitude:
      25.0478,

    longitude:
      121.5170,
  };


const TEST_HOME_LOCATION =
  {
    latitude:
      25.0339,

    longitude:
      121.5645,
  };


/**
 * =========================================================
 * Test Helpers
 * =========================================================
 */

let passed =
  0;

let failed =
  0;


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

  console.error(
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


/**
 * =========================================================
 * Fake Google Routes Calculator
 * =========================================================
 */

async function fakeSuccessfulRouteCalculator(
  origin: GoogleRouteCoordinate,
  destination: GoogleRouteCoordinate,
): Promise<GoogleRoutesServiceResult> {

  assert(
    origin.latitude ===
      TEST_CURRENT_LOCATION.latitude,

    'Routes origin latitude 必須來自目前 LINE 定位',
  );


  assert(
    origin.longitude ===
      TEST_CURRENT_LOCATION.longitude,

    'Routes origin longitude 必須來自目前 LINE 定位',
  );


  assert(
    destination.latitude ===
      TEST_HOME_LOCATION.latitude,

    'Routes destination latitude 必須來自固定家位置',
  );


  assert(
    destination.longitude ===
      TEST_HOME_LOCATION.longitude,

    'Routes destination longitude 必須來自固定家位置',
  );


  return {
    ok:
      true,

    route: {

      durationSeconds:
        990,

      distanceMeters:
        7237,

      durationText:
        '990s',
    },
  };
}


async function fakeFailedRouteCalculator(
  _origin: GoogleRouteCoordinate,
  _destination: GoogleRouteCoordinate,
): Promise<GoogleRoutesServiceResult> {

  return {
    ok:
      false,

    error: {

      code:
        'google-server-error',

      message:
        '測試用 Google Routes 錯誤',

      retryable:
        false,
    },
  };
}


/**
 * =========================================================
 * Test 1
 * =========================================================
 */

function testIntentDetection(): void {

  section(
    'Test 1：回家路線意圖辨識',
  );


  assert(
    isHomeRouteRequest(
      '我回家要多久',
    ),
    '「我回家要多久」必須被辨識為回家路線需求',
  );


  assert(
    isHomeRouteRequest(
      '我回到家要多久',
    ),
    '「我回到家要多久」必須被辨識為回家路線需求',
  );


  assert(
    isHomeRouteRequest(
      '到家還要多久',
    ),
    '「到家還要多久」必須被辨識為回家路線需求',
  );


  assert(
    isHomeRouteRequest(
      '回家多遠',
    ),
    '「回家多遠」必須被辨識為回家路線需求',
  );


  assert(
    !isHomeRouteRequest(
      '我家附近有什麼好吃的',
    ),
    '「我家附近有什麼好吃的」不得被當成 Routes 回家需求',
  );


  assert(
    !isHomeRouteRequest(
      '我今天回家吃飯',
    ),
    '一般「回家吃飯」不得被誤判為路線需求',
  );
}


/**
 * =========================================================
 * Test 2
 * =========================================================
 */

async function testWithoutCurrentLocation(): Promise<void> {

  section(
    'Test 2：沒有目前位置時不得猜測',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  clearHomeLocation();


  const result =
    await handleHomeRouteRequest(
      '我回家要多久',
      TEST_USER_ID,
      fakeSuccessfulRouteCalculator,
    );


  assert(
    result.handled === true,
    '回家路線需求必須被 Handler 接住',
  );


  assert(
    result.success === false,
    '沒有目前位置時不得成功計算',
  );


  assert(
    result.reason ===
      'current-location-unknown',

    '沒有目前位置時原因必須是 current-location-unknown',
  );


  assert(
    result.replyText?.includes(
      'LINE 定位',
    ) === true,

    '沒有目前位置時必須要求 LINE 定位或文字位置',
  );
}


/**
 * =========================================================
 * Test 3
 * =========================================================
 */

async function testWithoutHomeLocation(): Promise<void> {

  section(
    'Test 3：沒有固定家位置時不得猜測',
  );


  setLatestLocation(
    {
      userId:
        TEST_USER_ID,

      title:
        '目前位置',

      address:
        '測試目前位置',

      latitude:
        TEST_CURRENT_LOCATION.latitude,

      longitude:
        TEST_CURRENT_LOCATION.longitude,

      sourceType:
        'user',

      updatedAt:
        new Date().toISOString(),
    },
  );


  clearHomeLocation();


  const result =
    await handleHomeRouteRequest(
      '我回家要多久',
      TEST_USER_ID,
      fakeSuccessfulRouteCalculator,
    );


  assert(
    result.handled === true,
    '回家路線需求必須被 Handler 接住',
  );


  assert(
    result.success === false,
    '沒有固定家位置時不得成功計算',
  );


  assert(
    result.reason ===
      'home-location-unknown',

    '沒有固定家位置時原因必須是 home-location-unknown',
  );


  assert(
    result.replyText?.includes(
      '固定的家位置',
    ) === true,

    '沒有固定家位置時必須要求設定家位置',
  );
}


/**
 * =========================================================
 * Test 4
 * =========================================================
 */

async function testSuccessfulHomeRoute(): Promise<void> {

  section(
    'Test 4：目前位置 + 固定家位置可以建立回家 Routes',
  );


  setLatestLocation(
    {
      userId:
        TEST_USER_ID,

      title:
        '目前位置',

      address:
        '測試目前位置',

      latitude:
        TEST_CURRENT_LOCATION.latitude,

      longitude:
        TEST_CURRENT_LOCATION.longitude,

      sourceType:
        'user',

      updatedAt:
        new Date().toISOString(),
    },
  );


  setHomeLocation(
    {
      userId:
        TEST_USER_ID,

      title:
        '家',

      address:
        '測試家庭地址',

      latitude:
        TEST_HOME_LOCATION.latitude,

      longitude:
        TEST_HOME_LOCATION.longitude,

      sourceType:
        'user',

      updatedAt:
        new Date().toISOString(),
    },
  );


  const result =
    await handleHomeRouteRequest(
      '我回家要多久',
      TEST_USER_ID,
      fakeSuccessfulRouteCalculator,
    );


  assert(
    result.handled === true,
    '回家需求必須被 Handler 接住',
  );


  assert(
    result.success === true,
    '有兩端明確位置時必須成功',
  );


  assert(
    result.route !== undefined,
    '成功後必須存在 route',
  );


  assert(
    result.route?.durationSeconds ===
      990,

    'durationSeconds 必須正確取得',
  );


  assert(
    result.route?.distanceMeters ===
      7237,

    'distanceMeters 必須正確取得',
  );


  assert(
  result.replyText?.includes(
    '17 分鐘',
  ) === true,

  '回覆必須包含約 17 分鐘',
);


  assert(
    result.replyText?.includes(
      '7.2 公里',
    ) === true,

    '回覆必須包含約 7.2 公里',
  );
}


/**
 * =========================================================
 * Test 5
 * =========================================================
 */

async function testGoogleRouteFailure(): Promise<void> {

  section(
    'Test 5：Google Routes 失敗時不得產生假結果',
  );


  const result =
    await handleHomeRouteRequest(
      '我回家要多久',
      TEST_USER_ID,
      fakeFailedRouteCalculator,
    );


  assert(
    result.handled === true,
    '回家需求必須被 Handler 接住',
  );


  assert(
    result.success === false,
    'Google Routes 失敗時不得宣稱成功',
  );


  assert(
    result.route === undefined,
    'Google Routes 失敗時不得產生假的 route',
  );


  assert(
    result.replyText?.includes(
      '暫時無法取得',
    ) === true,

    'Google Routes 失敗時必須提供安全失敗訊息',
  );
}


/**
 * =========================================================
 * Test 6
 * =========================================================
 */

function testCleanup(): void {

  section(
    'Test 6：測試狀態清理',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  clearHomeLocation();


  pass(
    '測試結束後已清除目前位置與固定家位置',
  );
}


/**
 * =========================================================
 * Main
 * =========================================================
 */

async function main(): Promise<void> {

  console.log(
    '=========================================================',
  );

  console.log(
    'Location Route Handler Diagnostic Test',
  );

  console.log(
    '=========================================================',
  );

  console.log(
    '[MODE] 不經 LINE / 不呼叫 Gemini / 不呼叫真實 Google API',
  );

  console.log(
    '[RULE] 不知道位置就不猜',
  );

  console.log(
    '[RULE] Routes 只有在起點與終點都明確時才執行',
  );

  console.log(
    '=========================================================',
  );


  try {

    testIntentDetection();

    await testWithoutCurrentLocation();

    await testWithoutHomeLocation();

    await testSuccessfulHomeRoute();

    await testGoogleRouteFailure();

    testCleanup();

  } finally {

    clearLatestLocation(
      TEST_USER_ID,
    );

    clearHomeLocation();
  }


  console.log('');

  console.log(
    '=========================================================',
  );


  if (
    failed === 0
  ) {

    console.log(
      'Location Route Handler Diagnostic Test PASSED',
    );

  } else {

    console.error(
      'Location Route Handler Diagnostic Test FAILED',
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

    process.exitCode = 1;
  }
}


main()
  .catch(
    (
      error,
    ) => {

      console.error(
        '[FATAL] Location Route Handler Diagnostic Test 發生未處理錯誤。',
      );

      console.error(
        error,
      );

      process.exitCode = 1;
    },
  );