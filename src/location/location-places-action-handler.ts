/**
 * =========================================================
 * Location Places Action Handler
 * =========================================================
 *
 * 負責把 Location Intent 的附近搜尋 Action
 * 接到 Google Places Service。
 *
 * 支援：
 *
 *   SEARCH_NEAR_CURRENT
 *       ↓
 *   目前 LINE Location
 *
 *   SEARCH_NEAR_HOME
 *       ↓
 *   固定 Home Location
 *
 * =========================================================
 *
 * 本模組負責：
 *
 * 1. 接收 Location Intent Action
 * 2. 取得對應 LocationRecord
 * 3. 將座標交給 Google Places Service
 * 4. 回傳標準化搜尋結果
 * 5. Google Places 失敗時安全停止
 *
 * 本模組不負責：
 *
 * - LINE Webhook
 * - LINE replyMessage
 * - Gemini
 * - Memory
 * - Location Intent 判斷
 * - Location Resolver 判斷
 * - Routes
 * - 最終推薦文案
 *
 * =========================================================
 */

import {
  getLatestLocation,
} from './location-state';

import {
  resolveLocationReference,
} from './location-resolver';

import {
  searchNearbyPlaces,
  GooglePlaceResult,
  GooglePlacesSearchOptions,
} from './google-places-service';

import {
  LocationRecord,
} from './location-types';


/**
 * =========================================================
 * Public Types
 * =========================================================
 */

export type LocationPlacesAction =
  | 'SEARCH_NEAR_CURRENT'
  | 'SEARCH_NEAR_HOME';


export interface LocationPlacesActionRequest {
  action: LocationPlacesAction;

  message: string;

  userId: string;

  radiusMeters?: number;

  maxResults?: number;

  type?:
    | 'restaurant'
    | 'cafe'
    | 'food'
    | 'store';
}


export interface LocationPlacesActionResult {
  handled: boolean;

  success: boolean;

  action?: LocationPlacesAction;

  reason?: string;

  location?: LocationRecord;

  places?: GooglePlaceResult[];

  searchOptions?: GooglePlacesSearchOptions;
}


/**
 * =========================================================
 * Action Validation
 * =========================================================
 */

function isSupportedAction(
  action: unknown,
): action is LocationPlacesAction {

  return (
    action ===
      'SEARCH_NEAR_CURRENT' ||
    action ===
      'SEARCH_NEAR_HOME'
  );
}


/**
 * =========================================================
 * Search Options
 * =========================================================
 */

function buildSearchOptions(
  request:
    LocationPlacesActionRequest,
):
  GooglePlacesSearchOptions {

  const options:
    GooglePlacesSearchOptions = {};


  if (
    request.radiusMeters !==
    undefined
  ) {

    options.radiusMeters =
      request.radiusMeters;
  }


  if (
    request.maxResults !==
    undefined
  ) {

    options.maxResults =
      request.maxResults;
  }


  if (
    request.type !==
    undefined
  ) {

    options.type =
      request.type;
  }


  return options;
}


/**
 * =========================================================
 * Resolve Current Location
 * =========================================================
 */

function resolveCurrentLocation(
  userId: string,
):
  LocationRecord |
  undefined {

  if (
    !userId.trim()
  ) {

    return undefined;
  }


  return getLatestLocation(
    userId,
  );
}


/**
 * =========================================================
 * Resolve Home Location
 * =========================================================
 */

function resolveHomeLocation(
  message: string,
  userId: string,
):
  LocationRecord |
  undefined {

  if (
    !userId.trim()
  ) {

    return undefined;
  }


  const resolution =
    resolveLocationReference(
      message,
      userId,
    );


  if (
    !resolution.resolved
  ) {

    return undefined;
  }


  if (
    !resolution.location
  ) {

    return undefined;
  }


  return resolution.location;
}


/**
 * =========================================================
 * Main Action Handler
 * =========================================================
 */

export async function handleLocationPlacesAction(
  request:
    LocationPlacesActionRequest,
):
  Promise<LocationPlacesActionResult> {

  /*
   * ---------------------------------------------------------
   * 1. Action 驗證
   * ---------------------------------------------------------
   */

  if (
    !isSupportedAction(
      request.action,
    )
  ) {

    return {
      handled: false,

      success: false,

      reason:
        'unsupported-location-places-action',
    };
  }


  /*
   * ---------------------------------------------------------
   * 2. userId 驗證
   * ---------------------------------------------------------
   */

  const userId =
    typeof request.userId === 'string'
      ? request.userId.trim()
      : '';


  if (
    !userId
  ) {

    return {
      handled: true,

      success: false,

      action:
        request.action,

      reason:
        'invalid-user-id',
    };
  }


  /*
   * ---------------------------------------------------------
   * 3. 搜尋選項
   * ---------------------------------------------------------
   */

  const searchOptions =
    buildSearchOptions(
      request,
    );


  /*
   * ---------------------------------------------------------
   * 4. 取得搜尋中心
   * ---------------------------------------------------------
   */

  let location:
    LocationRecord |
    undefined;


  if (
    request.action ===
    'SEARCH_NEAR_CURRENT'
  ) {

    location =
      resolveCurrentLocation(
        userId,
      );

  } else {

    location =
      resolveHomeLocation(
        request.message,
        userId,
      );
  }


  /*
   * ---------------------------------------------------------
   * 5. 沒有明確位置不得執行
   * ---------------------------------------------------------
   */

  if (
    !location
  ) {

    return {
      handled: true,

      success: false,

      action:
        request.action,

      reason:
        request.action ===
        'SEARCH_NEAR_CURRENT'
          ? 'current-location-unknown'
          : 'home-location-unknown',

      searchOptions,
    };
  }


  /*
   * ---------------------------------------------------------
   * 6. 建立 Places 座標
   * ---------------------------------------------------------
   */

  const coordinate = {

    latitude:
      location.latitude,

    longitude:
      location.longitude,
  };


  /*
   * ---------------------------------------------------------
   * 7. Google Places
   * ---------------------------------------------------------
   */

  const placesResult =
    await searchNearbyPlaces(
      coordinate,
      searchOptions,
    );


  /*
   * ---------------------------------------------------------
   * 8. Google Places 失敗
   * ---------------------------------------------------------
   *
   * 不建立假店家。
   *
   * ---------------------------------------------------------
   */

  if (
    !placesResult.ok
  ) {

    return {
      handled: true,

      success: false,

      action:
        request.action,

      reason:
        placesResult.error.code,

      location,

      searchOptions,
    };
  }


  /*
   * ---------------------------------------------------------
   * 9. 成功
   * ---------------------------------------------------------
   */

  return {
    handled: true,

    success: true,

    action:
      request.action,

    location,

    places:
      placesResult.places,

    searchOptions,
  };
}