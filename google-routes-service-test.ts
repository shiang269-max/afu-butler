/**
 * =========================================================
 * Google Routes Service Diagnostic Test
 * =========================================================
 *
 * 目的：
 * - 驗證 Google Routes Service 的輸入防線
 * - 驗證沒有 API Key 時不會進入 Google request
 * - 驗證 helper 的 request 契約
 *
 * 本測試：
 * - 不經 LINE
 * - 不呼叫 Gemini
 * - 不呼叫 Google API
 * - 不消耗 Google Routes 額度
 * =========================================================
 */

import {
  computeGoogleRoute,
  computeTrafficAwareDrivingRoute,
  computeBasicDrivingRoute,
  computeWalkingRoute,
  computeBicycleRoute,
  GoogleRouteCoordinate,
} from './src/location/google-routes-service';

import {
  getLocationQuotaSnapshot,
  resetLocationQuotaForTesting,
} from './src/location/location-quota';


const TEST_ORIGIN: GoogleRouteCoordinate = {
  latitude: 25.0478,
  longitude: 121.5319,
};

const TEST_DESTINATION: GoogleRouteCoordinate = {
  latitude: 25.0130,
  longitude: 121.4628,
};


let passed = 0;
let failed = 0;


function pass(message: string): void {
  passed++;

  console.log(
    `[PASS] ${message}`,
  );
}


function fail(message: string): void {
  failed++;

  console.error(
    `[FAIL] ${message}`,
  );
}


function assert(
  condition: boolean,
  message: string,
): void {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}


async function main(): Promise<void> {

  console.log(
    '=========================================================',
  );

  console.log(
    'Google Routes Service Diagnostic Test',
  );

  console.log(
    '=========================================================',
  );

  console.log(
    '[MODE] 不經 LINE / 不呼叫 Gemini / 不呼叫 Google API',
  );

  console.log('');


  /*
   * ---------------------------------------------------------
   * 測試前清理
   * ---------------------------------------------------------
   */

  resetLocationQuotaForTesting();


  /*
   * ---------------------------------------------------------
   * 1. 無效座標
   * ---------------------------------------------------------
   */

  const invalidLatitude =
    await computeGoogleRoute({
      origin: {
        latitude: 91,
        longitude: 121.5,
      },

      destination:
        TEST_DESTINATION,

      travelMode:
        'DRIVE',
    });


  assert(
    !invalidLatitude.ok &&
    invalidLatitude.error.code === 'invalid-request',
    'latitude 超出範圍必須被阻擋',
  );


  const invalidLongitude =
    await computeGoogleRoute({
      origin: {
        latitude: 25,
        longitude: 181,
      },

      destination:
        TEST_DESTINATION,

      travelMode:
        'DRIVE',
    });


  assert(
    !invalidLongitude.ok &&
    invalidLongitude.error.code === 'invalid-request',
    'longitude 超出範圍必須被阻擋',
  );


  /*
   * ---------------------------------------------------------
   * 2. 不合法的 routingPreference 組合
   * ---------------------------------------------------------
   */

  const invalidWalkTraffic =
    await computeGoogleRoute({
      origin:
        TEST_ORIGIN,

      destination:
        TEST_DESTINATION,

      travelMode:
        'WALK',

      routingPreference:
        'TRAFFIC_AWARE',
    });


  assert(
    !invalidWalkTraffic.ok &&
    invalidWalkTraffic.error.code === 'invalid-request',
    'WALK + TRAFFIC_AWARE 必須被阻擋',
  );


  const invalidBicycleTraffic =
    await computeGoogleRoute({
      origin:
        TEST_ORIGIN,

      destination:
        TEST_DESTINATION,

      travelMode:
        'BICYCLE',

      routingPreference:
        'TRAFFIC_AWARE',
    });


  assert(
    !invalidBicycleTraffic.ok &&
    invalidBicycleTraffic.error.code === 'invalid-request',
    'BICYCLE + TRAFFIC_AWARE 必須被阻擋',
  );


  /*
   * ---------------------------------------------------------
   * 3. API Key 防線
   *
   * 本測試環境不設定 GOOGLE_MAPS_API_KEY。
   * 因此合法 request 必須在 fetch 前停止。
   * ---------------------------------------------------------
   */

  const missingKey =
    await computeGoogleRoute({
      origin:
        TEST_ORIGIN,

      destination:
        TEST_DESTINATION,

      travelMode:
        'DRIVE',
    });


  assert(
    !missingKey.ok &&
    missingKey.error.code === 'missing-api-key',
    '合法 Routes request 在沒有 API Key 時必須停止',
  );


  /*
   * ---------------------------------------------------------
   * 4. Helper：Basic Driving
   * ---------------------------------------------------------
   */

  const basicDriving =
    await computeBasicDrivingRoute(
      TEST_ORIGIN,
      TEST_DESTINATION,
    );


  assert(
    !basicDriving.ok &&
    basicDriving.error.code === 'missing-api-key',
    'Basic Driving helper 必須使用 DRIVE 且在 API Key 缺失時停止',
  );


  /*
   * ---------------------------------------------------------
   * 5. Helper：Traffic-Aware Driving
   * ---------------------------------------------------------
   */

  const trafficDriving =
    await computeTrafficAwareDrivingRoute(
      TEST_ORIGIN,
      TEST_DESTINATION,
    );


  assert(
    !trafficDriving.ok &&
    trafficDriving.error.code === 'missing-api-key',
    'Traffic-Aware Driving helper 必須進入合法 Service 流程且在 API Key 缺失時停止',
  );


  /*
   * ---------------------------------------------------------
   * 6. Helper：Walking
   * ---------------------------------------------------------
   */

  const walking =
    await computeWalkingRoute(
      TEST_ORIGIN,
      TEST_DESTINATION,
    );


  assert(
    !walking.ok &&
    walking.error.code === 'missing-api-key',
    'Walking helper 必須使用 WALK 且在 API Key 缺失時停止',
  );


  /*
   * ---------------------------------------------------------
   * 7. Helper：Bicycle
   * ---------------------------------------------------------
   */

  const bicycle =
    await computeBicycleRoute(
      TEST_ORIGIN,
      TEST_DESTINATION,
    );


  assert(
    !bicycle.ok &&
    bicycle.error.code === 'missing-api-key',
    'Bicycle helper 必須使用 BICYCLE 且在 API Key 缺失時停止',
  );


  /*
   * ---------------------------------------------------------
   * 8. 確認本輪測試沒有消耗內部 quota
   *
   * 因為所有測試都應該在 reserveLocationQuota 前結束。
   * ---------------------------------------------------------
   */

  const quota =
    getLocationQuotaSnapshot();


  assert(
    quota.usedUnits === 0,
    `本輪測試不得消耗 Location quota，實際=${quota.usedUnits}`,
  );


  /*
   * ---------------------------------------------------------
   * 結果
   * ---------------------------------------------------------
   */

  console.log('');

  console.log(
    '=========================================================',
  );

  if (failed === 0) {

    console.log(
      'Google Routes Service Diagnostic Test PASSED',
    );

  } else {

    console.error(
      'Google Routes Service Diagnostic Test FAILED',
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


  if (failed > 0) {
    process.exitCode = 1;
  }
}


main().catch(
  (error) => {

    console.error(
      '[FATAL] Diagnostic Test 發生未預期錯誤:',
      error,
    );

    process.exitCode = 1;
  },
);