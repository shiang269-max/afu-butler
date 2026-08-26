/**
 * =========================================================
 * Location Route Handler
 * =========================================================
 *
 * 目前第一階段只處理：
 *
 *   使用者目前位置 → 固定家
 *
 * 例如：
 *
 * - 我回家要多久
 * - 我回到家要多久
 * - 到家要多久
 * - 回家還要多久
 *
 * =========================================================
 *
 * 本模組負責：
 *
 * 1. 判斷是否為「目前位置 → 家」路線需求
 * 2. 取得 CURRENT_USER_LOCATION
 * 3. 取得 HOME
 * 4. 確認兩端座標都已知
 * 5. 呼叫 Google Routes Service
 * 6. 產生適合 LINE 回覆的結果
 *
 * 不負責：
 *
 * - LINE Webhook
 * - LINE replyMessage
 * - Gemini
 * - Places API
 * - Geocoding
 * - Location Quota
 *
 * Google Routes Service 自己負責 quota 防線。
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
  computeBasicDrivingRoute,
  GoogleRouteCoordinate,
  GoogleRoutesServiceResult,
} from './google-routes-service';

import {
  buildLocationResponse,
} from '../styles/style-response';


/**
 * =========================================================
 * Public Types
 * =========================================================
 */

export interface LocationRouteResult {
  handled: boolean;

  success: boolean;

  replyText?: string;

  reason?: string;

  route?: {
    durationSeconds: number;

    distanceMeters: number;

    durationText: string;
  };
}


/**
 * =========================================================
 * Route Calculator
 * =========================================================
 *
 * 為了讓測試不必真的呼叫 Google API，
 * 實際執行函數可以注入 routeCalculator。
 *
 * 正式執行時預設使用：
 *
 * computeBasicDrivingRoute()
 *
 * 測試時可以替換成假的 calculator。
 *
 * =========================================================
 */

export type LocationRouteCalculator =
  (
    origin: GoogleRouteCoordinate,
    destination: GoogleRouteCoordinate,
  ) =>
    Promise<GoogleRoutesServiceResult>;


/**
 * =========================================================
 * Intent Detection
 * =========================================================
 */

export function isHomeRouteRequest(
  message: string,
): boolean {

  const text =
    message
      .trim()
      .replace(/\s+/g, ' ');


  if (
    !text
  ) {
    return false;
  }


  /*
   * ---------------------------------------------------------
   * 明確的「回家／到家」路線詢問
   * ---------------------------------------------------------
   */

  const homeWords = [
    '回家',
    '回到家',
    '到家',
    '回我家',
    '回到我家',
    '到我家',
  ];


  const timeWords = [
    '多久',
    '幾分鐘',
    '幾分',
    '要多久',
    '還要多久',
    '需要多久',
    '要幾分鐘',
    '需要幾分鐘',
  ];


  const hasHomeWord =
    homeWords.some(
      (word) =>
        text.includes(
          word,
        ),
    );


  if (
    !hasHomeWord
  ) {
    return false;
  }


  const hasTimeWord =
    timeWords.some(
      (word) =>
        text.includes(
          word,
        ),
    );


  if (
    hasTimeWord
  ) {
    return true;
  }


  /*
   * ---------------------------------------------------------
   * 「回家還有多遠」等距離詢問
   * ---------------------------------------------------------
   */

  const distanceWords = [
    '多遠',
    '距離',
    '幾公里',
    '幾公尺',
  ];


  return distanceWords.some(
    (word) =>
      text.includes(
        word,
      ),
  );
}


/**
 * =========================================================
 * Distance Formatting
 * =========================================================
 */

function formatDistance(
  distanceMeters: number,
): string {

  if (
    distanceMeters < 1000
  ) {

    return `${Math.round(distanceMeters)} 公尺`;
  }


  const kilometers =
    distanceMeters / 1000;


  if (
    kilometers < 10
  ) {

    return `${kilometers.toFixed(1)} 公里`;
  }


  return `${Math.round(kilometers)} 公里`;
}


/**
 * =========================================================
 * Duration Formatting
 * =========================================================
 */

function formatDuration(
  durationSeconds: number,
): string {

  const totalMinutes =
    Math.max(
      1,
      Math.round(
        durationSeconds / 60,
      ),
    );


  if (
    totalMinutes < 60
  ) {

    return `${totalMinutes} 分鐘`;
  }


  const hours =
    Math.floor(
      totalMinutes / 60,
    );

  const minutes =
    totalMinutes % 60;


  if (
    minutes === 0
  ) {

    return `${hours} 小時`;
  }


  return `${hours} 小時 ${minutes} 分鐘`;
}


/**
 * =========================================================
 * Build Successful Reply
 * =========================================================
 */

export function buildHomeRouteReply(
  route: {
    durationSeconds: number;

    distanceMeters: number;

    durationText: string;
  },
): string {

  const duration =
    formatDuration(
      route.durationSeconds,
    );


  const distance =
    formatDistance(
      route.distanceMeters,
    );


  return buildLocationResponse(
    `從您現在的位置回家，` +
    `大約需要 ${duration}，` +
    `距離約 ${distance}。`,
  );
}


/**
 * =========================================================
 * Main Handler
 * =========================================================
 */

export async function handleHomeRouteRequest(
  message: string,
  userId: string,
  routeCalculator:
    LocationRouteCalculator =
      computeBasicDrivingRoute,
): Promise<LocationRouteResult> {

  /*
   * ---------------------------------------------------------
   * 1. 不是回家路線需求
   * ---------------------------------------------------------
   */

  if (
    !isHomeRouteRequest(
      message,
    )
  ) {

    return {
      handled:
        false,

      success:
        false,

      reason:
        'not-home-route-request',
    };
  }


  /*
   * ---------------------------------------------------------
   * 2. 先取得目前位置
   *
   * 不能猜。
   * 沒有 LINE 定位就停止。
   * ---------------------------------------------------------
   */

  const currentLocation =
    getLatestLocation(
      userId,
    );


  if (
    !currentLocation
  ) {

    return {
      handled:
        true,

      success:
        false,

      reason:
        'current-location-unknown',

      replyText:
        buildLocationResponse(
          '總管目前不知道您在哪裡，請直接傳送 LINE 定位，或告訴我您現在的位置。',
        ),
    };
  }


  /*
   * ---------------------------------------------------------
   * 3. 使用 Resolver 確認 HOME
   * ---------------------------------------------------------
   */

  const homeResolution =
    resolveLocationReference(
      message,
      userId,
    );


  if (
    !homeResolution.resolved ||
    !homeResolution.location
  ) {

    return {
      handled:
        true,

      success:
        false,

      reason:
        'home-location-unknown',

      replyText:
        buildLocationResponse(
          '總管目前還不知道固定的家位置，請先設定「家」的位置。',
        ),
    };
  }


  /*
   * ---------------------------------------------------------
   * 4. 建立 Routes 座標
   * ---------------------------------------------------------
   */

  const origin:
    GoogleRouteCoordinate = {

    latitude:
      currentLocation.latitude,

    longitude:
      currentLocation.longitude,
  };


  const destination:
    GoogleRouteCoordinate = {

    latitude:
      homeResolution.location.latitude,

    longitude:
      homeResolution.location.longitude,
  };


  /*
   * ---------------------------------------------------------
   * 5. Google Routes
   * ---------------------------------------------------------
   */

  const routeResult =
    await routeCalculator(
      origin,
      destination,
    );


  if (
    !routeResult.ok
  ) {

    return {
      handled:
        true,

      success:
        false,

      reason:
        routeResult.error.code,

      replyText:
        buildLocationResponse(
          '總管暫時無法取得回家的路程資訊，請稍後再試。',
        ),
    };
  }


  /*
   * ---------------------------------------------------------
   * 6. 建立 LINE 可直接使用的回覆
   * ---------------------------------------------------------
   */

  const route =
    routeResult.route;


  return {
    handled:
      true,

    success:
      true,

    route,

    replyText:
      buildHomeRouteReply(
        route,
      ),
  };
}