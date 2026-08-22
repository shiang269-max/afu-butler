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
 * 原則：
 *
 * - 可以直接確認的搜尋條件才搜尋。
 * - 可以辨識的具體料理，保留成 Google Text Search query。
 * - 無法可靠理解使用者指定目標時，不得偷偷退回一般
 *   restaurant 搜尋。
 *
 * =========================================================
 */

interface SearchIntent {
  recognized:
    boolean;

  type?:
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


/**
 * =========================================================
 * Generic Search Target
 * =========================================================
 *
 * 移除位置搜尋語句、詢問語氣與泛用詞，
 * 嘗試留下使用者真正指定的具體搜尋目標。
 *
 * 例如：
 *
 * 「附近有甚麼烤雞可以吃」
 *      ↓
 * 「烤雞」
 *
 * 「附近有沒有鹽水雞」
 *      ↓
 * 「鹽水雞」
 *
 * =========================================================
 */

function extractSpecificSearchTarget(
  message: string,
): string |
  undefined {

  let text =
    normalizeSearchMessage(
      message,
    );


  text =
    text
      .replace(
        /我家附近|家附近|附近|周邊|周边|這附近|这附近/g,
        ' ',
      )
      .replace(
        /有什麼|有什么|有甚麼|有沒有|有没有/g,
        ' ',
      )
      .replace(
        /哪裡|哪里|哪間|哪家|什麼地方|什么地方/g,
        ' ',
      )
      .replace(
        /可以吃|能吃|可吃|吃的|吃嗎|吃吗/g,
        ' ',
      )
      .replace(
        /可以喝|能喝|可喝|喝的|喝嗎|喝吗/g,
        ' ',
      )
      .replace(
        /幫我找|帮我找|找一下|找找看|推薦|推荐/g,
        ' ',
      )
      .replace(
        /最近的|離我最近|离我最近|離你最近|离你最近/g,
        ' ',
      )
      .replace(
        /請問|请问|一下|呢|嗎|吗/g,
        ' ',
      )
      .replace(
        /餐廳|餐厅|店家|店|地方/g,
        ' ',
      )
      .replace(
        /好吃的|美食/g,
        ' ',
      )
      .replace(
        /想吃|要吃|想找|要找/g,
        ' ',
      )
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();


  if (
    !text
  ) {

    return undefined;
  }


  /*
   * 移除明顯不是搜尋目標的泛用詞。
   */

  if (
    /^(吃飯|吃饭|吃什麼|吃什么|吃|喝|餐飲|餐饮|美食)$/.test(
      text,
    )
  ) {

    return undefined;
  }


  /*
   * 避免把過長整句誤當成搜尋 query。
   */

  if (
    text.length >
    20
  ) {

    return undefined;
  }


  return text;
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
      recognized:
        true,

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
      recognized:
        true,

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
      recognized:
        true,

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
      recognized:
        true,

      type:
        'gas_station',
    };
  }


  /*
   * ---------------------------------------------------------
   * 火鍋
   * ---------------------------------------------------------
   */

  if (
    /火鍋|火锅|涮涮鍋|涮涮锅|shabu/i.test(
      text,
    )
  ) {

    return {
      recognized:
        true,

      type:
        'restaurant',

      query:
        '火鍋',
    };
  }


  /*
   * ---------------------------------------------------------
   * 其他已知餐飲關鍵字
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
      recognized:
        true,

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
   *
   * 只有真正的泛用需求，
   * 才搜尋一般 restaurant。
   *
   * 例如：
   *
   * 「附近有什麼好吃的」
   * 「附近餐廳」
   * 「想找吃飯的地方」
   *
   * 若句子中包含無法辨識的具體目標，
   * 不能偷偷降級成一般餐廳搜尋。
   * ---------------------------------------------------------
   */

  const specificTarget =
    extractSpecificSearchTarget(
      text,
    );


  if (
    specificTarget
  ) {

    return {
      recognized:
        true,

      type:
        'restaurant',

      query:
        specificTarget,
    };
  }


  if (
    /餐廳|餐厅|吃飯|吃饭|吃什麼|吃什么|好吃|美食/.test(
      text,
    )
  ) {

    return {
      recognized:
        true,

      type:
        'restaurant',
    };
  }


  return {
    recognized:
      false,
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

  searchIntent:
    SearchIntent,
):
  GooglePlacesSearchOptions {

  if (
    !searchIntent.type
  ) {

    throw new Error(
      'Cannot build search options for unrecognized search intent.',
    );
  }


  const options:
    GooglePlacesSearchOptions = {

    type:
      searchIntent.type,

    rankByDistance:
      true,

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


  const searchIntent =
    resolveSearchIntent(
      request.message,
      request.type,
    );


  /*
   * 無法可靠理解搜尋目標時，
   * 不進 Google Places。
   *
   * 讓上層依照 reason 明確告知使用者，
   * 而不是假裝理解後亂推薦。
   */

  if (
    !searchIntent.recognized
  ) {

    return {
      handled: true,

      success: false,

      action:
        request.action,

      reason:
        'unrecognized-search-target',
    };
  }


  const searchOptions =
    buildSearchOptions(
      request,
      searchIntent,
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