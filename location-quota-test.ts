/**
 * =========================================================
 * Location Quota Diagnostic Test
 * =========================================================
 *
 * 只測試 location-quota.ts。
 *
 * 不經 LINE
 * 不呼叫 Gemini
 * 不呼叫 Google API
 * 不碰 Reminder
 * 不碰 Observer
 *
 * 測試重點：
 * 1. 初始狀態
 * 2. reserve 成功後立即記帳
 * 3. 剩餘額度正確
 * 4. 達到 1,000 後阻擋
 * 5. 被阻擋時不能增加使用量
 * 6. reset 可恢復測試狀態
 *
 * 執行：
 *
 *   npx ts-node src/location/location-quota-test.ts
 *
 * =========================================================
 */

import {
  getLocationQuotaSnapshot,
  getLocationQuotaLimit,
  reserveLocationQuota,
  resetLocationQuotaForTesting,
} from './location-quota';


function assert(
  condition: boolean,
  message: string,
): void {

  if (!condition) {
    throw new Error(
      `[ASSERTION FAILED] ${message}`,
    );
  }

  console.log(
    `[PASS] ${message}`,
  );
}


function main(): void {

  console.log(
    '=========================================================',
  );

  console.log(
    'Location Quota Diagnostic Test',
  );

  console.log(
    '=========================================================',
  );

  console.log(
    '[MODE] 不經 LINE / 不呼叫 Gemini / 不呼叫 Google API',
  );

  console.log('');

  /**
   * -------------------------------------------------------
   * TEST 0
   * 確認正式硬上限
   * -------------------------------------------------------
   */

  const limit =
    getLocationQuotaLimit();

  assert(
    limit === 1000,
    `總管內部月硬上限 = 1000，實際=${limit}`,
  );

  /**
   * -------------------------------------------------------
   * TEST 1
   * 重設測試狀態
   * -------------------------------------------------------
   */

  resetLocationQuotaForTesting();

  let snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 0,
    `重設後 usedUnits = 0，實際=${snapshot.usedUnits}`,
  );

  assert(
    snapshot.remainingUnits === 1000,
    `重設後 remainingUnits = 1000，實際=${snapshot.remainingUnits}`,
  );

  assert(
    snapshot.exhausted === false,
    '重設後 exhausted = false',
  );

  /**
   * -------------------------------------------------------
   * TEST 2
   * 單次 reserve
   * -------------------------------------------------------
   */

  const first =
    reserveLocationQuota(
      1,
      'routes',
    );

  assert(
    first.allowed === true,
    '第一次 reserve 1 unit 成功',
  );

  assert(
    first.usedUnits === 1,
    `第一次 reserve 後 usedUnits = 1，實際=${first.usedUnits}`,
  );

  assert(
    first.remainingUnits === 999,
    `第一次 reserve 後 remainingUnits = 999，實際=${first.remainingUnits}`,
  );

  snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 1,
    `重新讀取後 usedUnits = 1，實際=${snapshot.usedUnits}`,
  );

  /**
   * -------------------------------------------------------
   * TEST 3
   * 一次預約多個 unit
   * -------------------------------------------------------
   */

  const batch =
    reserveLocationQuota(
      9,
      'places',
    );

  assert(
    batch.allowed === true,
    '一次 reserve 9 units 成功',
  );

  snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 10,
    `累計 10 units，實際=${snapshot.usedUnits}`,
  );

  assert(
    snapshot.remainingUnits === 990,
    `剩餘 990 units，實際=${snapshot.remainingUnits}`,
  );

  /**
   * -------------------------------------------------------
   * TEST 4
   * 填滿到 1,000
   * -------------------------------------------------------
   */

  const fill =
    reserveLocationQuota(
      990,
      'geocoding',
    );

  assert(
    fill.allowed === true,
    '補足剩餘 990 units 成功',
  );

  snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 1000,
    `達到硬上限 usedUnits = 1000，實際=${snapshot.usedUnits}`,
  );

  assert(
    snapshot.remainingUnits === 0,
    `達到硬上限 remainingUnits = 0，實際=${snapshot.remainingUnits}`,
  );

  assert(
    snapshot.exhausted === true,
    '達到硬上限 exhausted = true',
  );

  /**
   * -------------------------------------------------------
   * TEST 5
   * 超過硬上限必須被阻擋
   * -------------------------------------------------------
   */

  const blocked =
    reserveLocationQuota(
      1,
      'routes',
    );

  assert(
    blocked.allowed === false,
    '1,000 units 後再次 reserve 必須被阻擋',
  );

  assert(
    blocked.reason === 'monthly-limit',
    `阻擋原因 = monthly-limit，實際=${blocked.reason}`,
  );

  snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 1000,
    `被阻擋後 usedUnits 仍為 1000，實際=${snapshot.usedUnits}`,
  );

  assert(
    snapshot.remainingUnits === 0,
    `被阻擋後 remainingUnits 仍為 0，實際=${snapshot.remainingUnits}`,
  );

  /**
   * -------------------------------------------------------
   * TEST 6
   * 一次要求超過剩餘額度也必須整筆阻擋
   *
   * 重新建立 5 units 剩餘空間。
   * -------------------------------------------------------
   */

  resetLocationQuotaForTesting();

  reserveLocationQuota(
    995,
    'routes',
  );

  snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 995,
    `建立 995 units 使用量成功，實際=${snapshot.usedUnits}`,
  );

  const tooLarge =
    reserveLocationQuota(
      6,
      'places',
    );

  assert(
    tooLarge.allowed === false,
    '剩餘 5 units 時要求 6 units 必須被阻擋',
  );

  assert(
    tooLarge.reason === 'monthly-limit',
    `超量阻擋原因 = monthly-limit，實際=${tooLarge.reason}`,
  );

  snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 995,
    `超量請求被阻擋後仍維持 995，實際=${snapshot.usedUnits}`,
  );

  assert(
    snapshot.remainingUnits === 5,
    `超量請求被阻擋後仍剩 5，實際=${snapshot.remainingUnits}`,
  );

  /**
   * -------------------------------------------------------
   * TEST 7
   * invalid units 不得消耗額度
   * -------------------------------------------------------
   */

  const invalid =
    reserveLocationQuota(
      0,
      'other',
    );

  assert(
    invalid.allowed === false,
    '0 unit request 必須被阻擋',
  );

  assert(
    invalid.reason === 'invalid-units',
    `0 unit 阻擋原因 = invalid-units，實際=${invalid.reason}`,
  );

  snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 995,
    `invalid units 不得增加使用量，實際=${snapshot.usedUnits}`,
  );

  /**
   * -------------------------------------------------------
   * TEST 8
   * 最後清理測試狀態
   *
   * 避免 diagnostic test 留下 995 units，
   * 影響後續正式開發。
   * -------------------------------------------------------
   */

  resetLocationQuotaForTesting();

  snapshot =
    getLocationQuotaSnapshot();

  assert(
    snapshot.usedUnits === 0,
    `測試結束清理後 usedUnits = 0，實際=${snapshot.usedUnits}`,
  );

  assert(
    snapshot.remainingUnits === 1000,
    `測試結束清理後 remainingUnits = 1000，實際=${snapshot.remainingUnits}`,
  );

  console.log('');

  console.log(
    '=========================================================',
  );

  console.log(
    'Location Quota Diagnostic Test PASSED',
  );

  console.log(
    '=========================================================',
  );
}


try {

  main();

} catch (
  error
) {

  console.error('');

  console.error(
    '=========================================================',
  );

  console.error(
    'Location Quota Diagnostic Test FAILED',
  );

  console.error(
    '=========================================================',
  );

  console.error(
    error,
  );

  process.exitCode =
    1;
}