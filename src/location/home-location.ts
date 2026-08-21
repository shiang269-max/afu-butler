/**
 * =========================================================
 * Home Location
 * =========================================================
 *
 * 固定「家」的位置。
 *
 * 職責：
 * - 儲存固定家位置
 * - 取得固定家位置
 * - 判斷是否已設定
 * - 更新固定家位置
 * - 清除固定家位置
 *
 * 不負責：
 * - LINE Webhook
 * - LINE Location Message
 * - Google API
 * - Places / Routes
 * - Geocoding
 * - Gemini / AI
 * - Location Quota
 *
 * =========================================================
 */

import {
  LocationRecord,
} from './location-types';


/**
 * =========================================================
 * Internal State
 * =========================================================
 *
 * 第一階段先使用 Node.js 記憶體保存。
 *
 * 後續若需要持久化：
 *
 * - Firebase
 * - Database
 * - File
 *
 * 可以在不改變對外介面的情況下替換。
 *
 * =========================================================
 */

let homeLocation:
  LocationRecord | undefined;


/**
 * =========================================================
 * Set Home Location
 * =========================================================
 */

export function setHomeLocation(
  location: LocationRecord,
): void {

  homeLocation = {
    ...location,

    sourceType:
      'user',

    sourceGroupId:
      undefined,

    updatedAt:
      new Date().toISOString(),
  };
}


/**
 * =========================================================
 * Get Home Location
 * =========================================================
 */

export function getHomeLocation():
  LocationRecord | undefined {

  if (
    !homeLocation
  ) {
    return undefined;
  }

  return {
    ...homeLocation,
  };
}


/**
 * =========================================================
 * Has Home Location
 * =========================================================
 */

export function hasHomeLocation():
  boolean {

  return (
    homeLocation !== undefined
  );
}


/**
 * =========================================================
 * Clear Home Location
 * =========================================================
 */

export function clearHomeLocation():
  boolean {

  if (
    !homeLocation
  ) {
    return false;
  }

  homeLocation =
    undefined;

  return true;
}