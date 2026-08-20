import { messagingApi } from '@line/bot-sdk';


/*
 * =========================================================
 * LINE 額度管理
 * =========================================================
 *
 * LINE 官方：
 *
 * GET /v2/bot/message/quota
 *   → 當月目標發送上限
 *
 * GET /v2/bot/message/quota/consumption
 *   → 當月已使用量（概算值）
 *
 * Reply 不計入月額度。
 * Push / Multicast / Broadcast / Narrowcast 計入。
 *
 * 本模組只負責：
 * - 查詢
 * - 計算剩餘
 * - 判斷是否允許 Push
 *
 * 不負責實際發送。
 * =========================================================
 */


export type PushPurpose =
  | 'reminder'
  | 'non-essential';


export interface LineQuotaSnapshot {

  /*
   * API 回傳的月上限。
   *
   * null = LINE 沒有提供 target limit。
   */
  limit: number | null;

  /*
   * LINE API 回傳的當月使用量。
   *
   * 官方說明此值為概算值。
   */
  used: number;

  /*
   * 可推估剩餘量。
   *
   * null = 無法可靠計算。
   */
  remaining: number | null;

  /*
   * none / limited。
   */
  limitType:
    | 'none'
    | 'limited';

  checkedAt:
    string;

  source:
    'line-api';
}


/*
 * =========================================================
 * 短暫快取
 * =========================================================
 *
 * 額度是概算值，沒有必要在同一個 Scheduler tick
 * 重複打 API。
 *
 * 5 秒快取只降低 API 查詢頻率，
 * 不改變真正 Push 的結果。
 * =========================================================
 */

let quotaCache:
  {
    snapshot: LineQuotaSnapshot;
    expiresAt: number;
  } | null = null;


const QUOTA_CACHE_MS =
  5 * 1000;


/*
 * =========================================================
 * 查詢 LINE 額度
 * =========================================================
 */

export async function getQuotaSnapshot(
  lineClient:
    messagingApi.MessagingApiClient,
): Promise<LineQuotaSnapshot> {

  const now =
    Date.now();

  if (
    quotaCache &&
    quotaCache.expiresAt > now
  ) {
    return quotaCache.snapshot;
  }

  const [
    quota,
    consumption,
  ] = await Promise.all([
    lineClient.getMessageQuota(),
    lineClient.getMessageQuotaConsumption(),
  ]);

  const limit =
    quota.type === 'limited' &&
    typeof quota.value === 'number'
      ? quota.value
      : null;

  const used =
    typeof consumption.totalUsage === 'number'
      ? consumption.totalUsage
      : 0;

  const remaining =
    limit === null
      ? null
      : Math.max(
          0,
          limit - used,
        );

  const snapshot: LineQuotaSnapshot = {
    limit,
    used,
    remaining,
    limitType:
      quota.type === 'limited'
        ? 'limited'
        : 'none',
    checkedAt:
      new Date().toISOString(),
    source:
      'line-api',
  };

  quotaCache = {
    snapshot,
    expiresAt:
      now + QUOTA_CACHE_MS,
  };

  return snapshot;
}


/*
 * =========================================================
 * 判斷是否允許 Push
 * =========================================================
 *
 * 規則：
 *
 * remaining >= 50
 *   → 正常
 *
 * 20 <= remaining < 50
 *   → 非必要主動訊息禁止
 *
 * 0 < remaining < 20
 *   → 只保留 Reminder
 *
 * remaining === 0
 *   → 所有 Push 阻斷
 *
 * Reminder：
 *   → 只要 remaining > 0 就允許。
 *
 * 注意：
 * LINE consumption 是概算值，
 * 因此這不是「保證剩餘 N 則」，
 * 而是保守的風險控制值。
 * =========================================================
 */

export function canSendPush(
  snapshot:
    LineQuotaSnapshot,
  purpose:
    PushPurpose,
): boolean {

  /*
   * 沒有可靠上限時，
   * 不自動把 null 當成 0。
   *
   * 這種情況讓非必要 Push 停止，
   * Reminder 仍可嘗試。
   */
  if (
    snapshot.remaining === null
  ) {

    return (
      purpose === 'reminder'
    );
  }

  if (
    snapshot.remaining <= 0
  ) {

    return false;
  }

  if (
    purpose === 'reminder'
  ) {

    return true;
  }

  /*
   * 非必要 Push：
   * 少於 50 一律阻止。
   */
  return (
    snapshot.remaining >= 50
  );
}


/*
 * =========================================================
 * 給總管使用的文字摘要
 * =========================================================
 */

export function formatQuotaSummary(
  snapshot:
    LineQuotaSnapshot,
): string {

  if (
    snapshot.remaining === null
  ) {

    return (
      `LINE 額度目前已使用約 ${snapshot.used} 則，` +
      '目前 API 沒有提供可直接計算的剩餘上限。'
    );
  }

  let level =
    '正常';

  if (
    snapshot.remaining <= 0
  ) {

    level =
      '全部 Push 已阻斷';

  } else if (
    snapshot.remaining < 20
  ) {

    level =
      '僅保留必要 Reminder';

  } else if (
    snapshot.remaining < 50
  ) {

    level =
      '限制非必要主動訊息';
  }

  return (
    `LINE 本月額度：${snapshot.limit ?? '未知'} 則，` +
    `目前已使用約 ${snapshot.used} 則，` +
    `推估剩餘約 ${snapshot.remaining} 則。` +
    `目前策略：${level}。`
  );
}