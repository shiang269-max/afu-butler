/**
 * =========================================================
 * Location Intent Handler
 * =========================================================
 *
 * 負責判斷使用者文字是否屬於「位置型需求」，
 * 並將需求安全分流到：
 *
 * 1. CURRENT_USER_LOCATION
 * 2. HOME
 * 3. ROUTE_HOME
 * 4. PLACE_SEARCH_NEAR_CURRENT
 * 5. PLACE_SEARCH_NEAR_HOME
 *
 * 本模組不負責：
 *
 * - LINE Webhook
 * - LINE replyMessage
 * - Gemini
 * - Google Places API
 * - Google Routes API
 * - Geocoding
 * - Location Quota
 *
 * 核心安全規則：
 *
 * 「不知道位置就不猜。」
 *
 * 如果需求需要目前位置，但目前沒有 LINE 定位：
 *   → clarificationRequired = true
 *
 * 如果需求需要固定家位置，但尚未設定：
 *   → clarificationRequired = true
 *
 * 已有明確 Location State 時：
 *   → 才允許進入下一層 Action。
 *
 * =========================================================
 */

import {
  resolveLocationReference,
} from './location-resolver';

import {
  cleanCallNames,
  hasCallName,
} from '../call-names';


/**
 * =========================================================
 * Public Types
 * =========================================================
 */

export type LocationIntentType =
  | 'CURRENT_LOCATION'
  | 'NEAR_CURRENT'
  | 'NEAR_HOME'
  | 'HOME_ROUTE'
  | 'UNKNOWN';


export interface LocationIntentResult {

  handled: boolean;

  intent:
    LocationIntentType;

  resolved: boolean;

  clarificationRequired: boolean;

  clarificationMessage?: string;

  locationResolution?:
    ReturnType<
      typeof resolveLocationReference
    >;

  /**
   * 後續 Action Layer 可以依此決定：
   *
   * CURRENT_LOCATION
   *   → 直接使用 Location State
   *
   * NEAR_CURRENT
   *   → Places API，以目前位置為中心
   *
   * NEAR_HOME
   *   → Places API，以固定家位置為中心
   *
   * HOME_ROUTE
   *   → 現有 Location Route Handler
   */
  action?:
    | 'RETURN_CURRENT_LOCATION'
    | 'SEARCH_NEAR_CURRENT'
    | 'SEARCH_NEAR_HOME'
    | 'CALCULATE_HOME_ROUTE';
}


/**
 * =========================================================
 * Text Normalization
 * =========================================================
 */

function normalizeText(
  message: string,
): string {

  return message
    .trim()
    .replace(/\s+/g, ' ');
}


/**
 * =========================================================
 * Location Session
 * =========================================================
 *
 * 「阿福 位置」會建立一次性的 Location Session。
 *
 * Session 規則：
 *
 * 1. 下一則文字訊息可以不帶呼叫詞。
 *
 * 2. 下一則文字訊息一進來就立即消耗 Session。
 *    不論該訊息是否符合位置需求，都不再保留狀態。
 *
 * 3. 1 分鐘內沒有下一則文字訊息，
 *    Session 自動結束。
 *
 * 這樣可以避免舊 Location Session 長時間攔截：
 *
 * - 附近有什麼
 * - 離我最近的 XX 在哪
 * - 一般聊天
 *
 * =========================================================
 */

const LOCATION_SESSION_TIMEOUT_MS =
  60 * 1000;


interface LocationSession {
  createdAt: number;
}


const locationSessions =
  new Map<
    string,
    LocationSession
  >();


function createLocationSession(
  userId: string,
): void {

  const key =
    userId.trim();

  if (!key) {
    return;
  }

  const session: LocationSession = {
    createdAt:
      Date.now(),
  };

  locationSessions.set(
    key,
    session,
  );

  setTimeout(
    () => {

      /*
       * 只有目前仍是同一個 Session
       * 才允許 Timeout 清除。
       *
       * 避免舊 Timer 誤刪除
       * 後來重新建立的新 Session。
       */
      if (
        locationSessions.get(
          key,
        ) === session
      ) {

        locationSessions.delete(
          key,
        );
      }
    },
    LOCATION_SESSION_TIMEOUT_MS,
  );
}


function consumeLocationSession(
  userId: string,
): boolean {

  const key =
    userId.trim();

  if (!key) {
    return false;
  }

  const session =
    locationSessions.get(
      key,
    );

  if (!session) {
    return false;
  }

  /*
   * 下一則文字訊息一進來，
   * 就先結束上一輪 Location Session。
   *
   * 因此這一輪無論是否為位置需求，
   * 都不會讓 Session 繼續殘留。
   */
  locationSessions.delete(
    key,
  );

  return true;
}


function isLocationSessionInvocation(
  text: string,
): boolean {

  return (
    text === '位置' ||
    text === '位置功能'
  );
}


/**
 * =========================================================
 * Invocation Gate
 * =========================================================
 *
 * 位置型功能屬於「指令功能」，
 * 必須先呼叫目前有效的總管呼叫詞才允許進入 Location Intent。
 *
 * 呼叫詞統一由：
 *
 * - hasCallName()
 * - cleanCallNames()
 *
 * 動態管理。
 *
 * 支援：
 *
 * - 阿福
 * - 目前 Active Style 專屬呼叫詞
 *
 * 沒有呼叫詞時，
 * 即使文字本身包含位置關鍵字，
 * 也一律視為正常家庭對話。
 *
 * 不再在本模組硬編碼：
 *
 * - 總管
 * - 大內總管
 * - 內內
 * - 喳子
 * - 渣子
 * =========================================================
 */

/**
 * =========================================================
 * Intent Detection
 * =========================================================
 */

/**
 * 判斷是否明確詢問「自己現在在哪裡」。
 *
 * 注意：
 * 「附近有什麼」
 * 不屬於 CURRENT_LOCATION。
 */
function isCurrentLocationRequest(
  text: string,
): boolean {

  const patterns = [
    '我現在在哪',
    '我現在在哪裡',
    '我目前在哪',
    '我目前在哪裡',
    '我在哪',
    '我在哪裡',
    '現在在哪',
    '現在在哪裡',
    '目前在哪',
    '目前在哪裡',
  ];

  return patterns.some(
    (pattern) =>
      text.includes(pattern),
  );
}


/**
 * =========================================================
 * Home / Current Place Intent
 * =========================================================
 */

function isNearCurrentRequest(
  text: string,
): boolean {

  const hasNear =
    text.includes('附近') ||
    text.includes('周邊') ||
    text.includes('周圍') ||
    text.includes('附近有') ||
    text.includes('附近有什麼') ||
    text.includes('離我最近') ||
    text.includes('离我最近') ||
    text.includes('離你最近') ||
    text.includes('离你最近') ||
    text.includes('最近的');

  if (
    !hasNear
  ) {
    return false;
  }

  /*
   * 明確指定「家」的需求，
   * 不應被歸到目前位置。
   */
  if (
    text.includes('我家') ||
    text.includes('家附近') ||
    text.includes('我家附近')
  ) {
    return false;
  }

  /*
   * 「附近」本身可能是純聊天，
   * 只有存在搜尋型語意才視為位置 Action。
   */
  const searchWords = [
    '好吃',
    '吃',
    '餐廳',
    '美食',
    '吃飯',
    '咖啡',
    '咖啡廳',
    '早餐',
    '午餐',
    '晚餐',
    '便利商店',
    '便利店',
    '超商',
    '超市',
    '加油站',
    '油站',
    '咖啡店',
    '咖啡館',
    '火鍋',
    '涮涮鍋',
    '藥局',
    '醫院',
    '銀行',
    '店',
    '哪裡',
    '有什麼',
    '有沒有',
    '推薦',
  ];

  return searchWords.some(
    (word) =>
      text.includes(word),
  );
}


function isNearHomeRequest(
  text: string,
): boolean {

  const hasHome =
    text.includes('我家') ||
    text.includes('家裡') ||
    text.includes('家附近') ||
    text.includes('我家附近');

  if (
    !hasHome
  ) {
    return false;
  }

  const searchWords = [
    '附近',
    '好吃',
    '吃',
    '餐廳',
    '美食',
    '咖啡',
    '咖啡廳',
    '早餐',
    '午餐',
    '晚餐',
    '便利商店',
    '便利店',
    '超商',
    '超市',
    '加油站',
    '油站',
    '咖啡店',
    '咖啡館',
    '火鍋',
    '涮涮鍋',
    '藥局',
    '醫院',
    '銀行',
    '店',
    '哪裡',
    '有什麼',
    '有沒有',
    '推薦',
  ];

  return searchWords.some(
    (word) =>
      text.includes(word),
  );
}


/**
 * =========================================================
 * Home Route
 * =========================================================
 *
 * Routes 本身已有獨立 Handler。
 *
 * 這裡只負責辨識，
 * 不重新計算 Routes。
 * =========================================================
 */

function isHomeRouteRequest(
  text: string,
): boolean {

  const homeWords = [
    '回家',
    '回到家',
    '到家',
    '回我家',
    '回到我家',
    '到我家',
  ];

  const hasHome =
    homeWords.some(
      (word) =>
        text.includes(word),
    );

  if (
    !hasHome
  ) {
    return false;
  }

  const routeWords = [
    '多久',
    '幾分鐘',
    '幾分',
    '還要多久',
    '多遠',
    '距離',
    '幾公里',
    '幾公尺',
  ];

  return routeWords.some(
    (word) =>
      text.includes(word),
  );
}


/**
 * =========================================================
 * Clarification Messages
 * =========================================================
 */

function buildCurrentLocationClarification(): string {

  return (
    '我目前不知道您現在的位置，' +
    '請直接傳送 LINE 定位，或告訴我您現在在哪裡。'
  );
}


function buildHomeLocationClarification(): string {

  return (
    '我目前還不知道固定的家位置，' +
    '請先設定「家」的位置。'
  );
}


/**
 * =========================================================
 * Resolve Current Location
 * =========================================================
 */

function resolveCurrentLocation(
  message: string,
  userId: string,
): LocationIntentResult {

  const resolution =
    resolveLocationReference(
      message,
      userId,
    );

  if (
    !resolution.resolved ||
    !resolution.location
  ) {

    return {
      handled: true,

      intent:
        'CURRENT_LOCATION',

      resolved:
        false,

      clarificationRequired:
        true,

      clarificationMessage:
        buildCurrentLocationClarification(),

      locationResolution:
        resolution,
    };
  }

  return {
    handled: true,

    intent:
      'CURRENT_LOCATION',

    resolved:
      true,

    clarificationRequired:
      false,

    locationResolution:
      resolution,

    action:
      'RETURN_CURRENT_LOCATION',
  };
}


/**
 * =========================================================
 * Resolve Near Current
 * =========================================================
 */

function resolveNearCurrent(
  message: string,
  userId: string,
): LocationIntentResult {

  const resolution =
    resolveLocationReference(
      '我現在在哪裡',
      userId,
    );

  if (
    !resolution.resolved ||
    !resolution.location
  ) {

    return {
      handled: true,

      intent:
        'NEAR_CURRENT',

      resolved:
        false,

      clarificationRequired:
        true,

      clarificationMessage:
        buildCurrentLocationClarification(),

      locationResolution:
        resolution,
    };
  }

  return {
    handled: true,

    intent:
      'NEAR_CURRENT',

    resolved:
      true,

    clarificationRequired:
      false,

    locationResolution:
      resolution,

    action:
      'SEARCH_NEAR_CURRENT',
  };
}


/**
 * =========================================================
 * Resolve Near Home
 * =========================================================
 */

function resolveNearHome(
  message: string,
  userId: string,
): LocationIntentResult {

  const resolution =
    resolveLocationReference(
      '我家附近',
      userId,
    );

  if (
    !resolution.resolved ||
    !resolution.location
  ) {

    return {
      handled: true,

      intent:
        'NEAR_HOME',

      resolved:
        false,

      clarificationRequired:
        true,

      clarificationMessage:
        buildHomeLocationClarification(),

      locationResolution:
        resolution,
    };
  }

  return {
    handled: true,

    intent:
      'NEAR_HOME',

    resolved:
      true,

    clarificationRequired:
      false,

    locationResolution:
      resolution,

    action:
      'SEARCH_NEAR_HOME',
  };
}


/**
 * =========================================================
 * Resolve Intent
 * =========================================================
 */

export function handleLocationIntent(
  message: string,
  userId: string,
): LocationIntentResult {

  const rawText =
    normalizeText(
      message,
    );


  if (
    !rawText
  ) {

    return {
      handled:
        false,

      intent:
        'UNKNOWN',

      resolved:
        false,

      clarificationRequired:
        false,
    };
  }


  /*
   * ---------------------------------------------------------
   * Location Session
   * ---------------------------------------------------------
   *
   * 如果上一輪已明確喚起位置功能，
   * 下一則文字訊息可以直接作為一次性位置需求。
   *
   * Session 在下一則訊息進來時立即結束，
   * 不論該訊息最後是否符合位置需求。
   * ---------------------------------------------------------
   */

  const consumedLocationSession =
    consumeLocationSession(
      userId,
    );


  const hasInvocation =
    hasCallName(
      rawText,
    );


  /*
   * 沒有有效呼叫詞，也沒有 Location Session，
   * 就完全不進入位置功能。
   */
  if (
    !consumedLocationSession &&
    !hasInvocation
  ) {

    return {
      handled:
        false,

      intent:
        'UNKNOWN',

      resolved:
        false,

      clarificationRequired:
        false,
    };
  }


  const text =
    hasInvocation
      ? normalizeText(
          cleanCallNames(
            rawText,
          ),
        )
      : rawText;


  /*
   * ---------------------------------------------------------
   * 明確喚起「位置」
   *
   * 例如：
   *
   * - 阿福 位置
   * - 目前風格呼叫詞 位置
   *
   * 建立一次性 Session，等待下一則文字訊息。
   * ---------------------------------------------------------
   */

  if (
    hasInvocation &&
    isLocationSessionInvocation(
      text,
    )
  ) {

    createLocationSession(
      userId,
    );

    return {
      handled:
        true,

      intent:
        'UNKNOWN',

      resolved:
        false,

      clarificationRequired:
        false,

      clarificationMessage:
        '位置功能已開啟，請直接告訴我想查什麼。',
    };
  }


  /*
   * ---------------------------------------------------------
   * 1. 回家 Routes
   *
   * 保留給既有 Location Route Handler。
   * ---------------------------------------------------------
   */

  if (
    isHomeRouteRequest(
      text,
    )
  ) {

    return {
      handled:
        true,

      intent:
        'HOME_ROUTE',

      resolved:
        false,

      clarificationRequired:
        false,

      action:
        'CALCULATE_HOME_ROUTE',
    };
  }


  /*
   * ---------------------------------------------------------
   * 2. 我家附近
   * ---------------------------------------------------------
   */

  if (
    isNearHomeRequest(
      text,
    )
  ) {

    return resolveNearHome(
      text,
      userId,
    );
  }


  /*
   * ---------------------------------------------------------
   * 3. 我附近
   * ---------------------------------------------------------
   */

  if (
    isNearCurrentRequest(
      text,
    )
  ) {

    return resolveNearCurrent(
      text,
      userId,
    );
  }


  /*
   * ---------------------------------------------------------
   * 4. 我現在在哪
   * ---------------------------------------------------------
   */

  if (
    isCurrentLocationRequest(
      text,
    )
  ) {

    return resolveCurrentLocation(
      text,
      userId,
    );
  }


  /*
   * ---------------------------------------------------------
   * 5. 不是位置需求
   * ---------------------------------------------------------
   */

  return {
    handled:
      false,

    intent:
      'UNKNOWN',

    resolved:
      false,

    clarificationRequired:
      false,
  };
}


/**
 * =========================================================
 * Safe Execution Check
 * =========================================================
 *
 * Action Layer 在真正執行前可以再次呼叫。
 *
 * 不允許：
 *
 * - clarificationRequired=true
 * - resolved=false
 *
 * 的需求進入 Google API。
 * =========================================================
 */

export function canExecuteLocationIntent(
  result: LocationIntentResult,
): boolean {

  if (
    !result.handled
  ) {
    return false;
  }

  if (
    result.clarificationRequired
  ) {
    return false;
  }

  if (
    result.intent === 'HOME_ROUTE'
  ) {
    /*
     * HOME_ROUTE 有自己的 Handler。
     * Intent Handler 只負責分流，
     * 不在此處重複判斷兩端座標。
     */
    return true;
  }

  if (
    !result.resolved
  ) {
    return false;
  }

  if (
    !result.locationResolution?.location
  ) {
    return false;
  }

  return true;
}