/**
 * =========================================================
 * Google Routes Live Diagnostic Test
 * =========================================================
 *
 * 目的：
 * - 驗證目前 GOOGLE_MAPS_API_KEY 是否真的可以呼叫 Routes API
 * - 驗證目前 google-routes-service.ts 的正式流程
 * - 驗證 Location Quota 在真實 Google request 前後的行為
 *
 * 測試規則：
 * - 不經 LINE
 * - 不呼叫 Gemini
 * - 只允許 1 次真實 Google Routes API request
 * - 不使用 TRAFFIC_AWARE
 * - 不 retry
 * - 不修改正式位置功能
 * - 測試結束後恢復 Location Quota
 *
 * =========================================================
 */

import 'dotenv/config';

import {
  computeBasicDrivingRoute,
} from './src/location/google-routes-service';

import {
  getLocationQuotaSnapshot,
  resetLocationQuotaForTesting,
} from './src/location/location-quota';


/**
 * =========================================================
 * Test Constants
 * =========================================================
 */

/**
 * 台北車站
 */
const ORIGIN = {
  latitude: 25.0478,
  longitude: 121.5170,
};


/**
 * 台北 101
 */
const DESTINATION = {
  latitude: 25.0339,
  longitude: 121.5645,
};


/**
 * =========================================================
 * Output Helpers
 * =========================================================
 */

function printLine(): void {
  console.log(
    '=========================================================',
  );
}


function pass(
  message: string,
): void {

  console.log(
    `[PASS] ${message}`,
  );
}


function fail(
  message: string,
): void {

  console.error(
    `[FAIL] ${message}`,
  );
}


function info(
  message: string,
): void {

  console.log(
    `[INFO] ${message}`,
  );
}


/**
 * =========================================================
 * Environment Check
 * =========================================================
 */

function checkApiKey(): boolean {

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY;

  if (
    !apiKey ||
    !apiKey.trim()
  ) {

    fail(
      'GOOGLE_MAPS_API_KEY 未載入。',
    );

    return false;
  }

  pass(
    `GOOGLE_MAPS_API_KEY 已載入，長度=${apiKey.length}`,
  );

  return true;
}


/**
 * =========================================================
 * Quota Snapshot Helper
 * =========================================================
 */

function getUsedUnits(): number {

  const snapshot =
    getLocationQuotaSnapshot();

  return snapshot.usedUnits;
}


/**
 * =========================================================
 * Main Test
 * ========================================================= */

async function main(): Promise<void> {

  printLine();

  console.log(
    'Google Routes Live Diagnostic Test',
  );

  printLine();

  console.log(
    '[MODE] 真實呼叫 Google Routes API',
  );

  console.log(
    '[MODE] 不經 LINE / 不呼叫 Gemini',
  );

  console.log(
    '[MODE] 本次最多 1 次 Google API request',
  );

  console.log(
    '[MODE] 不使用 TRAFFIC_AWARE',
  );

  console.log(
    '[MODE] 不 retry',
  );

  printLine();


  /**
   * -------------------------------------------------------
   * 1. API Key
   * -------------------------------------------------------
   */

  if (
    !checkApiKey()
  ) {

    process.exitCode = 1;

    return;
  }


  /**
   * -------------------------------------------------------
   * 2. Reset internal quota
   * -------------------------------------------------------
   *
   * 這只是測試環境清理。
   *
   * 不代表 Google 官方 quota 被重設。
   */

  resetLocationQuotaForTesting();

  const beforeSnapshot =
    getLocationQuotaSnapshot();

  info(
    `測試前 Location Quota usedUnits=${beforeSnapshot.usedUnits}`,
  );


  if (
    beforeSnapshot.usedUnits !== 0
  ) {

    fail(
      `測試前 quota 未清零，實際=${beforeSnapshot.usedUnits}`,
    );

    process.exitCode = 1;

    return;
  }

  pass(
    '測試前 Location Quota = 0',
  );


  /**
   * -------------------------------------------------------
   * 3. Validate test coordinates
   * -------------------------------------------------------
   */

  info(
    `Origin = ${ORIGIN.latitude}, ${ORIGIN.longitude}`,
  );

  info(
    `Destination = ${DESTINATION.latitude}, ${DESTINATION.longitude}`,
  );


  /**
   * -------------------------------------------------------
   * 4. Real Google Routes request
   * -------------------------------------------------------
   *
   * 使用正式 Service：
   *
   * computeBasicDrivingRoute()
   *
   * 這裡刻意不使用：
   *
   * computeTrafficAwareDrivingRoute()
   *
   * 因為第一個 live test 只需要確認：
   *
   * Node.js
   *   ↓
   * Routes API
   *   ↓
   * Google
   *
   * 是否能正常建立基本路線。
   */

  info(
    '開始唯一一次真實 Google Routes API request...',
  );


  let result;

  try {

    result =
      await computeBasicDrivingRoute(
        ORIGIN,
        DESTINATION,
      );

  } catch (
    error
  ) {

    fail(
      'computeBasicDrivingRoute() 發生未捕獲例外。',
    );

    console.error(
      error,
    );

    process.exitCode = 1;

    return;
  }


  /**
   * -------------------------------------------------------
   * 5. Google response
   * -------------------------------------------------------
   */

  if (
    !result.ok
  ) {

    fail(
      'Google Routes API request 失敗。',
    );

    console.error(
      JSON.stringify(
        result.error,
        null,
        2,
      ),
    );


    /**
     * 即使 Google request 失敗，
     * 這裡也不 retry。
     */

    process.exitCode = 1;

    return;
  }


  pass(
    'Google Routes API request 成功。',
  );


  /**
   * -------------------------------------------------------
   * 6. Route result validation
   * -------------------------------------------------------
   */

  const route =
    result.route;


  if (
    !Number.isFinite(
      route.durationSeconds,
    )
  ) {

    fail(
      'Google 回傳 durationSeconds 無效。',
    );

    process.exitCode = 1;

    return;
  }

  pass(
    `durationSeconds=${route.durationSeconds}`,
  );


  if (
    !Number.isFinite(
      route.distanceMeters,
    )
  ) {

    fail(
      'Google 回傳 distanceMeters 無效。',
    );

    process.exitCode = 1;

    return;
  }

  pass(
    `distanceMeters=${route.distanceMeters}`,
  );


  if (
    !route.durationText ||
    !route.durationText.trim()
  ) {

    fail(
      'Google 回傳 durationText 無效。',
    );

    process.exitCode = 1;

    return;
  }

  pass(
    `durationText=${route.durationText}`,
  );


  /**
   * -------------------------------------------------------
   * 7. Quota validation
   * -------------------------------------------------------
   *
   * 正式 Service 對每一次 Compute Routes request
   * reserve 1 internal unit。
   *
   * 因此成功 request 後：
   *
   * usedUnits === 1
   */

  const afterSnapshot =
    getLocationQuotaSnapshot();


  info(
    `Google request 後 Location Quota usedUnits=${afterSnapshot.usedUnits}`,
  );


  if (
    afterSnapshot.usedUnits !== 1
  ) {

    fail(
      `Google request 後 quota 應為 1，實際=${afterSnapshot.usedUnits}`,
    );

    process.exitCode = 1;

    return;
  }

  pass(
    'Google request 後 Location Quota 正確增加 1 unit。',
  );


  /**
   * -------------------------------------------------------
   * 8. Remaining quota
   * -------------------------------------------------------
   */

  if (
    afterSnapshot.remainingUnits !==
    afterSnapshot.monthlyLimit - 1
  ) {

    fail(
      `remainingUnits 不正確，實際=${afterSnapshot.remainingUnits}`,
    );

    process.exitCode = 1;

    return;
  }

  pass(
    `remainingUnits=${afterSnapshot.remainingUnits}`,
  );


  /**
   * -------------------------------------------------------
   * 9. Final result
   * -------------------------------------------------------
   */

  printLine();

  console.log(
    'Google Routes Live Diagnostic Test PASSED',
  );

  console.log(
    `Google Route duration: ${route.durationText}`,
  );

  console.log(
    `Google Route distance: ${route.distanceMeters} meters`,
  );

  console.log(
    `Internal Location Quota used: ${afterSnapshot.usedUnits}`,
  );

  printLine();


  /**
   * -------------------------------------------------------
   * 10. Test cleanup
   * -------------------------------------------------------
   *
   * 重要：
   *
   * 這只清除「總管自己的內部測試計數」。
   *
   * Google 官方實際使用量不會因這裡 reset 而回復。
   */

  resetLocationQuotaForTesting();

  const cleanupSnapshot =
    getLocationQuotaSnapshot();


  if (
    cleanupSnapshot.usedUnits !== 0
  ) {

    fail(
      `測試清理失敗，usedUnits=${cleanupSnapshot.usedUnits}`,
    );

    process.exitCode = 1;

    return;
  }


  pass(
    '測試結束後已清理內部 Location Quota。',
  );

  printLine();

}


/**
 * =========================================================
 * Execute
 * =========================================================
 */

main()
  .catch(
    (
      error,
    ) => {

      console.error(
        '[FATAL] Google Routes Live Diagnostic Test 發生未處理錯誤。',
      );

      console.error(
        error,
      );

      process.exitCode = 1;
    },
  );