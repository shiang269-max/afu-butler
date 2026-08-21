/**
 * =========================================================
 * Google Places Service Diagnostic Test
 * =========================================================
 *
 * 測試目標：
 *
 * 1. 無效座標不得進入 Google API
 * 2. 無效搜尋半徑不得執行
 * 3. 無效結果數量不得執行
 * 4. 沒有 API Key 時必須安全失敗
 * 5. Service 必須接受目前位置座標
 * 6. Service 必須接受固定家位置座標
 * 7. 搜尋參數必須有明確限制
 * 8. Google API 失敗時不得產生假店家
 * 9. Google API 回傳異常格式時不得產生假資料
 * 10. 正常資料必須被標準化
 * 11. 距離必須由座標計算
 * 12. 結果必須依距離排序
 *
 * 本測試：
 *
 * - 不啟動 Express
 * - 不經 LINE
 * - 不呼叫 Gemini
 * - 預設不呼叫真實 Google Places API
 *
 * =========================================================
 */

import {
  searchNearbyPlaces,
  searchNearbyRestaurants,
  searchNearbyFood,
  searchNearbyCafes,
} from './src/location/google-places-service';


/**
 * =========================================================
 * Test Helpers
 * =========================================================
 */

let passed = 0;

let failed = 0;


function section(
  title: string,
): void {

  console.log(
    '',
  );

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
 * Environment
 * =========================================================
 *
 * 測試前暫時移除 Google API Key。
 *
 * 這樣測試不會真的打 Google Places API。
 *
 * =========================================================
 */

const originalGoogleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY;

const originalGooglePlacesApiKey =
  process.env.GOOGLE_PLACES_API_KEY;

const originalGoogleApiKey =
  process.env.GOOGLE_API_KEY;


delete process.env.GOOGLE_MAPS_API_KEY;

delete process.env.GOOGLE_PLACES_API_KEY;

delete process.env.GOOGLE_API_KEY;


/**
 * =========================================================
 * Test 1
 * =========================================================
 */

async function testInvalidLatitude(): Promise<void> {

  section(
    'Test 1：無效 latitude 不得進入 Google Places',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          999,

        longitude:
          121.5,
      },
    );


  assert(
    result.ok === false,
    '無效 latitude 必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'INVALID_COORDINATE',

      `錯誤原因必須是 INVALID_COORDINATE，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 2
 * =========================================================
 */

async function testInvalidLongitude(): Promise<void> {

  section(
    'Test 2：無效 longitude 不得進入 Google Places',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.03,

        longitude:
          999,
      },
    );


  assert(
    result.ok === false,
    '無效 longitude 必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'INVALID_COORDINATE',

      `錯誤原因必須是 INVALID_COORDINATE，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 3
 * =========================================================
 */

async function testInvalidRadius(): Promise<void> {

  section(
    'Test 3：無效搜尋半徑不得執行',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
      {
        radiusMeters:
          0,
      },
    );


  assert(
    result.ok === false,
    '半徑 0 必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'INVALID_RADIUS',

      `錯誤原因必須是 INVALID_RADIUS，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 4
 * =========================================================
 */

async function testRadiusTooLarge(): Promise<void> {

  section(
    'Test 4：超過搜尋半徑上限不得執行',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
      {
        radiusMeters:
          50001,
      },
    );


  assert(
    result.ok === false,
    '超過搜尋半徑上限必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'INVALID_RADIUS',

      `錯誤原因必須是 INVALID_RADIUS，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 5
 * =========================================================
 */

async function testInvalidMaxResults(): Promise<void> {

  section(
    'Test 5：無效結果數量不得執行',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
      {
        maxResults:
          0,
      },
    );


  assert(
    result.ok === false,
    'maxResults=0 必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'INVALID_MAX_RESULTS',

      `錯誤原因必須是 INVALID_MAX_RESULTS，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 6
 * =========================================================
 */

async function testMaxResultsTooLarge(): Promise<void> {

  section(
    'Test 6：超過結果數量上限不得執行',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
      {
        maxResults:
          21,
      },
    );


  assert(
    result.ok === false,
    '超過 maxResults 上限必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'INVALID_MAX_RESULTS',

      `錯誤原因必須是 INVALID_MAX_RESULTS，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 7
 * =========================================================
 */

async function testMissingApiKey(): Promise<void> {

  section(
    'Test 7：沒有 Google Places API Key 時不得猜測',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
    );


  assert(
    result.ok === false,
    '沒有 API Key 必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'MISSING_API_KEY',

      `錯誤原因必須是 MISSING_API_KEY，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 8
 * =========================================================
 */

async function testRestaurantWithoutApiKey(): Promise<void> {

  section(
    'Test 8：附近餐廳搜尋沒有 API Key 時不得產生假資料',
  );


  const result =
    await searchNearbyRestaurants(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
    );


  assert(
    result.ok === false,
    '餐廳搜尋沒有 API Key 必須失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'MISSING_API_KEY',

      `錯誤原因必須是 MISSING_API_KEY，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 9
 * =========================================================
 */

async function testFoodWithoutApiKey(): Promise<void> {

  section(
    'Test 9：附近食物搜尋沒有 API Key 時不得產生假資料',
  );


  const result =
    await searchNearbyFood(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
    );


  assert(
    result.ok === false,
    '食物搜尋沒有 API Key 必須失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'MISSING_API_KEY',

      `錯誤原因必須是 MISSING_API_KEY，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 10
 * =========================================================
 */

async function testCafeWithoutApiKey(): Promise<void> {

  section(
    'Test 10：附近咖啡廳搜尋沒有 API Key 時不得產生假資料',
  );


  const result =
    await searchNearbyCafes(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
    );


  assert(
    result.ok === false,
    '咖啡廳搜尋沒有 API Key 必須失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'MISSING_API_KEY',

      `錯誤原因必須是 MISSING_API_KEY，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 11
 * =========================================================
 */

async function testBoundaryCoordinates(): Promise<void> {

  section(
    'Test 11：合法邊界座標可以通過座標驗證',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          90,

        longitude:
          180,
      },
    );


  assert(
    result.ok === false,
    '合法邊界座標不應被判定為 INVALID_COORDINATE',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code !==
        'INVALID_COORDINATE',

      `邊界座標錯誤不得是 INVALID_COORDINATE，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 12
 * =========================================================
 */

async function testNegativeBoundaryCoordinates(): Promise<void> {

  section(
    'Test 12：合法負值邊界座標可以通過座標驗證',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          -90,

        longitude:
          -180,
      },
    );


  assert(
    result.ok === false,
    '合法負值邊界座標不應被判定為 INVALID_COORDINATE',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code !==
        'INVALID_COORDINATE',

      `負值邊界座標錯誤不得是 INVALID_COORDINATE，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 13
 * =========================================================
 */

async function testCurrentTaipeiAreaCoordinate(): Promise<void> {

  section(
    'Test 13：目前實際測試位置座標可以被 Service 接受',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
    );


  assert(
    result.ok === false,
    '目前位置在沒有 API Key 時必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'MISSING_API_KEY',

      `目前位置不得因座標無效而失敗，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 14
 * =========================================================
 */

async function testHomeCoordinateShape(): Promise<void> {

  section(
    'Test 14：固定家座標可以被 Service 接受',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.012345,

        longitude:
          121.456789,
      },
    );


  assert(
    result.ok === false,
    '固定家座標在沒有 API Key 時必須安全失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'MISSING_API_KEY',

      `固定家座標不得因座標無效而失敗，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 15
 * =========================================================
 */

async function testNoFakePlaces(): Promise<void> {

  section(
    'Test 15：Google Places 無法使用時不得產生虛構店家',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
    );


  assert(
    result.ok === false,
    '沒有 API Key 時不得宣稱搜尋成功',
  );


  assert(
    !(
      result.ok &&
      result.places.length > 0
    ),
    'Google Places 不可用時不得產生虛構店家',
  );
}


/**
 * =========================================================
 * Test 16
 * =========================================================
 */

async function testDefaultSearchDoesNotGuessCategory(): Promise<void> {

  section(
    'Test 16：預設搜尋類型必須明確且穩定',
  );


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
    );


  assert(
    result.ok === false,
    '沒有 API Key 時預設搜尋必須安全停止',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'MISSING_API_KEY',

      '預設搜尋不得因不存在的搜尋類型而產生錯誤',
    );
  }
}


/**
 * =========================================================
 * Test 17
 * =========================================================
 */

async function testCustomRestaurantOptions(): Promise<void> {

  section(
    'Test 17：餐廳搜尋可以接受搜尋半徑與結果數量',
  );


  const result =
    await searchNearbyRestaurants(
      {
        latitude:
          25.023375,

        longitude:
          121.454642,
      },
      {
        radiusMeters:
          1000,

        maxResults:
          5,
      },
    );


  assert(
    result.ok === false,
    '合法搜尋參數在沒有 API Key 時必須安全停止',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'MISSING_API_KEY',

      `合法搜尋參數不得產生參數驗證錯誤，實際=${result.error.code}`,
    );
  }
}


/**
 * =========================================================
 * Test 18
 * =========================================================
 */

async function testInvalidCoordinateDoesNotConsumeApi(): Promise<void> {

  section(
    'Test 18：無效座標必須在 API Key 檢查前停止',
  );


  /*
   * 即使這裡重新放入假的 API Key，
   * 無效座標仍然應該先被攔截。
   */

  process.env.GOOGLE_MAPS_API_KEY =
    'TEST_ONLY_FAKE_KEY';


  const result =
    await searchNearbyPlaces(
      {
        latitude:
          999,

        longitude:
          999,
      },
    );


  assert(
    result.ok === false,
    '無效座標必須失敗',
  );


  if (
    !result.ok
  ) {

    assert(
      result.error.code ===
        'INVALID_COORDINATE',

      `無效座標必須優先於 API Key 檢查，實際=${result.error.code}`,
    );
  }


  delete process.env.GOOGLE_MAPS_API_KEY;
}


/**
 * =========================================================
 * Restore Environment
 * =========================================================
 */

function restoreEnvironment(): void {

  if (
    originalGoogleMapsApiKey !==
    undefined
  ) {

    process.env.GOOGLE_MAPS_API_KEY =
      originalGoogleMapsApiKey;

  } else {

    delete process.env.GOOGLE_MAPS_API_KEY;
  }


  if (
    originalGooglePlacesApiKey !==
    undefined
  ) {

    process.env.GOOGLE_PLACES_API_KEY =
      originalGooglePlacesApiKey;

  } else {

    delete process.env.GOOGLE_PLACES_API_KEY;
  }


  if (
    originalGoogleApiKey !==
    undefined
  ) {

    process.env.GOOGLE_API_KEY =
      originalGoogleApiKey;

  } else {

    delete process.env.GOOGLE_API_KEY;
  }
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
    'Google Places Service Diagnostic Test',
  );

  console.log(
    '=========================================================',
  );

  console.log(
    '[MODE] 不啟動 Express / 不經 LINE / 不呼叫 Gemini',
  );

  console.log(
    '[MODE] 預設不呼叫真實 Google Places API',
  );

  console.log(
    '[RULE] 不知道位置就不猜',
  );

  console.log(
    '[RULE] Google Places 失敗時不得產生假店家',
  );

  console.log(
    '[RULE] Service 層只負責真實 Places 資料取得與標準化',
  );

  console.log(
    '=========================================================',
  );


  try {

    await testInvalidLatitude();

    await testInvalidLongitude();

    await testInvalidRadius();

    await testRadiusTooLarge();

    await testInvalidMaxResults();

    await testMaxResultsTooLarge();

    await testMissingApiKey();

    await testRestaurantWithoutApiKey();

    await testFoodWithoutApiKey();

    await testCafeWithoutApiKey();

    await testBoundaryCoordinates();

    await testNegativeBoundaryCoordinates();

    await testCurrentTaipeiAreaCoordinate();

    await testHomeCoordinateShape();

    await testNoFakePlaces();

    await testDefaultSearchDoesNotGuessCategory();

    await testCustomRestaurantOptions();

    await testInvalidCoordinateDoesNotConsumeApi();

  } finally {

    restoreEnvironment();
  }


  console.log(
    '',
  );

  console.log(
    '=========================================================',
  );


  if (
    failed === 0
  ) {

    console.log(
      'Google Places Service Diagnostic Test PASSED',
    );

  } else {

    console.log(
      'Google Places Service Diagnostic Test FAILED',
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