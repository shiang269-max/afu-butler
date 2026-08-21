/**
 * =========================================================
 * Location State
 * =========================================================
 *
 * 儲存每位家庭成員最近一次由 LINE 主動分享的位置。
 *
 * 注意：
 * 目前這是「執行期間記憶體狀態」。
 *
 * 尚未接 Firebase / Database，也尚未設定 TTL。
 * 因此：
 * - Node.js 重啟後資料會消失
 * - 不把這裡的資料視為永久位置
 * - 後續位置功能正式化時，再獨立處理持久化與有效期限
 *
 * 這樣先把位置輸入鏈與既有 Memory / Reminder 解耦。
 * =========================================================
 */

import {
  LocationRecord,
} from './location-types';

const latestLocations =
  new Map<string, LocationRecord>();

export function setLatestLocation(
  location: LocationRecord,
): void {

  latestLocations.set(
    location.userId,
    location,
  );
}

export function getLatestLocation(
  userId: string | undefined,
): LocationRecord | undefined {

  if (
    !userId ||
    !userId.trim()
  ) {
    return undefined;
  }

  return latestLocations.get(
    userId,
  );
}

export function clearLatestLocation(
  userId: string,
): boolean {

  return latestLocations.delete(
    userId,
  );
}