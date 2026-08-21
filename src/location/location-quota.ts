/**
 * =========================================================
 * Location Quota Guard
 * =========================================================
 *
 * 第一階段 Google Maps / Location 額度防線。
 *
 * 核心原則：
 *
 * 1. 這個模組只負責「總管自己的內部額度」。
 * 2. 不直接呼叫 Google API。
 * 3. 不依賴 LINE、Gemini、Reminder 或 AI Core。
 * 4. 所有 Location 外部 API 都應在真正發送 request 前，
 *    先向本模組預約 Usage Units。
 * 5. 預約成功後，即視為消耗本次內部額度。
 * 6. 即使後續 Google API request 失敗，也不自動退回額度。
 *    這是刻意的保守防線，避免失敗重試造成暴衝。
 * 7. 額度以 Google Maps 官方計費週期概念為基準，
 *    使用 America/Los_Angeles 判定月份。
 * 8. 目前總管內部硬上限：
 *
 *       1,000 Usage Units / 月
 *
 *    這不是 Google 官方免費額度。
 *    它只是總管自己的安全上限。
 *
 * =========================================================
 */

import fs from 'node:fs';
import path from 'node:path';


/**
 * =========================================================
 * 設定
 * =========================================================
 */

const MAX_MONTHLY_USAGE_UNITS =
  1000;

/**
 * Google Maps Platform 計費月份以 Pacific Time 為基準。
 *
 * 這裡使用 IANA timezone：
 *
 * America/Los_Angeles
 */
const BILLING_TIME_ZONE =
  'America/Los_Angeles';


/**
 * 額度資料保存位置。
 *
 * 不放進 src/
 * 不放進 location-state.ts
 * 不與 Location Record 混合。
 *
 * 執行時會建立：
 *
 * data/
 *   location/
 *     google-usage.json
 */
const USAGE_FILE =
  path.join(
    process.cwd(),
    'data',
    'location',
    'google-usage.json',
  );


/**
 * =========================================================
 * Types
 * =========================================================
 */

export type LocationQuotaSource =
  | 'routes'
  | 'route-matrix'
  | 'places'
  | 'place-details'
  | 'geocoding'
  | 'other';


export interface LocationQuotaSnapshot {
  billingMonth: string;

  usedUnits: number;

  remainingUnits: number;

  monthlyLimit: number;

  exhausted: boolean;

  updatedAt: string;
}


interface LocationQuotaState {
  billingMonth: string;

  usedUnits: number;

  updatedAt: string;
}


/**
 * =========================================================
 * 工具：取得 Google Billing Month
 * =========================================================
 *
 * 例如：
 *
 * 2026-08
 *
 * 使用 America/Los_Angeles，而不是台灣時間，
 * 讓內部月份切換盡量與 Google 的計費月份一致。
 */
function getBillingMonth(
  date: Date = new Date(),
): string {

  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          BILLING_TIME_ZONE,

        year:
          'numeric',

        month:
          '2-digit',
      },
    );

  const parts =
    formatter.formatToParts(
      date,
    );

  let year =
    '';

  let month =
    '';

  for (
    const part of parts
  ) {

    if (
      part.type === 'year'
    ) {
      year =
        part.value;
    }

    if (
      part.type === 'month'
    ) {
      month =
        part.value;
    }
  }

  return `${year}-${month}`;
}


/**
 * =========================================================
 * 工具：確保資料夾存在
 * =========================================================
 */
function ensureUsageDirectory(): void {

  const directory =
    path.dirname(
      USAGE_FILE,
    );

  if (
    !fs.existsSync(
      directory,
    )
  ) {

    fs.mkdirSync(
      directory,
      {
        recursive:
          true,
      },
    );
  }
}


/**
 * =========================================================
 * 工具：建立空白狀態
 * =========================================================
 */
function createEmptyState(
  billingMonth:
    string,
): LocationQuotaState {

  return {
    billingMonth,

    usedUnits:
      0,

    updatedAt:
      new Date().toISOString(),
  };
}


/**
 * =========================================================
 * 讀取狀態
 * =========================================================
 *
 * 如果：
 *
 * - 檔案不存在
 * - JSON 損壞
 * - 欄位不合法
 *
 * 都採保守方式重新建立目前月份的狀態。
 *
 * 這個模組不能因為額度檔損壞而讓整個 LINE Bot 啟動失敗。
 */
function readState(): LocationQuotaState {

  const currentMonth =
    getBillingMonth();

  ensureUsageDirectory();

  if (
    !fs.existsSync(
      USAGE_FILE,
    )
  ) {

    return createEmptyState(
      currentMonth,
    );
  }

  try {

    const raw =
      fs.readFileSync(
        USAGE_FILE,
        'utf-8',
      );

    const parsed =
      JSON.parse(
        raw,
      ) as Partial<LocationQuotaState>;

    if (
      typeof parsed.billingMonth !==
      'string'
    ) {

      return createEmptyState(
        currentMonth,
      );
    }

    if (
      typeof parsed.usedUnits !==
      'number'
    ) {

      return createEmptyState(
        currentMonth,
      );
    }

    if (
      !Number.isFinite(
        parsed.usedUnits,
      )
    ) {

      return createEmptyState(
        currentMonth,
      );
    }

    const usedUnits =
      Math.max(
        0,
        Math.floor(
          parsed.usedUnits,
        ),
      );

    /**
     * 換月：
     *
     * Google 新計費月份開始時，
     * 總管自己的月度安全額度也歸零。
     */
    if (
      parsed.billingMonth !==
      currentMonth
    ) {

      return createEmptyState(
        currentMonth,
      );
    }

    return {
      billingMonth:
        parsed.billingMonth,

      usedUnits,

      updatedAt:
        typeof parsed.updatedAt ===
        'string'
          ? parsed.updatedAt
          : new Date().toISOString(),
    };

  } catch (
    error
  ) {

    console.error(
      '[Location Quota] 讀取額度狀態失敗，重新建立目前月份狀態:',
      error,
    );

    return createEmptyState(
      currentMonth,
    );
  }
}


/**
 * =========================================================
 * 保存狀態
 * =========================================================
 */
function writeState(
  state:
    LocationQuotaState,
): void {

  ensureUsageDirectory();

  const tempFile =
    `${USAGE_FILE}.tmp`;

  const content =
    JSON.stringify(
      state,
      null,
      2,
    );

  /**
   * 先寫 temporary file，
   * 再 rename。
   *
   * 避免程式在直接覆寫 JSON 時突然中斷，
   * 留下一個半截 JSON。
   */
  fs.writeFileSync(
    tempFile,
    content,
    'utf-8',
  );

  fs.renameSync(
    tempFile,
    USAGE_FILE,
  );
}


/**
 * =========================================================
 * 驗證 Usage Units
 * =========================================================
 */
function normalizeUnits(
  units:
    number,
): number {

  if (
    !Number.isFinite(
      units,
    )
  ) {

    return 0;
  }

  return Math.floor(
    units,
  );
}


/**
 * =========================================================
 * 預約 Usage Units
 * =========================================================
 *
 * 這是未來所有 Google Location API 的主要入口。
 *
 * 例如：
 *
 * const reservation =
 *   reserveLocationQuota(
 *     1,
 *     'routes',
 *   );
 *
 * if (!reservation.allowed) {
 *   // 不得呼叫 Google
 * }
 *
 * reserve 成功後立即寫入 usedUnits。
 *
 * 因為 Node.js 的同步檔案操作會在同一個 event loop
 * 執行期間完成，所以不會出現兩個同步 request
 * 同時讀到同一個舊 count 再一起通過的問題。
 */
export function reserveLocationQuota(
  units:
    number,
  source:
    LocationQuotaSource,
): {
  allowed: boolean;

  usedUnits: number;

  remainingUnits: number;

  monthlyLimit: number;

  source: LocationQuotaSource;

  reason?:
    | 'invalid-units'
    | 'monthly-limit';
} {

  const normalizedUnits =
    normalizeUnits(
      units,
    );

  if (
    normalizedUnits <=
    0
  ) {

    const snapshot =
      getLocationQuotaSnapshot();

    return {
      allowed:
        false,

      usedUnits:
        snapshot.usedUnits,

      remainingUnits:
        snapshot.remainingUnits,

      monthlyLimit:
        snapshot.monthlyLimit,

      source,

      reason:
        'invalid-units',
    };
  }

  const state =
    readState();

  const remaining =
    Math.max(
      0,
      MAX_MONTHLY_USAGE_UNITS -
        state.usedUnits,
    );

  /**
   * 超過總管自己的硬上限：
   *
   * 絕對不呼叫 Google。
   */
  if (
    normalizedUnits >
    remaining
  ) {

    console.warn(
      '[Location Quota] 內部月額度已不足，阻止 Google API request:',
      {
        source,
        requestedUnits:
          normalizedUnits,
        usedUnits:
          state.usedUnits,
        remainingUnits:
          remaining,
        monthlyLimit:
          MAX_MONTHLY_USAGE_UNITS,
      },
    );

    return {
      allowed:
        false,

      usedUnits:
        state.usedUnits,

      remainingUnits:
        remaining,

      monthlyLimit:
        MAX_MONTHLY_USAGE_UNITS,

      source,

      reason:
        'monthly-limit',
    };
  }

  /**
   * 預約即記帳。
   *
   * 不等 Google 成功才記。
   *
   * 這是安全防線，不是 Google 官方用量統計。
   */
  state.usedUnits +=
    normalizedUnits;

  state.updatedAt =
    new Date().toISOString();

  writeState(
    state,
  );

  const newRemaining =
    Math.max(
      0,
      MAX_MONTHLY_USAGE_UNITS -
        state.usedUnits,
    );

  console.log(
    '[Location Quota] Usage reserved:',
    {
      source,
      units:
        normalizedUnits,
      usedUnits:
        state.usedUnits,
      remainingUnits:
        newRemaining,
    },
  );

  return {
    allowed:
      true,

    usedUnits:
      state.usedUnits,

    remainingUnits:
      newRemaining,

    monthlyLimit:
      MAX_MONTHLY_USAGE_UNITS,

    source,
  };
}


/**
 * =========================================================
 * 取得目前額度快照
 * =========================================================
 */
export function getLocationQuotaSnapshot():
  LocationQuotaSnapshot {

  const state =
    readState();

  const remaining =
    Math.max(
      0,
      MAX_MONTHLY_USAGE_UNITS -
        state.usedUnits,
    );

  return {
    billingMonth:
      state.billingMonth,

    usedUnits:
      state.usedUnits,

    remainingUnits:
      remaining,

    monthlyLimit:
      MAX_MONTHLY_USAGE_UNITS,

    exhausted:
      remaining <= 0,

    updatedAt:
      state.updatedAt,
  };
}


/**
 * =========================================================
 * 是否還可以使用指定 Units
 * =========================================================
 *
 * 注意：
 *
 * 這個函數只是檢查。
 * 真正要發送 Google request 時，
 * 必須使用 reserveLocationQuota()。
 *
 * 不可以：
 *
 * if (canUseLocationQuota(1)) {
 *   // ...過很久才 call...
 * }
 *
 * 而應該：
 *
 * const reservation =
 *   reserveLocationQuota(1, 'routes');
 *
 * if (!reservation.allowed) {
 *   return;
 * }
 */
export function canUseLocationQuota(
  units:
    number = 1,
): boolean {

  const normalizedUnits =
    normalizeUnits(
      units,
    );

  if (
    normalizedUnits <=
    0
  ) {

    return false;
  }

  const snapshot =
    getLocationQuotaSnapshot();

  return (
    normalizedUnits <=
    snapshot.remainingUnits
  );
}


/**
 * =========================================================
 * 取得剩餘 Units
 * =========================================================
 */
export function getLocationQuotaRemaining():
  number {

  return getLocationQuotaSnapshot()
    .remainingUnits;
}


/**
 * =========================================================
 * 取得已使用 Units
 * =========================================================
 */
export function getLocationQuotaUsed():
  number {

  return getLocationQuotaSnapshot()
    .usedUnits;
}


/**
 * =========================================================
 * 是否已達硬上限
 * =========================================================
 */
export function isLocationQuotaExhausted():
  boolean {

  return getLocationQuotaSnapshot()
    .exhausted;
}


/**
 * =========================================================
 * 測試／診斷用：重設目前月份
 * =========================================================
 *
 * 正式程式不要呼叫。
 *
 * 保留這個 API 是為了未來建立：
 *
 * location-quota-test.ts
 *
 * 時可以不碰 production logic。
 *
 * 目前不從 index.ts 匯入。
 */
export function resetLocationQuotaForTesting():
  void {

  const state =
    createEmptyState(
      getBillingMonth(),
    );

  writeState(
    state,
  );

  console.warn(
    '[Location Quota] 已重設目前月份測試額度。',
  );
}


/**
 * =========================================================
 * 目前硬上限
 * =========================================================
 *
 * 其他模組如果需要顯示設定值，
 * 不應自己寫死 1000。
 */
export function getLocationQuotaLimit():
  number {

  return MAX_MONTHLY_USAGE_UNITS;
}