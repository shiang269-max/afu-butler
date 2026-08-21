import {
  getLatestLocation,
} from './location-state';

import {
  getHomeLocation,
} from './home-location';

import {
  LocationRecord,
} from './location-types';


/**
 * =========================================================
 * Location Reference Type
 * =========================================================
 */

export type LocationReferenceType =
  | 'HOME'
  | 'CURRENT_USER_LOCATION'
  | 'EXPLICIT_TEXT_PLACE'
  | 'UNKNOWN';


/**
 * =========================================================
 * Location Resolver Result
 * =========================================================
 */

export interface LocationResolverResult {
  resolved: boolean;

  referenceType:
    LocationReferenceType;

  location?: LocationRecord;

  placeText?: string;

  clarificationRequired: boolean;

  clarificationReason?: string;
}


/**
 * =========================================================
 * Internal Helpers
 * =========================================================
 */

function normalizeText(
  text: string,
): string {

  return text
    .trim()
    .replace(
      /\s+/g,
      ' ',
    );
}


/**
 * =========================================================
 * Home Detection
 * =========================================================
 */

function isHomeReference(
  text: string,
): boolean {

  const normalized =
    normalizeText(
      text,
    );

  return (
    normalized === '家' ||
    normalized === '我家' ||
    normalized.includes('我家附近') ||
    normalized.includes('家附近') ||
    normalized.includes('回家') ||
    normalized.includes('到家')
  );
}


/**
 * =========================================================
 * Current Location Detection
 * =========================================================
 */

function isCurrentLocationReference(
  text: string,
): boolean {

  const normalized =
    normalizeText(
      text,
    );

  const explicitPatterns = [
    '我現在在哪',
    '我現在的位置',
    '我目前的位置',
    '我現在附近',
    '我目前附近',
    '我附近',
    '我這裡附近',
    '我這邊附近',
    '我所在的位置',
    '我所在地',
  ];

  return explicitPatterns.some(
    (
      pattern,
    ) =>
      normalized.includes(
        pattern,
      ),
  );
}


/**
 * =========================================================
 * Ambiguous Demonstrative Place Detection
 * =========================================================
 *
 * 這些詞本身沒有足夠的位置資訊：
 *
 * - 那
 * - 這
 * - 那邊
 * - 這邊
 * - 那裡
 * - 這裡
 * - 那附近
 * - 這附近
 *
 * 絕對不能直接當成 EXPLICIT_TEXT_PLACE。
 *
 * =========================================================
 */

function isAmbiguousDemonstrative(
  text: string,
): boolean {

  const normalized =
    normalizeText(
      text,
    );


  const ambiguousPatterns = [
    /^那$/,
    /^這$/,
    /^那邊$/,
    /^這邊$/,
    /^那裡$/,
    /^這裡$/,
    /^那附近$/,
    /^這附近$/,
    /^那附近有/,
    /^這附近有/,
    /^那邊有/,
    /^這邊有/,
    /^那裡有/,
    /^這裡有/,
  ];


  return ambiguousPatterns.some(
    (
      pattern,
    ) =>
      pattern.test(
        normalized,
      ),
  );
}


/**
 * =========================================================
 * Candidate Validation
 * =========================================================
 *
 * 正則只負責「抓候選文字」。
 *
 * 真正要進入 EXPLICIT_TEXT_PLACE 前，
 * 還必須經過這一層。
 *
 * 目的：
 *
 * 「那」
 * 「這」
 * 「那邊」
 * 「這裡」
 *
 * 等代詞不能被視為實際地點。
 *
 * =========================================================
 */

function isValidExplicitPlaceCandidate(
  candidate: string,
): boolean {

  const normalized =
    normalizeText(
      candidate,
    );


  if (
    !normalized
  ) {
    return false;
  }


  if (
    isAmbiguousDemonstrative(
      normalized,
    )
  ) {
    return false;
  }


  const invalidCandidates = new Set([
    '那',
    '這',
    '那邊',
    '這邊',
    '那裡',
    '這裡',
    '附近',
    '那附近',
    '這附近',
  ]);


  if (
    invalidCandidates.has(
      normalized,
    )
  ) {
    return false;
  }


  return true;
}


/**
 * =========================================================
 * Explicit Text Place Detection
 * =========================================================
 *
 * 這裡只處理：
 *
 * 「使用者明確說出的地點」
 *
 * 不負責：
 *
 * - 猜測地點
 * - 查 Google
 * - 地名驗證
 * - 座標轉換
 *
 * =========================================================
 */

function extractExplicitTextPlace(
  text: string,
): string | undefined {

  const normalized =
    normalizeText(
      text,
    );


  if (
    isAmbiguousDemonstrative(
      normalized,
    )
  ) {
    return undefined;
  }


  const patterns = [
    /(.+?)附近(?:有什麼|有甚麼|有沒有|有啥|哪裡|哪家)/,
    /(.+?)周邊(?:有什麼|有甚麼|有沒有|有啥|哪裡|哪家)/,
    /(.+?)一帶(?:有什麼|有甚麼|有沒有|有啥|哪裡|哪家)/,
    /從(.+?)到.+/,
    /從(.+?)去.+/,
    /(.+?)到(.+?)(?:多久|要多久|幾分鐘|怎麼去)/,
  ];


  for (
    const pattern of patterns
  ) {

    const match =
      normalized.match(
        pattern,
      );


    if (
      !match
    ) {
      continue;
    }


    const candidate =
      match[1]
        ?.trim();


    if (
      !candidate
    ) {
      continue;
    }


    if (
      !isValidExplicitPlaceCandidate(
        candidate,
      )
    ) {
      continue;
    }


    return candidate;
  }


  return undefined;
}


/**
 * =========================================================
 * Current Location Lookup
 * =========================================================
 */

function resolveCurrentUserLocation(
  userId: string,
): LocationRecord | undefined {

  if (
    !userId ||
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
 * Resolve Location Reference
 * =========================================================
 *
 * 硬規則：
 *
 * UNKNOWN 就 UNKNOWN。
 *
 * 不得因為：
 *
 * - 人格
 * - 對話上下文不足
 * - 「總管應該知道」
 * - 「可能是剛剛那個地方」
 *
 * 而自行猜測。
 *
 * =========================================================
 */

export function resolveLocationReference(
  text: string,
  userId: string,
): LocationResolverResult {

  const normalized =
    normalizeText(
      text,
    );


  /**
   * -------------------------------------------------------
   * Empty input
   * -------------------------------------------------------
   */

  if (
    !normalized
  ) {

    return {
      resolved: false,

      referenceType:
        'UNKNOWN',

      clarificationRequired: true,

      clarificationReason:
        '沒有提供可判斷位置的內容。',
    };
  }


  /**
   * -------------------------------------------------------
   * 1. HOME
   * -------------------------------------------------------
   */

  if (
    isHomeReference(
      normalized,
    )
  ) {

    const homeLocation =
      getHomeLocation();


    if (
      !homeLocation
    ) {

      return {
        resolved: false,

        referenceType:
          'HOME',

        clarificationRequired: true,

        clarificationReason:
          '已確認使用者指的是「家」，但目前尚未設定固定家位置。',
      };
    }


    return {
      resolved: true,

      referenceType:
        'HOME',

      location:
        homeLocation,

      clarificationRequired: false,
    };
  }


  /**
   * -------------------------------------------------------
   * 2. CURRENT USER LOCATION
   * -------------------------------------------------------
   */

  if (
    isCurrentLocationReference(
      normalized,
    )
  ) {

    const location =
      resolveCurrentUserLocation(
        userId,
      );


    if (
      !location
    ) {

      return {
        resolved: false,

        referenceType:
          'CURRENT_USER_LOCATION',

        clarificationRequired: true,

        clarificationReason:
          '總管目前沒有這位家人的有效位置，請直接傳送 LINE 定位，或用文字告知目前所在地。',
      };
    }


    return {
      resolved: true,

      referenceType:
        'CURRENT_USER_LOCATION',

      location,

      clarificationRequired: false,
    };
  }


  /**
   * -------------------------------------------------------
   * 3. Explicit Text Place
   * -------------------------------------------------------
   */

  const explicitPlace =
    extractExplicitTextPlace(
      normalized,
    );


  if (
    explicitPlace
  ) {

    return {
      resolved: true,

      referenceType:
        'EXPLICIT_TEXT_PLACE',

      placeText:
        explicitPlace,

      clarificationRequired: false,
    };
  }


  /**
   * -------------------------------------------------------
   * 4. UNKNOWN
   * -------------------------------------------------------
   *
   * 到這裡仍然無法確定位置。
   *
   * 不猜。
   */

  return {
    resolved: false,

    referenceType:
      'UNKNOWN',

    clarificationRequired: true,

    clarificationReason:
      '目前無法確定使用者所指的位置，必須先請使用者補充位置。',
  };
}


/**
 * =========================================================
 * Clarification Message
 * =========================================================
 */

export function buildLocationClarificationMessage(
  result: LocationResolverResult,
): string {

  if (
    !result.clarificationRequired
  ) {

    return '';
  }


  if (
    result.referenceType ===
    'CURRENT_USER_LOCATION'
  ) {

    return (
      '主上，總管目前不知道您現在的位置。請直接傳送 LINE 定位，或告訴總管您現在在哪裡。'
    );
  }


  if (
    result.referenceType ===
    'HOME'
  ) {

    return (
      '主上，總管知道您說的是「家」，但目前還沒有設定家的位置。'
    );
  }


  return (
    '主上，總管還不能確定您指的是哪個位置。請直接傳送 LINE 定位，或告訴總管地點名稱。'
  );
}


/**
 * =========================================================
 * Safety Helper
 * =========================================================
 */

export function isLocationResolutionSafe(
  result: LocationResolverResult,
): boolean {

  return (
    result.resolved &&
    !result.clarificationRequired
  );
}