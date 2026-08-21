/**
 * =========================================================
 * Location Places Action Handler Diagnostic Test
 * =========================================================
 *
 * 測試目標：
 *
 * 1. SEARCH_NEAR_CURRENT 必須使用目前 LINE Location
 * 2. SEARCH_NEAR_HOME 必須使用固定 Home Location
 * 3. 沒有目前位置不得執行
 * 4. 沒有固定家位置不得執行
 * 5. 不支援的 Action 不得被攔截
 * 6. 沒有 userId 不得執行
 * 7. Google Places 失敗時不得產生假店家
 * 8. Action Handler 不得自行猜測位置
 * 9. 目前位置與固定家位置不得混用
 *
 * 注意：
 * Location Intent Handler 負責：
 * - 自然語言意圖辨識
 * - CURRENT / NEAR_CURRENT / NEAR_HOME
 * - 判斷是否需要確認
 *
 * Location Places Action Handler 負責：
 * - 接收已經決定好的 Action
 * - 取得對應 Location
 * - 呼叫 Places Service
 *
 * 因此本測試不要求 Action Handler
 * 再次解析自然語言中的「我家」。
 *
 * 本測試：
 *
 * - 不啟動 Express
 * - 不經 LINE
 * - 不呼叫 Gemini
 * - 不呼叫真實 Google Places API
 *
 * =========================================================
 */

import {
  handleLocationPlacesAction,
} from './src/location/location-places-action-handler';

import {
  setLatestLocation,
  clearLatestLocation,
} from './src/location/location-state';

import {
  setHomeLocation,
  clearHomeLocation,
} from './src/location/home-location';

import {
  LocationRecord,
} from './src/location/location-types';


/**
 * =========================================================
 * Test Helpers
 * =========================================================
 */

let passed = 0;

let failed = 0;


const TEST_USER_ID =
  'U_LOCATION_PLACES_ACTION_TEST';


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


  console.error(
    `[FAIL] ${message}`,
  );

  failed += 1;
}


/**
 * =========================================================
 * Fixtures
 * =========================================================
 */

function createCurrentLocation(): void {

  const location:
    LocationRecord = {

    userId:
      TEST_USER_ID,

    title:
      '目前測試位置',

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
  };


  setLatestLocation(
    location,
  );
}


function createHomeLocation(): void {

  const location:
    LocationRecord = {

    userId:
      TEST_USER_ID,

    title:
      '測試家',

    address:
      '新北市板橋區測試家',

    latitude:
      25.012345,

    longitude:
      121.456789,

    sourceType:
      'user',

    updatedAt:
      new Date().toISOString(),
  };


  setHomeLocation(
    location,
  );
}


/**
 * =========================================================
 * Cleanup
 * =========================================================
 */

function cleanup(): void {

  clearLatestLocation(
    TEST_USER_ID,
  );

  clearHomeLocation();
}


/**
 * =========================================================
 * Test 1
 * =========================================================
 */

async function testNearCurrentWithoutLocation(): Promise<void> {

  section(
    'Test 1：沒有目前位置時 SEARCH_NEAR_CURRENT 不得執行',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_CURRENT',

        message:
          '我附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.handled === true,
    'SEARCH_NEAR_CURRENT 沒有目前位置時必須被 Handler 接住',
  );


  assert(
    result.success === false,
    '沒有目前位置時不得成功執行 Places',
  );


  assert(
    result.reason ===
      'current-location-unknown',

    `沒有目前位置時 reason 必須是 current-location-unknown，實際=${result.reason}`,
  );


  assert(
    result.places === undefined,
    '沒有目前位置時不得產生虛構店家',
  );


  assert(
    result.location === undefined,
    '沒有目前位置時不得產生虛構 LocationRecord',
  );
}


/**
 * =========================================================
 * Test 2
 * =========================================================
 */

async function testNearCurrentWithLocation(): Promise<void> {

  section(
    'Test 2：已有目前位置時 SEARCH_NEAR_CURRENT 使用目前 LINE Location',
  );


  createCurrentLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_CURRENT',

        message:
          '我附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.handled === true,
    'SEARCH_NEAR_CURRENT 必須被 Handler 接住',
  );


  assert(
    result.action ===
      'SEARCH_NEAR_CURRENT',

    `action 必須是 SEARCH_NEAR_CURRENT，實際=${result.action}`,
  );


  assert(
    result.success === false,
    '沒有真實 API Key 時不得宣稱成功',
  );


  assert(
    result.reason ===
      'MISSING_API_KEY',

    `沒有 API Key 時 reason 必須是 MISSING_API_KEY，實際=${result.reason}`,
  );


  assert(
    result.location !== undefined,
    '已有目前位置時必須取得 LocationRecord',
  );


  assert(
    result.location?.latitude ===
      25.023375,

    'SEARCH_NEAR_CURRENT latitude 必須來自目前 LINE Location',
  );


  assert(
    result.location?.longitude ===
      121.454642,

    'SEARCH_NEAR_CURRENT longitude 必須來自目前 LINE Location',
  );


  assert(
    result.places === undefined,
    'Google Places 未成功時不得產生假店家',
  );
}


/**
 * =========================================================
 * Test 3
 * =========================================================
 */

async function testNearHomeWithoutHome(): Promise<void> {

  section(
    'Test 3：沒有固定家位置時 SEARCH_NEAR_HOME 不得執行',
  );


  clearHomeLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_HOME',

        message:
          '我家附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.handled === true,
    'SEARCH_NEAR_HOME 沒有固定家位置時必須被 Handler 接住',
  );


  assert(
    result.success === false,
    '沒有固定家位置時不得成功執行 Places',
  );


  assert(
    result.reason ===
      'home-location-unknown',

    `沒有固定家位置時 reason 必須是 home-location-unknown，實際=${result.reason}`,
  );


  assert(
    result.places === undefined,
    '沒有固定家位置時不得產生虛構店家',
  );


  assert(
    result.location === undefined,
    '沒有固定家位置時不得產生虛構 LocationRecord',
  );
}


/**
 * =========================================================
 * Test 4
 * =========================================================
 */

async function testNearHomeWithHome(): Promise<void> {

  section(
    'Test 4：已有固定家位置時 SEARCH_NEAR_HOME 使用固定家 Location',
  );


  createHomeLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_HOME',

        message:
          '我家附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.handled === true,
    'SEARCH_NEAR_HOME 必須被 Handler 接住',
  );


  assert(
    result.action ===
      'SEARCH_NEAR_HOME',

    `action 必須是 SEARCH_NEAR_HOME，實際=${result.action}`,
  );


  assert(
    result.success === false,
    '沒有真實 API Key 時不得宣稱成功',
  );


  assert(
    result.reason ===
      'MISSING_API_KEY',

    `沒有 API Key 時 reason 必須是 MISSING_API_KEY，實際=${result.reason}`,
  );


  assert(
    result.location !== undefined,
    '已有固定家位置時必須取得 Home LocationRecord',
  );


  assert(
    result.location?.latitude ===
      25.012345,

    'SEARCH_NEAR_HOME latitude 必須來自固定家位置',
  );


  assert(
    result.location?.longitude ===
      121.456789,

    'SEARCH_NEAR_HOME longitude 必須來自固定家位置',
  );


  assert(
    result.places === undefined,
    'Google Places 未成功時不得產生假店家',
  );
}


/**
 * =========================================================
 * Test 5
 * =========================================================
 */

async function testDifferentCurrentAndHomeLocations(): Promise<void> {

  section(
    'Test 5：目前位置與固定家位置必須保持來源隔離',
  );


  createCurrentLocation();

  createHomeLocation();


  const currentResult =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_CURRENT',

        message:
          '我附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  const homeResult =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_HOME',

        message:
          '我家附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    currentResult.location?.latitude ===
      25.023375,

    'SEARCH_NEAR_CURRENT 必須使用目前位置 latitude',
  );


  assert(
    currentResult.location?.longitude ===
      121.454642,

    'SEARCH_NEAR_CURRENT 必須使用目前位置 longitude',
  );


  assert(
    homeResult.location?.latitude ===
      25.012345,

    'SEARCH_NEAR_HOME 必須使用固定家 latitude',
  );


  assert(
    homeResult.location?.longitude ===
      121.456789,

    'SEARCH_NEAR_HOME 必須使用固定家 longitude',
  );


  assert(
    currentResult.location?.latitude !==
      homeResult.location?.latitude,

    '目前位置與固定家位置不得被混用',
  );
}


/**
 * =========================================================
 * Test 6
 * =========================================================
 */

async function testUnsupportedAction(): Promise<void> {

  section(
    'Test 6：不支援的 Places Action 不得被攔截',
  );


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'INVALID_ACTION' as any,

        message:
          '我附近有什麼',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.handled === false,
    '不支援 Action 必須 handled=false',
  );


  assert(
    result.success === false,
    '不支援 Action 不得成功',
  );


  assert(
    result.reason ===
      'unsupported-location-places-action',

    `錯誤原因必須是 unsupported-location-places-action，實際=${result.reason}`,
  );
}


/**
 * =========================================================
 * Test 7
 * =========================================================
 */

async function testMissingUserId(): Promise<void> {

  section(
    'Test 7：沒有 userId 不得執行 Location Places Action',
  );


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_CURRENT',

        message:
          '我附近有什麼好吃的',

        userId:
          '',
      },
    );


  assert(
    result.handled === true,
    '缺少 userId 時 Action 必須被安全攔截',
  );


  assert(
    result.success === false,
    '缺少 userId 時不得成功',
  );


  assert(
    result.reason ===
      'invalid-user-id',

    `錯誤原因必須是 invalid-user-id，實際=${result.reason}`,
  );
}


/**
 * =========================================================
 * Test 8
 * =========================================================
 */

async function testSearchOptions(): Promise<void> {

  section(
    'Test 8：Places Action 可以正確保留搜尋參數',
  );


  createCurrentLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_CURRENT',

        message:
          '我附近有什麼咖啡廳',

        userId:
          TEST_USER_ID,

        radiusMeters:
          1200,

        maxResults:
          5,

        type:
          'cafe',
      },
    );


  assert(
    result.searchOptions !== undefined,
    'Action 結果必須保留搜尋參數',
  );


  assert(
    result.searchOptions?.radiusMeters ===
      1200,

    '搜尋半徑必須保留',
  );


  assert(
    result.searchOptions?.maxResults ===
      5,

    '最大結果數量必須保留',
  );


  assert(
    result.searchOptions?.type ===
      'cafe',

    '搜尋類型必須保留',
  );


  assert(
    result.location?.latitude ===
      25.023375,

    '帶搜尋參數時仍必須使用目前位置',
  );
}


/**
 * =========================================================
 * Test 9
 * =========================================================
 */

async function testCurrentLocationClearSafety(): Promise<void> {

  section(
    'Test 9：清除目前位置後不得繼續使用舊位置',
  );


  createCurrentLocation();


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_CURRENT',

        message:
          '我附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.success === false,
    '清除目前位置後不得成功',
  );


  assert(
    result.reason ===
      'current-location-unknown',

    `清除目前位置後 reason 必須是 current-location-unknown，實際=${result.reason}`,
  );


  assert(
    result.location === undefined,
    '清除目前位置後不得殘留舊 LocationRecord',
  );


  assert(
    result.places === undefined,
    '清除目前位置後不得產生店家結果',
  );
}


/**
 * =========================================================
 * Test 10
 * =========================================================
 */

async function testHomeLocationClearSafety(): Promise<void> {

  section(
    'Test 10：清除固定家位置後不得繼續使用舊位置',
  );


  createHomeLocation();


  clearHomeLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_HOME',

        message:
          '我家附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.success === false,
    '清除固定家位置後不得成功',
  );


  assert(
    result.reason ===
      'home-location-unknown',

    `清除固定家位置後 reason 必須是 home-location-unknown，實際=${result.reason}`,
  );


  assert(
    result.location === undefined,
    '清除固定家位置後不得殘留舊 Home LocationRecord',
  );


  assert(
    result.places === undefined,
    '清除固定家位置後不得產生店家結果',
  );
}


/**
 * =========================================================
 * Test 11
 * =========================================================
 */

async function testNoFakePlacesOnApiFailure(): Promise<void> {

  section(
    'Test 11：Google Places 失敗時不得產生假結果',
  );


  createCurrentLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_CURRENT',

        message:
          '我附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.success === false,
    'Google Places 無法使用時不得宣稱成功',
  );


  assert(
    result.places === undefined,
    'Google Places 失敗時不得產生假店家',
  );


  assert(
    result.reason ===
      'MISSING_API_KEY',

    `Google Places 失敗原因必須保留，實際=${result.reason}`,
  );
}


/**
 * =========================================================
 * Test 12
 * =========================================================
 *
 * 這裡不重新測試自然語言中的「我家」。
 *
 * Location Intent Handler 已負責：
 * - 判斷 NEAR_HOME
 * - 決定 SEARCH_NEAR_HOME
 *
 * Action Handler 收到 SEARCH_NEAR_HOME 後，
 * 只需要忠實使用 Home Location。
 *
 * 因此本測試改為確認：
 *
 * - Action Handler 不會自己產生目前位置
 * - Action Handler 不會在 Home Location 不存在時猜測
 * - 沒有 Home Location 時必須安全停止
 *
 * 自然語言「我家附近」的辨識由
 * location-intent-handler-test.ts 負責。
 *
 * =========================================================
 */

async function testHomeActionRequiresStoredHome(): Promise<void> {

  section(
    'Test 12：SEARCH_NEAR_HOME 必須依賴已儲存的 Home Location',
  );


  clearHomeLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_HOME',

        message:
          '已由 Intent Handler 判定為 SEARCH_NEAR_HOME',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.handled === true,
    'SEARCH_NEAR_HOME 必須被 Action Handler 接住',
  );


  assert(
    result.success === false,
    '沒有 Home Location 時不得成功搜尋',
  );


  assert(
    result.reason ===
      'home-location-unknown',

    `沒有 Home Location 時必須停止，實際=${result.reason}`,
  );


  assert(
    result.location === undefined,
    '沒有 Home Location 時不得自行產生位置',
  );


  assert(
    result.places === undefined,
    '沒有 Home Location 時不得產生店家結果',
  );
}


/**
 * =========================================================
 * Test 13
 * =========================================================
 */

async function testCurrentLocationDoesNotUseHome(): Promise<void> {

  section(
    'Test 13：SEARCH_NEAR_CURRENT 不得因存在固定家位置而改用 Home',
  );


  createCurrentLocation();

  createHomeLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_CURRENT',

        message:
          '我附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.location?.latitude ===
      25.023375,

    'SEARCH_NEAR_CURRENT 必須維持目前位置 latitude',
  );


  assert(
    result.location?.longitude ===
      121.454642,

    'SEARCH_NEAR_CURRENT 必須維持目前位置 longitude',
  );


  assert(
    result.location?.latitude !==
      25.012345,

    'SEARCH_NEAR_CURRENT 不得改用固定家 latitude',
  );
}


/**
 * =========================================================
 * Test 14
 * =========================================================
 */

async function testHomeActionDoesNotUseCurrent(): Promise<void> {

  section(
    'Test 14：SEARCH_NEAR_HOME 不得因存在目前位置而改用目前位置',
  );


  createCurrentLocation();

  createHomeLocation();


  const result =
    await handleLocationPlacesAction(
      {
        action:
          'SEARCH_NEAR_HOME',

        message:
          '我家附近有什麼好吃的',

        userId:
          TEST_USER_ID,
      },
    );


  assert(
    result.location?.latitude ===
      25.012345,

    'SEARCH_NEAR_HOME 必須維持固定家 latitude',
  );


  assert(
    result.location?.longitude ===
      121.456789,

    'SEARCH_NEAR_HOME 必須維持固定家 longitude',
  );


  assert(
    result.location?.latitude !==
      25.023375,

    'SEARCH_NEAR_HOME 不得改用目前位置 latitude',
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
    'Location Places Action Handler Diagnostic Test',
  );

  console.log(
    '=========================================================',
  );

  console.log(
    '[MODE] 不啟動 Express / 不經 LINE / 不呼叫 Gemini',
  );

  console.log(
    '[MODE] 不呼叫真實 Google Places API',
  );

  console.log(
    '[RULE] 不知道位置就不猜',
  );

  console.log(
    '[RULE] SEARCH_NEAR_CURRENT 必須使用目前 LINE Location',
  );

  console.log(
    '[RULE] SEARCH_NEAR_HOME 必須使用固定 Home Location',
  );

  console.log(
    '[RULE] Google Places 失敗時不得產生假店家',
  );

  console.log(
    '[RULE] Intent 與 Action 必須維持職責分離',
  );

  console.log(
    '=========================================================',
  );


  cleanup();


  try {

    await testNearCurrentWithoutLocation();

    await testNearCurrentWithLocation();

    await testNearHomeWithoutHome();

    await testNearHomeWithHome();

    await testDifferentCurrentAndHomeLocations();

    await testUnsupportedAction();

    await testMissingUserId();

    await testSearchOptions();

    await testCurrentLocationClearSafety();

    await testHomeLocationClearSafety();

    await testNoFakePlacesOnApiFailure();

    await testHomeActionRequiresStoredHome();

    await testCurrentLocationDoesNotUseHome();

    await testHomeActionDoesNotUseCurrent();

  } finally {

    cleanup();
  }


  console.log('');

  console.log(
    '=========================================================',
  );


  if (
    failed === 0
  ) {

    console.log(
      'Location Places Action Handler Diagnostic Test PASSED',
    );

  } else {

    console.log(
      'Location Places Action Handler Diagnostic Test FAILED',
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

    process.exitCode =
      1;
  }
}


void main();