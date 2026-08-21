/**
 * =========================================================
 * Google Routes Service
 * =========================================================
 *
 * 只負責：
 * - 建立 Google Routes API Compute Routes request
 * - 呼叫 Google Routes API
 * - 解析必要回傳資料
 * - 將 Google HTTP/API 錯誤轉成可判斷的結果
 *
 * 不負責：
 * - LINE Webhook / Reply / Push
 * - Gemini
 * - 自然語言意圖判斷
 * - Location State
 * - Location Cache
 * - Reminder / Observer
 * - 配額決策
 *
 * 額度防線由 location-quota.ts 負責。
 *
 * 本檔目前先提供「可被上層呼叫的獨立 Routes Service」。
 * 尚未接入 index.ts，也不會在本階段自動發出任何 Google request。
 *
 * Google Routes API：
 * POST https://routes.googleapis.com/directions/v2:computeRoutes
 *
 * =========================================================
 */

import {
  reserveLocationQuota,
} from './location-quota';


const GOOGLE_ROUTES_ENDPOINT =
  'https://routes.googleapis.com/directions/v2:computeRoutes';


const DEFAULT_TIMEOUT_MS =
  10_000;


/**
 * =========================================================
 * Public Types
 * =========================================================
 */

export type GoogleRouteTravelMode =
  | 'DRIVE'
  | 'WALK'
  | 'BICYCLE'
  | 'TWO_WHEELER';


export type GoogleRouteRoutingPreference =
  | 'TRAFFIC_UNAWARE'
  | 'TRAFFIC_AWARE'
  | 'TRAFFIC_AWARE_OPTIMAL';


export interface GoogleRouteCoordinate {
  latitude: number;
  longitude: number;
}


export interface GoogleRouteRequest {
  origin: GoogleRouteCoordinate;

  destination: GoogleRouteCoordinate;

  travelMode?: GoogleRouteTravelMode;

  /**
   * 只有 DRIVE / TWO_WHEELER 才允許使用 routingPreference。
   *
   * TRAFFIC_AWARE / TRAFFIC_AWARE_OPTIMAL
   * 會使 Compute Routes 使用 Pro SKU。
   */
  routingPreference?: GoogleRouteRoutingPreference;

  /**
   * 是否需要避開收費道路。
   */
  avoidTolls?: boolean;

  /**
   * 是否需要避開高速公路。
   */
  avoidHighways?: boolean;

  /**
   * 是否需要避開渡輪。
   */
  avoidFerries?: boolean;

  /**
   * 語言僅影響本地化文字。
   * distanceMeters 永遠為公制。
   */
  languageCode?: string;
}


export interface GoogleRouteResult {
  durationSeconds: number;

  distanceMeters: number;

  /**
   * Google 回傳的原始 duration，例如：
   * "1238s"
   */
  durationText: string;

  /**
   * 本 Service 不主動要求 polyline，
   * 因此目前通常為 undefined。
   */
  encodedPolyline?: string;
}


export type GoogleRoutesErrorCode =
  | 'missing-api-key'
  | 'invalid-request'
  | 'quota-blocked'
  | 'google-rate-limited'
  | 'google-auth-failed'
  | 'google-forbidden'
  | 'google-not-found'
  | 'google-server-error'
  | 'network-error'
  | 'timeout'
  | 'invalid-response'
  | 'unknown';


export interface GoogleRoutesError {
  code: GoogleRoutesErrorCode;

  message: string;

  httpStatus?: number;

  googleStatus?: string;

  retryable: boolean;
}


export type GoogleRoutesServiceResult =
  | {
      ok: true;

      route: GoogleRouteResult;
    }
  | {
      ok: false;

      error: GoogleRoutesError;
    };


/**
 * =========================================================
 * Internal Types
 * =========================================================
 */

interface GoogleRoutesApiResponse {
  routes?: Array<{
    duration?: string;

    distanceMeters?: number;

    polyline?: {
      encodedPolyline?: string;
    };
  }>;
}


interface GoogleErrorResponse {
  error?: {
    code?: number;

    message?: string;

    status?: string;
  };
}


/**
 * =========================================================
 * API Key
 * =========================================================
 *
 * 正式 API Key 不寫死在程式。
 *
 * .env：
 *
 * GOOGLE_MAPS_API_KEY=...
 *
 * 注意：
 * 目前不使用 GEMINI_API_KEY。
 *
 * Google Maps Platform / Routes API
 * 與 Gemini API 是不同服務。
 * =========================================================
 */

function getGoogleMapsApiKey(): string {

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY;

  if (
    typeof apiKey !== 'string' ||
    !apiKey.trim()
  ) {
    return '';
  }

  return apiKey.trim();
}


/**
 * =========================================================
 * Input Validation
 * =========================================================
 */

function isValidCoordinate(
  coordinate: GoogleRouteCoordinate,
): boolean {

  return (
    Number.isFinite(
      coordinate.latitude,
    ) &&
    Number.isFinite(
      coordinate.longitude,
    ) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}


function validateRequest(
  request: GoogleRouteRequest,
): string | undefined {

  if (
    !request ||
    !isValidCoordinate(
      request.origin,
    ) ||
    !isValidCoordinate(
      request.destination,
    )
  ) {
    return 'origin 或 destination 座標無效。';
  }

  const travelMode =
    request.travelMode ??
    'DRIVE';

  if (
    travelMode === 'WALK' &&
    request.routingPreference
  ) {
    return 'WALK 不可設定 routingPreference。';
  }

  if (
    travelMode === 'BICYCLE' &&
    request.routingPreference
  ) {
    return 'BICYCLE 不可設定 routingPreference。';
  }

  if (
    request.routingPreference &&
    travelMode !== 'DRIVE' &&
    travelMode !== 'TWO_WHEELER'
  ) {
    return (
      'routingPreference 目前只允許 DRIVE 或 TWO_WHEELER。'
    );
  }

  return undefined;
}


/**
 * =========================================================
 * Duration Parser
 * =========================================================
 */

function parseDurationSeconds(
  value: unknown,
): number | undefined {

  if (
    typeof value !== 'string'
  ) {
    return undefined;
  }

  const match =
    /^([0-9]+(?:\.[0-9]+)?)s$/.exec(
      value.trim(),
    );

  if (!match) {
    return undefined;
  }

  const seconds =
    Number(match[1]);

  if (
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return undefined;
  }

  return seconds;
}


/**
 * =========================================================
 * Error Helpers
 * =========================================================
 */

async function parseGoogleError(
  response: Response,
): Promise<GoogleRoutesError> {

  let body:
    GoogleErrorResponse |
    undefined;

  try {

    body =
      await response.json() as GoogleErrorResponse;

  } catch {
    body =
      undefined;
  }

  const googleMessage =
    body?.error?.message;

  const googleStatus =
    body?.error?.status;

  const status =
    response.status;

  if (
    status === 401
  ) {
    return {
      code: 'google-auth-failed',

      message:
        googleMessage ||
        'Google Routes API 驗證失敗。',

      httpStatus:
        status,

      googleStatus,

      retryable: false,
    };
  }

  if (
    status === 403
  ) {
    return {
      code: 'google-forbidden',

      message:
        googleMessage ||
        'Google Routes API 拒絕此請求。',

      httpStatus:
        status,

      googleStatus,

      retryable: false,
    };
  }

  if (
    status === 404
  ) {
    return {
      code: 'google-not-found',

      message:
        googleMessage ||
        'Google Routes API endpoint 不存在。',

      httpStatus:
        status,

      googleStatus,

      retryable: false,
    };
  }

  if (
    status === 429
  ) {
    return {
      code: 'google-rate-limited',

      message:
        googleMessage ||
        'Google Routes API 回傳 429，已達服務限制或配額限制。',

      httpStatus:
        status,

      googleStatus,

      retryable: false,
    };
  }

  if (
    status >= 500
  ) {
    return {
      code: 'google-server-error',

      message:
        googleMessage ||
        `Google Routes API server error (${status})。`,

      httpStatus:
        status,

      googleStatus,

      retryable: false,
    };
  }

  if (
    status >= 400
  ) {
    return {
      code: 'invalid-request',

      message:
        googleMessage ||
        `Google Routes API request failed (${status})。`,

      httpStatus:
        status,

      googleStatus,

      retryable: false,
    };
  }

  return {
    code: 'unknown',

    message:
      googleMessage ||
      'Google Routes API 發生未知錯誤。',

    httpStatus:
      status,

    googleStatus,

    retryable: false,
  };
}


/**
 * =========================================================
 * Build Request Body
 * =========================================================
 */

function buildRequestBody(
  request: GoogleRouteRequest,
): Record<string, unknown> {

  const travelMode =
    request.travelMode ??
    'DRIVE';

  const body: Record<string, unknown> = {

    origin: {
      location: {
        latLng: {
          latitude:
            request.origin.latitude,

          longitude:
            request.origin.longitude,
        },
      },
    },

    destination: {
      location: {
        latLng: {
          latitude:
            request.destination.latitude,

          longitude:
            request.destination.longitude,
        },
      },
    },

    travelMode,

    computeAlternativeRoutes:
      false,

    languageCode:
      request.languageCode ||
      'zh-TW',

    units:
      'METRIC',
  };

  if (
    request.routingPreference
  ) {
    body.routingPreference =
      request.routingPreference;
  }

  if (
    request.avoidTolls ||
    request.avoidHighways ||
    request.avoidFerries
  ) {

    body.routeModifiers = {

      avoidTolls:
        request.avoidTolls === true,

      avoidHighways:
        request.avoidHighways === true,

      avoidFerries:
        request.avoidFerries === true,
    };
  }

  return body;
}


/**
 * =========================================================
 * Field Mask
 * =========================================================
 *
 * 目前只要求真正需要的資料：
 *
 * routes.duration
 * routes.distanceMeters
 *
 * 不使用：
 *
 * routes
 * *
 * polyline
 * legs
 * steps
 * tolls
 * fuel
 * transit details
 *
 * 先把 API 回傳資料控制在最小範圍。
 * =========================================================
 */

function getFieldMask(): string {

  return [
    'routes.duration',
    'routes.distanceMeters',
  ].join(',');
}


/**
 * =========================================================
 * Main Service
 * =========================================================
 */

export async function computeGoogleRoute(
  request: GoogleRouteRequest,
): Promise<GoogleRoutesServiceResult> {

  const validationError =
    validateRequest(
      request,
    );

  if (
    validationError
  ) {
    return {
      ok: false,

      error: {
        code: 'invalid-request',

        message:
          validationError,

        retryable: false,
      },
    };
  }

  const apiKey =
    getGoogleMapsApiKey();

  if (!apiKey) {
    return {
      ok: false,

      error: {
        code: 'missing-api-key',

        message:
          '尚未設定 GOOGLE_MAPS_API_KEY。',

        retryable: false,
      },
    };
  }

  /**
   * -------------------------------------------------------
   * Location Quota 第一層
   * -------------------------------------------------------
   *
   * 每一個 Compute Routes request
   * 先取得 1 unit。
   *
   * 注意：
   * 這裡只是「總管自己的內部硬上限」。
   * Google 官方 SKU 仍由 Google 根據 request features 判定。
   *
   * 本階段先以「一次 Compute Routes request = 1 unit」
   * 計算總管內部用量。
   */

  const quota =
    reserveLocationQuota(
      1,
      'routes',
    );

  if (
    !quota.allowed
  ) {
    return {
      ok: false,

      error: {
        code: 'quota-blocked',

        message:
          '總管內部位置查詢月額度已達上限，已阻止 Google Routes API request。',

        retryable: false,
      },
    };
  }

  /**
   * -------------------------------------------------------
   * Abort Controller
   * -------------------------------------------------------
   */

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      DEFAULT_TIMEOUT_MS,
    );

  try {

    const response =
      await fetch(
        GOOGLE_ROUTES_ENDPOINT,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-Goog-Api-Key':
              apiKey,

            'X-Goog-FieldMask':
              getFieldMask(),
          },

          body:
            JSON.stringify(
              buildRequestBody(
                request,
              ),
            ),

          signal:
            controller.signal,
        },
      );

    if (
      !response.ok
    ) {

      const error =
        await parseGoogleError(
          response,
        );

      console.error(
        '[Google Routes] API request failed:',
        {
          code:
            error.code,

          httpStatus:
            error.httpStatus,

          googleStatus:
            error.googleStatus,

          message:
            error.message,
        },
      );

      return {
        ok: false,

        error,
      };
    }

    const data =
      await response.json() as GoogleRoutesApiResponse;

    const firstRoute =
      data.routes?.[0];

    if (
      !firstRoute
    ) {
      return {
        ok: false,

        error: {
          code: 'invalid-response',

          message:
            'Google Routes API 沒有回傳任何 route。',

          retryable: false,
        },
      };
    }

    const durationSeconds =
      parseDurationSeconds(
        firstRoute.duration,
      );

    const distanceMeters =
      firstRoute.distanceMeters;

    if (
      durationSeconds === undefined ||
      typeof distanceMeters !== 'number' ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0
    ) {
      return {
        ok: false,

        error: {
          code: 'invalid-response',

          message:
            'Google Routes API 回傳資料缺少有效的 duration 或 distanceMeters。',

          retryable: false,
        },
      };
    }

    return {
      ok: true,

      route: {
        durationSeconds,

        distanceMeters,

        durationText:
          firstRoute.duration!,

        encodedPolyline:
          firstRoute.polyline?.encodedPolyline,
      },
    };

  } catch (
    error
  ) {

    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {

      return {
        ok: false,

        error: {
          code: 'timeout',

          message:
            `Google Routes API request 超過 ${DEFAULT_TIMEOUT_MS}ms。`,

          retryable: false,
        },
      };
    }

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      '[Google Routes] Network error:',
      message,
    );

    return {
      ok: false,

      error: {
        code: 'network-error',

        message:
          `Google Routes API network error: ${message}`,

        retryable: false,
      },
    };

  } finally {

    clearTimeout(
      timeout,
    );
  }
}


/**
 * =========================================================
 * Convenience Helpers
 * =========================================================
 */

/**
 * 最適合「現在開車回家多久」這類需求：
 *
 * DRIVE + TRAFFIC_AWARE
 *
 * 這會使用 Google Routes Pro SKU。
 */
export async function computeTrafficAwareDrivingRoute(
  origin: GoogleRouteCoordinate,

  destination: GoogleRouteCoordinate,
): Promise<GoogleRoutesServiceResult> {

  return computeGoogleRoute(
    {
      origin,

      destination,

      travelMode:
        'DRIVE',

      routingPreference:
        'TRAFFIC_AWARE',
    },
  );
}


/**
 * 最適合不需要即時路況的基本路線：
 *
 * DRIVE
 *
 * 不設定 routingPreference。
 */
export async function computeBasicDrivingRoute(
  origin: GoogleRouteCoordinate,

  destination: GoogleRouteCoordinate,
): Promise<GoogleRoutesServiceResult> {

  return computeGoogleRoute(
    {
      origin,

      destination,

      travelMode:
        'DRIVE',
    },
  );
}


/**
 * 步行路線。
 */
export async function computeWalkingRoute(
  origin: GoogleRouteCoordinate,

  destination: GoogleRouteCoordinate,
): Promise<GoogleRoutesServiceResult> {

  return computeGoogleRoute(
    {
      origin,

      destination,

      travelMode:
        'WALK',
    },
  );
}


/**
 * 腳踏車路線。
 */
export async function computeBicycleRoute(
  origin: GoogleRouteCoordinate,

  destination: GoogleRouteCoordinate,
): Promise<GoogleRoutesServiceResult> {

  return computeGoogleRoute(
    {
      origin,

      destination,

      travelMode:
        'BICYCLE',
    },
  );
}