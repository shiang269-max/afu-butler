/**
 * =========================================================
 * Location State
 * =========================================================
 *
 * 儲存每位家人最近一次透過 LINE 提供的位置。
 *
 * 職責：
 * - 依 userId 儲存最新 LocationRecord
 * - 依 userId 取得最新 LocationRecord
 * - 依 userId 清除最新 LocationRecord
 *
 * 不負責：
 * - LINE Webhook
 * - Google API
 * - Places / Routes
 * - AI
 * - Reply / Push
 *
 * =========================================================
 */

import {
  LocationRecord,
} from './location-types';


const latestLocations =
  new Map<string, LocationRecord>();


/**
 * =========================================================
 * 設定最新位置
 * =========================================================
 */

export function setLatestLocation(
  location: LocationRecord,
): void {

  latestLocations.set(
    location.userId,
    location,
  );
}


/**
 * =========================================================
 * 取得最新位置
 * =========================================================
 */

export function getLatestLocation(
  userId: string,
): LocationRecord | undefined {

  return latestLocations.get(
    userId,
  );
}


/**
 * =========================================================
 * 清除最新位置
 * =========================================================
 *
 * 回傳：
 * - true  = 原本有位置並成功刪除
 * - false = 原本沒有位置
 *
 * =========================================================
 */

export function clearLatestLocation(
  userId: string,
): boolean {

  if (
    !userId ||
    !userId.trim()
  ) {
    return false;
  }

  return latestLocations.delete(
    userId,
  );
}