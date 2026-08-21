/**
 * =========================================================
 * Location Resolver Diagnostic Test
 * =========================================================
 *
 * 目的：
 *
 * 1. 驗證 Location Resolver 的位置判斷。
 * 2. 驗證「不知道就不猜」的硬規則。
 * 3. 驗證沒有目前位置時必須要求使用者補充。
 * 4. 驗證 LINE 定位存在時才能使用 CURRENT_USER_LOCATION。
 * 5. 驗證明確文字地點可以被辨識。
 * 6. 驗證模糊「附近」不得自行猜測。
 * 7. 驗證 Resolver 不會呼叫 Google API。
 * 8. 驗證測試不會消耗 Location Quota。
 *
 * 不經：
 *
 * - LINE
 * - Gemini
 * - Google API
 *
 * =========================================================
 */

import {
  resolveLocationReference,
  buildLocationClarificationMessage,
  isLocationResolutionSafe,
} from './src/location/location-resolver';

import {
  setLatestLocation,
  clearLatestLocation,
} from './src/location/location-state';

import {
  LocationRecord,
} from './src/location/location-types';

import {
  getLocationQuotaSnapshot,
  resetLocationQuotaForTesting,
} from './src/location/location-quota';

import {
  setHomeLocation,
  clearHomeLocation,
} from './src/location/home-location';


/**
 * =========================================================
 * Test Constants
 * =========================================================
 */

const TEST_USER_ID =
  'location-resolver-test-user';


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
 * Test Location
 * =========================================================
 */

const TEST_LOCATION: LocationRecord = {
  userId:
    TEST_USER_ID,

  title:
    '測試位置',

  address:
    '台北市測試位置',

  latitude:
    25.0478,

  longitude:
    121.5170,

  sourceType:
    'user',

  updatedAt:
    new Date().toISOString(),
};


/**
 * =========================================================
 * Test 1
 *
 * 完全不知道位置
 *
 * 「附近有什麼好吃的」
 *
 * 不可以自行猜：
 *
 * 附近 = 使用者目前位置
 *
 * =========================================================
 */

function testUnknownNearby(): void {

  section(
    'Test 1：模糊「附近」不得自行猜測',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    resolveLocationReference(
      '附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.resolved === false,
    '模糊附近需求不得直接 resolved',
  );


  assert(
    result.referenceType === 'UNKNOWN',
    `referenceType 必須是 UNKNOWN，實際=${result.referenceType}`,
  );


  assert(
    result.clarificationRequired === true,
    '模糊附近需求必須要求使用者確認',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ) === false,
    '模糊附近需求不得通過安全執行檢查',
  );


  const message =
    buildLocationClarificationMessage(
      result,
    );


  assert(
    message.length > 0,
    '模糊附近需求必須產生確認訊息',
  );
}


/**
 * =========================================================
 * Test 2
 *
 * 使用者明確詢問自己的目前位置
 *
 * 但沒有 LINE 定位。
 *
 * 不可以猜。
 *
 * =========================================================
 */

function testCurrentLocationWithoutLocation(): void {

  section(
    'Test 2：詢問目前位置，但沒有 LINE 定位',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    resolveLocationReference(
      '我現在在哪裡',
      TEST_USER_ID,
    );


  assert(
    result.resolved === false,
    '沒有目前位置時不得 resolved',
  );


  assert(
    result.referenceType ===
      'CURRENT_USER_LOCATION',
    `referenceType 必須是 CURRENT_USER_LOCATION，實際=${result.referenceType}`,
  );


  assert(
    result.clarificationRequired === true,
    '沒有目前位置時必須要求使用者補充',
  );


  assert(
    result.location === undefined,
    '沒有目前位置時不得產生虛構 LocationRecord',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ) === false,
    '沒有目前位置時不得通過安全執行檢查',
  );


  const message =
    buildLocationClarificationMessage(
      result,
    );


  assert(
    message.includes(
      'LINE 定位',
    ),
    '目前位置未知時確認訊息應要求 LINE 定位或文字位置',
  );
}


/**
 * =========================================================
 * Test 3
 *
 * LINE 定位存在後：
 *
 * 「我現在在哪裡」
 *
 * 才可以使用目前位置。
 *
 * =========================================================
 */

function testCurrentLocationWithLocation(): void {

  section(
    'Test 3：已有 LINE 定位後才能使用目前位置',
  );


  setLatestLocation(
    TEST_LOCATION,
  );


  const result =
    resolveLocationReference(
      '我現在在哪裡',
      TEST_USER_ID,
    );


  assert(
    result.resolved === true,
    '已有 LINE 定位時目前位置可以 resolved',
  );


  assert(
    result.referenceType ===
      'CURRENT_USER_LOCATION',
    `referenceType 必須是 CURRENT_USER_LOCATION，實際=${result.referenceType}`,
  );


  assert(
    result.clarificationRequired === false,
    '已有 LINE 定位時不需要再次確認',
  );


  assert(
    result.location !== undefined,
    '已有 LINE 定位時必須取得 LocationRecord',
  );


  assert(
    result.location?.latitude ===
      TEST_LOCATION.latitude,
    '解析出的 latitude 必須與 LINE 定位一致',
  );


  assert(
    result.location?.longitude ===
      TEST_LOCATION.longitude,
    '解析出的 longitude 必須與 LINE 定位一致',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ) === true,
    '已有明確位置時可以通過安全執行檢查',
  );
}


/**
 * =========================================================
 * Test 4
 *
 * 使用者說：
 *
 * 「我附近有什麼好吃的」
 *
 * 已經有目前位置。
 *
 * 這時可以將「我附近」理解為目前位置。
 *
 * =========================================================
 */

function testMyNearbyWithLocation(): void {

  section(
    'Test 4：已有 LINE 定位後「我附近」可以使用目前位置',
  );


  const result =
    resolveLocationReference(
      '我附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.resolved === true,
    '已有目前位置時「我附近」可以 resolved',
  );


  assert(
    result.referenceType ===
      'CURRENT_USER_LOCATION',
    `referenceType 必須是 CURRENT_USER_LOCATION，實際=${result.referenceType}`,
  );


  assert(
    result.location?.userId ===
      TEST_USER_ID,
    '目前位置必須屬於正確使用者',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ) === true,
    '已有目前位置時「我附近」可以通過安全執行檢查',
  );
}


/**
 * =========================================================
 * Test 5
 *
 * 明確文字地點：
 *
 * 「板橋大遠百附近有什麼好吃的」
 *
 * 不需要使用者目前位置。
 *
 * =========================================================
 */

function testExplicitTextPlace(): void {

  section(
    'Test 5：明確文字地點可以被辨識',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    resolveLocationReference(
      '板橋大遠百附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.resolved === true,
    '明確文字地點可以 resolved',
  );


  assert(
    result.referenceType ===
      'EXPLICIT_TEXT_PLACE',
    `referenceType 必須是 EXPLICIT_TEXT_PLACE，實際=${result.referenceType}`,
  );


  assert(
    result.placeText ===
      '板橋大遠百',
    `placeText 必須是板橋大遠百，實際=${result.placeText}`,
  );


  assert(
    result.clarificationRequired === false,
    '明確文字地點不需要再次詢問位置',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ) === true,
    '明確文字地點可以通過安全執行檢查',
  );
}


/**
 * =========================================================
 * Test 6
 *
 * 「家附近」
 *
 * 目前只知道語意是 HOME。
 *
 * 但固定家位置尚未接入。
 *
 * 所以：
 *
 * 不可以假裝知道座標。
 *
 * =========================================================
 */

function testHomeWithoutConfiguredHome(): void {

  section(
    'Test 6：「家」目前尚未設定固定位置',
  );


  const result =
    resolveLocationReference(
      '我家附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.resolved === false,
    '尚未接入固定家位置時不得 resolved',
  );


  assert(
    result.referenceType ===
      'HOME',
    `referenceType 必須是 HOME，實際=${result.referenceType}`,
  );


  assert(
    result.clarificationRequired === true,
    '固定家位置尚未建立時必須要求處理確認',
  );


  assert(
    result.location === undefined,
    '尚未設定家位置時不得產生虛構座標',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ) === false,
    '尚未設定家位置時不得進入執行層',
  );
}


/**
 * =========================================================
 * Test 7
 *
 * 文字路程：
 *
 * 「從板橋車站到板橋大遠百多久」
 *
 * 第一個地點是明確文字來源。
 *
 * =========================================================
 */

function testExplicitRouteOrigin(): void {

  section(
    'Test 7：明確文字起點可以被辨識',
  );


  const result =
    resolveLocationReference(
      '從板橋車站到板橋大遠百多久',
      TEST_USER_ID,
    );


  assert(
    result.resolved === true,
    '明確文字起點可以 resolved',
  );


  assert(
    result.referenceType ===
      'EXPLICIT_TEXT_PLACE',
    `referenceType 必須是 EXPLICIT_TEXT_PLACE，實際=${result.referenceType}`,
  );


  assert(
    result.placeText ===
      '板橋車站',
    `placeText 必須是板橋車站，實際=${result.placeText}`,
  );


  assert(
    isLocationResolutionSafe(
      result,
    ) === true,
    '明確文字起點可以通過安全執行檢查',
  );
}


/**
 * =========================================================
 * Test 8
 *
 * 「去那附近有什麼」
 *
 * 沒有任何可以確定的地點。
 *
 * 不得猜。
 *
 * =========================================================
 */

function testAmbiguousLocation(): void {

  section(
    'Test 8：完全模糊的位置不得猜測',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    resolveLocationReference(
      '那附近有什麼',
      TEST_USER_ID,
    );


  assert(
    result.resolved === false,
    '完全模糊位置不得 resolved',
  );


  assert(
    result.referenceType ===
      'UNKNOWN',
    `referenceType 必須是 UNKNOWN，實際=${result.referenceType}`,
  );


  assert(
    result.clarificationRequired === true,
    '完全模糊位置必須要求確認',
  );


  assert(
    result.placeText === undefined,
    '完全模糊位置不得產生猜測出的 placeText',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ) === false,
    '完全模糊位置不得通過安全執行檢查',
  );
}


/**
 * =========================================================
 * Test 9
 *
 * Resolver 不應該改變 Location Quota。
 *
 * =========================================================
 */

function testQuotaUnchanged(): void {

  section(
    'Test 9：Resolver 不得消耗 Location Quota',
  );


  const snapshot =
    getLocationQuotaSnapshot();


  assert(
    snapshot.usedUnits === 0,
    `Resolver 測試期間 quota 必須維持 0，實際=${snapshot.usedUnits}`,
  );
}


/**
 * =========================================================
 * Test 10
 *
 * 清除目前位置後再次確認：
 *
 * 不能留下上一筆位置。
 *
 * =========================================================
 */

function testLocationClearSafety(): void {

  section(
    'Test 10：清除 LINE 定位後不得繼續使用舊位置',
  );


  clearLatestLocation(
    TEST_USER_ID,
  );


  const result =
    resolveLocationReference(
      '我現在在哪裡',
      TEST_USER_ID,
    );


  assert(
    result.resolved === false,
    '清除目前位置後不得繼續 resolved',
  );


  assert(
    result.clarificationRequired === true,
    '清除目前位置後必須重新要求位置確認',
  );


  assert(
    result.location === undefined,
    '清除目前位置後不得殘留舊 LocationRecord',
  );
}
function testHomeLocationWhenConfigured(): void {

  section(
    'Test 11：已設定固定家位置後可以解析「我家附近」',
  );


  setHomeLocation(
    {
      userId:
        TEST_USER_ID,

      title:
        '家',

      address:
        '台北市測試家庭地址',

      latitude:
        25.0478,

      longitude:
        121.5170,

      sourceType:
        'user',

      updatedAt:
        new Date().toISOString(),
    },
  );


  const result =
    resolveLocationReference(
      '我家附近有什麼好吃的',
      TEST_USER_ID,
    );


  assert(
    result.resolved === true,
    '已設定家位置後「我家附近」必須 resolved',
  );


  assert(
    result.referenceType ===
      'HOME',
    `referenceType 必須是 HOME，實際=${result.referenceType}`,
  );


  assert(
    result.location !== undefined,
    'resolved 後必須取得固定家 LocationRecord',
  );


  assert(
    result.location?.latitude ===
      25.0478,
    '家位置 latitude 必須正確',
  );


  assert(
    result.location?.longitude ===
      121.5170,
    '家位置 longitude 必須正確',
  );


  assert(
    result.clarificationRequired ===
      false,
    '已設定家位置後不需要再次確認',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ),
    '已設定家位置後可以通過安全執行檢查',
  );
}


function testReturnHomeWhenConfigured(): void {

  section(
    'Test 12：已設定固定家位置後可以解析「我回到家要多久」',
  );


  const result =
    resolveLocationReference(
      '我回到家要多久',
      TEST_USER_ID,
    );


  assert(
    result.resolved === true,
    '「我回到家要多久」必須 resolved',
  );


  assert(
    result.referenceType ===
      'HOME',
    `referenceType 必須是 HOME，實際=${result.referenceType}`,
  );


  assert(
    result.location !== undefined,
    '「回家」必須取得固定家 LocationRecord',
  );


  assert(
    result.location?.latitude ===
      25.0478,
    '回家目的地 latitude 必須是固定家座標',
  );


  assert(
    result.location?.longitude ===
      121.5170,
    '回家目的地 longitude 必須是固定家座標',
  );


  assert(
    result.clarificationRequired ===
      false,
    '已設定家位置後「回家」不需要再次確認',
  );


  assert(
    isLocationResolutionSafe(
      result,
    ),
    '「回家」解析結果可以通過安全執行檢查',
  );


  clearHomeLocation();
}

/**
 * =========================================================
 * Main
 * ========================================================= */

async function main(): Promise<void> {

  console.log(
    '=========================================================',
  );

  console.log(
    'Location Resolver Diagnostic Test',
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
    '[RULE] 無法確認時必須要求使用者補充',
  );

  console.log(
    '=========================================================',
  );


  /**
   * 測試前清理。
   *
   * 這只重設總管內部測試 quota。
   */

  resetLocationQuotaForTesting();

  clearLatestLocation(
    TEST_USER_ID,
  );

  clearHomeLocation();


  try {

    testUnknownNearby();

    testCurrentLocationWithoutLocation();

    testCurrentLocationWithLocation();

    testMyNearbyWithLocation();

    testExplicitTextPlace();

    testHomeWithoutConfiguredHome();

    testExplicitRouteOrigin();

    testAmbiguousLocation();

    testQuotaUnchanged();

    testLocationClearSafety();

    testHomeLocationWhenConfigured();

    testReturnHomeWhenConfigured();

  } finally {

    /**
     * 測試結束後清理測試位置。
     */

    clearLatestLocation(
      TEST_USER_ID,
    );

    clearHomeLocation();

    resetLocationQuotaForTesting();
  }


  console.log('');

  console.log(
    '=========================================================',
  );

  if (
    failed === 0
  ) {

    console.log(
      'Location Resolver Diagnostic Test PASSED',
    );

  } else {

    console.error(
      'Location Resolver Diagnostic Test FAILED',
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
        '[FATAL] Location Resolver Diagnostic Test 發生未處理錯誤。',
      );

      console.error(
        error,
      );

      process.exitCode = 1;
    },
  );