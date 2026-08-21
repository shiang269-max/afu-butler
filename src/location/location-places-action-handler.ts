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
 * 3. 從使用者原句解析可明確判斷的搜尋條件
 * 4. 將座標與搜尋條件交給 Google Places Service
 * 5. 回傳標準化搜尋結果
 * 6. Google Places 失敗時安全停止
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
  GooglePlacesSearchType,
} from './google-places-service';

import {
  LocationRecord,
} from './location-types';


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
    GooglePlacesSearchType;
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
 * Search Intent
 * =========================================================
 *
 * 不呼叫 Gemini。
 *
 * 只有「可以直接從使用者文字確認」的搜尋條件
 * 才轉成 query / type。
 *
 * =========================================================
 */

interface SearchIntent {
  type:
    GooglePlacesSearchType;

  query?:
    string;
}


function normalizeSearchMessage(
  message: string,
): string {

  return (
    typeof message === 'string'
      ? message
          .replace(/大內總管/g, '')
          .replace(/總管/g, '')
          .replace(/內內/g, '')
          .replace(/喳子/g, '')
          .replace(/渣子/g, '')
          .replace(/[，。！？、,.!?]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : ''
  );
}


function resolveSearchIntent(
  message: string,

  explicitType:
    | GooglePlacesSearchType
    | undefined,
):
  SearchIntent {

  if (
    explicitType
  ) {

    return {
      type:
        explicitType,
    };
  }


  const text =
    normalizeSearchMessage(
      message,
    );


  /*
   * ---------------------------------------------------------
   * 咖啡廳
   * ---------------------------------------------------------
   */

  if (
    /咖啡廳|咖啡店|咖啡館|咖啡馆|coffee/i.test(
      text,
    )
  ) {

    return {
      type:
        'cafe',
    };
  }


  /*
   * ---------------------------------------------------------
   * 便利商店
   * ---------------------------------------------------------
   */

  if (
    /便利商店|便利店|超商|7[- ]?11|seven[- ]?eleven|全家/.test(
      text,
    )
  ) {

    return {
      type:
        'convenience_store',
    };
  }


  /*
   * ---------------------------------------------------------
   * 加油站
   * ---------------------------------------------------------
   *
   * 「加氣站」不當成「加油站」，
   * 避免兩者混在一起。
   * ---------------------------------------------------------
   */

  if (
    /加油站|油站/.test(
      text,
    )
  ) {

    return {
      type:
        'gas_station',
    };
  }


  /*
   * ---------------------------------------------------------
   * 火鍋
   * ---------------------------------------------------------
   *
   * 「火鍋」與「火鍋店」都會命中。
   *
   * 不只搜尋 restaurant，
   * 而是：
   *
   * type  = restaurant
   * query = 火鍋
   *
   * 讓 Google Places Text Search 真正搜尋
   * 「火鍋」這個使用者要求的內容。
   * ---------------------------------------------------------
   */

  if (
    /火鍋|火锅|涮涮鍋|涮涮锅|shabu/i.test(
      text,
    )
  ) {

    return {
      type:
        'restaurant',

      query:
        '火鍋',
    };
  }


  /*
   * ---------------------------------------------------------
   * 其他明確餐飲關鍵字
   * ---------------------------------------------------------
   */

  const foodKeywords = [
    '拉麵',
    '拉面',
    '牛肉麵',
    '牛肉面',
    '麵店',
    '面店',
    '燒肉',
    '烧肉',
    '漢堡',
    '汉堡',
    '披薩',
    '披萨',
    '義大利麵',
    '意大利面',
    '壽司',
    '寿司',
    '居酒屋',
    '早餐',
    '早午餐',
    '甜點',
    '甜点',
  ];


  const matchedFood =
    foodKeywords.find(
      (keyword) =>
        text.includes(
          keyword,
        ),
    );


  if (
    matchedFood
  ) {

    return {
      type:
        'restaurant',

      query:
        matchedFood,
    };
  }


  /*
   * ---------------------------------------------------------
   * 一般餐飲需求
   * ---------------------------------------------------------
   */

  if (
    /餐廳|餐厅|吃飯|吃饭|吃什麼|吃什么|好吃|美食/.test(
      text,
    )
  ) {

    return {
      type:
        'restaurant',
    };
  }


  /*
   * 沒有更具體條件時，維持原本 restaurant 預設。
   */

  return {
    type:
      'restaurant',
  };
}


function isNearestSearch(
  message: string,
): boolean {

  const text =
    normalizeSearchMessage(
      message,
    );

  return (
    /離我最近|离我最近|離你最近|离你最近|最近的/.test(
      text,
    )
  );
}


function buildSearchOptions(
  request:
    LocationPlacesActionRequest,
):
  GooglePlacesSearchOptions {

  const searchIntent =
    resolveSearchIntent(
      request.message,
      request.type,
    );


  const options:
    GooglePlacesSearchOptions = {

    type:
      searchIntent.type,

    rankByDistance:
      true,

    /*
     * 「離我最近」不是一般附近搜尋。
     * 這裡直接限制為第一名，避免便利商店、加油站
     * 等高密度 POI 因距離很接近而一次列出多家。
     */
    maxResults:
      isNearestSearch(
        request.message,
      )
        ? 1
        : 5,
  };


  if (
    searchIntent.query
  ) {

    options.query =
      searchIntent.query;
  }


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


  return options;
}


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


export async function handleLocationPlacesAction(
  request:
    LocationPlacesActionRequest,
):
  Promise<LocationPlacesActionResult> {

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


  const searchOptions =
    buildSearchOptions(
      request,
    );


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


  const coordinate = {

    latitude:
      location.latitude,

    longitude:
      location.longitude,
  };


  const placesResult =
    await searchNearbyPlaces(
      coordinate,
      searchOptions,
    );


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