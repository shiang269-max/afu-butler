/**
 * =========================================================
 * Home Location Diagnostic Test
 * =========================================================
 *
 * 測試固定「家」位置資料層。
 *
 * 不經：
 * - LINE
 * - Gemini
 * - Google API
 * - Location Quota
 *
 * =========================================================
 */

import {
  setHomeLocation,
  getHomeLocation,
  hasHomeLocation,
  clearHomeLocation,
} from './src/location/home-location';

import {
  LocationRecord,
} from './src/location/location-types';


/**
 * =========================================================
 * Test State
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
 * Test Data
 * =========================================================
 */

const HOME_LOCATION: LocationRecord = {
  userId:
    'home-location',

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
    '2026-08-21T00:00:00.000Z',
};


/**
 * =========================================================
 * Test 1
 *
 * 初始狀態必須沒有家位置。
 * =========================================================
 */

function testInitialState(): void {

  section(
    'Test 1：初始狀態',
  );


  clearHomeLocation();


  assert(
    hasHomeLocation() === false,
    '初始狀態沒有固定家位置',
  );


  assert(
    getHomeLocation() === undefined,
    '初始狀態取得家位置必須是 undefined',
  );
}


/**
 * =========================================================
 * Test 2
 *
 * 設定固定家位置。
 * =========================================================
 */

function testSetHomeLocation(): void {

  section(
    'Test 2：設定固定家位置',
  );


  setHomeLocation(
    HOME_LOCATION,
  );


  assert(
    hasHomeLocation() === true,
    '設定後必須存在固定家位置',
  );


  const home =
    getHomeLocation();


  assert(
    home !== undefined,
    '設定後可以取得固定家位置',
  );


  assert(
    home?.latitude ===
      HOME_LOCATION.latitude,
    'latitude 必須正確保存',
  );


  assert(
    home?.longitude ===
      HOME_LOCATION.longitude,
    'longitude 必須正確保存',
  );


  assert(
    home?.title ===
      HOME_LOCATION.title,
    'title 必須正確保存',
  );


  assert(
    home?.address ===
      HOME_LOCATION.address,
    'address 必須正確保存',
  );
}


/**
 * =========================================================
 * Test 3
 *
 * 取得資料不得讓外部直接修改內部 State。
 * =========================================================
 */

function testReturnedObjectIsolation(): void {

  section(
    'Test 3：取得資料的隔離性',
  );


  const home =
    getHomeLocation();


  assert(
    home !== undefined,
    '測試前必須存在家位置',
  );


  if (
    !home
  ) {
    return;
  }


  home.title =
    '被外部修改的家';


  const storedHome =
    getHomeLocation();


  assert(
    storedHome?.title ===
      HOME_LOCATION.title,
    '修改取得的物件不得直接改變內部 State',
  );
}


/**
 * =========================================================
 * Test 4
 *
 * setHomeLocation 應該建立自己的資料副本。
 * =========================================================
 */

function testInputObjectIsolation(): void {

  section(
    'Test 4：輸入資料的隔離性',
  );


  const input: LocationRecord = {
    ...HOME_LOCATION,
  };


  setHomeLocation(
    input,
  );


  input.title =
    '外部修改後的家';


  const storedHome =
    getHomeLocation();


  assert(
    storedHome?.title ===
      HOME_LOCATION.title,
    '修改輸入物件不得改變內部 State',
  );
}


/**
 * =========================================================
 * Test 5
 *
 * setHomeLocation 應該由系統重新建立 updatedAt。
 * =========================================================
 */

function testUpdatedAtRefresh(): void {

  section(
    'Test 5：更新時間由系統產生',
  );


  setHomeLocation(
    HOME_LOCATION,
  );


  const home =
    getHomeLocation();


  assert(
    home !== undefined,
    '重新設定後必須存在家位置',
  );


  assert(
    typeof home?.updatedAt ===
      'string',
    'updatedAt 必須是字串',
  );


  assert(
    !Number.isNaN(
      Date.parse(
        home?.updatedAt || '',
      ),
    ),
    'updatedAt 必須是有效日期格式',
  );


  assert(
    home?.updatedAt !==
      HOME_LOCATION.updatedAt,
    'updatedAt 不得直接沿用輸入資料的舊時間',
  );
}


/**
 * =========================================================
 * Test 6
 *
 * 固定家位置永遠應該是 HOME 概念，
 * 不應保留 LINE group source。
 * =========================================================
 */

function testHomeSourceNormalization(): void {

  section(
    'Test 6：固定家位置來源正規化',
  );


  const groupLikeLocation:
    LocationRecord = {

    ...HOME_LOCATION,

    sourceType:
      'group',

    sourceGroupId:
      'test-group',
  };


  setHomeLocation(
    groupLikeLocation,
  );


  const storedHome =
    getHomeLocation();


  assert(
    storedHome?.sourceType ===
      'user',
    '固定家位置 sourceType 必須正規化為 user',
  );


  assert(
    storedHome?.sourceGroupId ===
      undefined,
    '固定家位置不得保留 groupId',
  );
}


/**
 * =========================================================
 * Test 7
 *
 * 清除家位置。
 * =========================================================
 */

function testClearHomeLocation(): void {

  section(
    'Test 7：清除固定家位置',
  );


  const cleared =
    clearHomeLocation();


  assert(
    cleared === true,
    '存在家位置時 clear 必須回傳 true',
  );


  assert(
    hasHomeLocation() === false,
    '清除後不得再有固定家位置',
  );


  assert(
    getHomeLocation() === undefined,
    '清除後取得家位置必須是 undefined',
  );
}


/**
 * =========================================================
 * Test 8
 *
 * 重複清除不存在的位置。
 * =========================================================
 */

function testClearEmptyHomeLocation(): void {

  section(
    'Test 8：清除不存在的家位置',
  );


  const cleared =
    clearHomeLocation();


  assert(
    cleared === false,
    '不存在家位置時 clear 必須回傳 false',
  );


  assert(
    hasHomeLocation() === false,
    '重複清除後仍不得存在家位置',
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
    'Home Location Diagnostic Test',
  );

  console.log(
    '=========================================================',
  );

  console.log(
    '[MODE] 不經 LINE / 不呼叫 Gemini / 不呼叫 Google API',
  );

  console.log(
    '[MODE] 只測試固定家位置資料層',
  );

  console.log(
    '=========================================================',
  );


  try {

    testInitialState();

    testSetHomeLocation();

    testReturnedObjectIsolation();

    testInputObjectIsolation();

    testUpdatedAtRefresh();

    testHomeSourceNormalization();

    testClearHomeLocation();

    testClearEmptyHomeLocation();

  } finally {

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
      'Home Location Diagnostic Test PASSED',
    );

  } else {

    console.error(
      'Home Location Diagnostic Test FAILED',
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
        '[FATAL] Home Location Diagnostic Test 發生未處理錯誤。',
      );

      console.error(
        error,
      );

      process.exitCode = 1;
    },
  );