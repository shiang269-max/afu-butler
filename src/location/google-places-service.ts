/**
 * =========================================================
 * Google Places Service
 * =========================================================
 *
 * 第一階段：
 *
 *   latitude / longitude
 *          ↓
 *   Google Places API
 *          ↓
 *   標準化附近店家資料
 *
 * 本模組負責：
 *
 * 1. 呼叫 Google Places API
 * 2. 以指定座標作為搜尋中心
 * 3. 搜尋附近店家
 * 4. 將 Google 回傳資料標準化
 * 5. 提供距離、評分、營業狀態等資訊
 * 6. Google API 失敗時不得產生假資料
 *
 * 本模組不負責：
 *
 * - LINE
 * - Gemini
 * - Location Intent
 * - Location Resolver
 * - Routes
 * - Memory
 * - 最終 LINE 回覆文字
 *
 * =========================================================
 */


/**
 * =========================================================
 * Public Types
 * =========================================================
 */

export interface GooglePlacesCoordinate {
  latitude: number;

  longitude: number;
}


export type GooglePlacesSearchType =
  | 'restaurant'
  | 'cafe'
  | 'food'
  | 'store';


export interface GooglePlaceResult {
  placeId: string;

  name: string;

  address?: string;

  latitude: number;

  longitude: number;

  distanceMeters?: number;

  rating?: number;

  userRatingCount?: number;

  openNow?: boolean;

  types: string[];

  googleMapsUri?: string;
}


export interface GooglePlacesSearchOptions {
  radiusMeters?: number;

  maxResults?: number;

  type?: GooglePlacesSearchType;
}


export interface GooglePlacesServiceSuccess {
  ok: true;

  places: GooglePlaceResult[];
}


export interface GooglePlacesServiceFailure {
  ok: false;

  error: {
    code:
      | 'INVALID_COORDINATE'
      | 'INVALID_RADIUS'
      | 'INVALID_MAX_RESULTS'
      | 'MISSING_API_KEY'
      | 'QUOTA_EXCEEDED'
      | 'API_ERROR'
      | 'NETWORK_ERROR'
      | 'INVALID_RESPONSE';

    message: string;
  };
}


export type GooglePlacesServiceResult =
  | GooglePlacesServiceSuccess
  | GooglePlacesServiceFailure;


/**
 * =========================================================
 * Constants
 * =========================================================
 */

const DEFAULT_RADIUS_METERS =
  1500;


const DEFAULT_MAX_RESULTS =
  10;


const MAX_RADIUS_METERS =
  50000;


const MAX_RESULTS =
  20;


/**
 * =========================================================
 * API Configuration
 * =========================================================
 */

function getGoogleApiKey():
  string | undefined {

  const candidates = [
    process.env.GOOGLE_MAPS_API_KEY,

    process.env.GOOGLE_PLACES_API_KEY,

    process.env.GOOGLE_API_KEY,
  ];


  for (
    const value of candidates
  ) {

    if (
      typeof value === 'string' &&
      value.trim()
    ) {

      return value.trim();
    }
  }


  return undefined;
}


/**
 * =========================================================
 * Coordinate Validation
 * =========================================================
 */

function isValidCoordinate(
  coordinate:
    GooglePlacesCoordinate,
): boolean {

  if (
    !Number.isFinite(
      coordinate.latitude,
    )
  ) {

    return false;
  }


  if (
    !Number.isFinite(
      coordinate.longitude,
    )
  ) {

    return false;
  }


  if (
    coordinate.latitude < -90 ||
    coordinate.latitude > 90
  ) {

    return false;
  }


  if (
    coordinate.longitude < -180 ||
    coordinate.longitude > 180
  ) {

    return false;
  }


  return true;
}


/**
 * =========================================================
 * Distance Calculation
 * =========================================================
 *
 * Google Places 回傳的 location 本身不一定提供距離。
 *
 * 因此 Service 層自行根據搜尋中心與店家座標
 * 計算直線距離。
 *
 * 這不是駕車距離。
 * Routes 才負責實際道路距離。
 *
 * =========================================================
 */

function calculateDistanceMeters(
  origin:
    GooglePlacesCoordinate,

  destination:
    GooglePlacesCoordinate,
): number {

  const earthRadiusMeters =
    6371000;


  const latitude1 =
    origin.latitude *
    Math.PI /
    180;


  const latitude2 =
    destination.latitude *
    Math.PI /
    180;


  const deltaLatitude =
    (
      destination.latitude -
      origin.latitude
    ) *
    Math.PI /
    180;


  const deltaLongitude =
    (
      destination.longitude -
      origin.longitude
    ) *
    Math.PI /
    180;


  const a =
    Math.sin(
      deltaLatitude / 2,
    ) ** 2 +
    Math.cos(
      latitude1,
    ) *
    Math.cos(
      latitude2,
    ) *
    Math.sin(
      deltaLongitude / 2,
    ) ** 2;


  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(
        1 - a,
      ),
    );


  return (
    earthRadiusMeters *
    c
  );
}


/**
 * =========================================================
 * Number Normalization
 * =========================================================
 */

function toFiniteNumber(
  value: unknown,
): number | undefined {

  const number =
    typeof value === 'number'
      ? value
      : Number(value);


  if (
    !Number.isFinite(
      number,
    )
  ) {

    return undefined;
  }


  return number;
}


/**
 * =========================================================
 * String Normalization
 * =========================================================
 */

function optionalString(
  value: unknown,
): string | undefined {

  if (
    typeof value !== 'string'
  ) {

    return undefined;
  }


  const trimmed =
    value.trim();


  if (
    !trimmed
  ) {

    return undefined;
  }


  return trimmed;
}


/**
 * =========================================================
 * Google Places API
 * =========================================================
 *
 * 使用 Places API (New)
 * Nearby Search endpoint。
 *
 * =========================================================
 */

const PLACES_NEARBY_URL =
  'https://places.googleapis.com/v1/places:searchNearby';


/**
 * =========================================================
 * Build Request Body
 * =========================================================
 */

function buildRequestBody(
  coordinate:
    GooglePlacesCoordinate,

  options:
    GooglePlacesSearchOptions,
): Record<string, unknown> {

  const radiusMeters =
    options.radiusMeters ??
    DEFAULT_RADIUS_METERS;


  const maxResults =
    options.maxResults ??
    DEFAULT_MAX_RESULTS;


  const type =
    options.type ??
    'restaurant';


  return {
    includedTypes: [
      type,
    ],

    maxResultCount:
      maxResults,

    locationRestriction: {
      circle: {
        center: {
          latitude:
            coordinate.latitude,

          longitude:
            coordinate.longitude,
        },

        radius:
          radiusMeters,
      },
    },
  };
}


/**
 * =========================================================
 * Response Normalization
 * =========================================================
 */

function normalizePlace(
  raw:
    any,

  origin:
    GooglePlacesCoordinate,
):
  GooglePlaceResult |
  undefined {

  if (
    !raw ||
    typeof raw !== 'object'
  ) {

    return undefined;
  }


  const placeId =
    optionalString(
      raw.id,
    );


  const name =
    optionalString(
      raw.displayName?.text,
    );


  const latitude =
    toFiniteNumber(
      raw.location?.latitude,
    );


  const longitude =
    toFiniteNumber(
      raw.location?.longitude,
    );


  if (
    !placeId ||
    !name ||
    latitude === undefined ||
    longitude === undefined
  ) {

    return undefined;
  }


  const place:
    GooglePlaceResult = {

    placeId,

    name,

    address:
      optionalString(
        raw.formattedAddress,
      ),

    latitude,

    longitude,

    distanceMeters:
      calculateDistanceMeters(
        origin,
        {
          latitude,
          longitude,
        },
      ),

    rating:
      toFiniteNumber(
        raw.rating,
      ),

    userRatingCount:
      toFiniteNumber(
        raw.userRatingCount,
      ),

    openNow:
      typeof raw.currentOpeningHours?.openNow ===
      'boolean'
        ? raw.currentOpeningHours.openNow
        : undefined,

    types:
      Array.isArray(
        raw.types,
      )
        ? raw.types.filter(
            (
              value: unknown,
            ): value is string =>
              typeof value === 'string',
          )
        : [],

    googleMapsUri:
      optionalString(
        raw.googleMapsUri,
      ),
  };


  return place;
}


/**
 * =========================================================
 * Result Sorting
 * =========================================================
 *
 * 預設優先距離。
 *
 * 不在 Service 層自行判斷：
 * 「哪一家最好吃」。
 *
 * 推薦邏輯留給上層。
 *
 * =========================================================
 */

function sortPlaces(
  places:
    GooglePlaceResult[],
):
  GooglePlaceResult[] {

  return [
    ...places,
  ].sort(
    (
      a,
      b,
    ) => {

      const distanceA =
        a.distanceMeters ??
        Number.POSITIVE_INFINITY;


      const distanceB =
        b.distanceMeters ??
        Number.POSITIVE_INFINITY;


      return (
        distanceA -
        distanceB
      );
    },
  );
}


/**
 * =========================================================
 * Main Search Function
 * =========================================================
 */

export async function searchNearbyPlaces(
  coordinate:
    GooglePlacesCoordinate,

  options:
    GooglePlacesSearchOptions = {},
):
  Promise<GooglePlacesServiceResult> {

  /*
   * ---------------------------------------------------------
   * 1. Coordinate
   * ---------------------------------------------------------
   */

  if (
    !isValidCoordinate(
      coordinate,
    )
  ) {

    return {
      ok: false,

      error: {
        code:
          'INVALID_COORDINATE',

        message:
          '搜尋附近店家需要有效的 latitude / longitude。',
      },
    };
  }


  /*
   * ---------------------------------------------------------
   * 2. Radius
   * ---------------------------------------------------------
   */

  const radiusMeters =
    options.radiusMeters ??
    DEFAULT_RADIUS_METERS;


  if (
    !Number.isFinite(
      radiusMeters,
    ) ||
    radiusMeters <= 0 ||
    radiusMeters > MAX_RADIUS_METERS
  ) {

    return {
      ok: false,

      error: {
        code:
          'INVALID_RADIUS',

        message:
          `搜尋半徑必須大於 0 且不得超過 ${MAX_RADIUS_METERS} 公尺。`,
      },
    };
  }


  /*
   * ---------------------------------------------------------
   * 3. Max Results
   * ---------------------------------------------------------
   */

  const maxResults =
    options.maxResults ??
    DEFAULT_MAX_RESULTS;


  if (
    !Number.isInteger(
      maxResults,
    ) ||
    maxResults <= 0 ||
    maxResults > MAX_RESULTS
  ) {

    return {
      ok: false,

      error: {
        code:
          'INVALID_MAX_RESULTS',

        message:
          `搜尋結果數量必須介於 1～${MAX_RESULTS}。`,
      },
    };
  }


  /*
   * ---------------------------------------------------------
   * 4. API Key
   * ---------------------------------------------------------
   */

  const apiKey =
    getGoogleApiKey();


  if (
    !apiKey
  ) {

    return {
      ok: false,

      error: {
        code:
          'MISSING_API_KEY',

        message:
          '尚未設定 Google Places API Key。',
      },
    };
  }


  /*
   * ---------------------------------------------------------
   * 5. Request
   * ---------------------------------------------------------
   */

  const requestBody =
    buildRequestBody(
      coordinate,
      {
        ...options,

        radiusMeters,

        maxResults,
      },
    );


  try {

    const response =
      await fetch(
        PLACES_NEARBY_URL,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-Goog-Api-Key':
              apiKey,

            'X-Goog-FieldMask':
              [
                'places.id',
                'places.displayName',
                'places.formattedAddress',
                'places.location',
                'places.rating',
                'places.userRatingCount',
                'places.currentOpeningHours.openNow',
                'places.types',
                'places.googleMapsUri',
              ].join(','),
          },

          body:
            JSON.stringify(
              requestBody,
            ),
        },
      );


    /*
     * -------------------------------------------------------
     * HTTP Error
     * -------------------------------------------------------
     */

    if (
      !response.ok
    ) {

      let errorText =
        'Google Places API request failed.';


      try {

        const errorBody =
          await response.json();

        const apiMessage =
          optionalString(
            errorBody?.error?.message,
          );


        if (
          apiMessage
        ) {

          errorText =
            apiMessage;
        }

      } catch {
        /*
         * 無法解析錯誤內容時，
         * 保留通用錯誤訊息。
         */
      }


      if (
        response.status ===
        429
      ) {

        return {
          ok: false,

          error: {
            code:
              'QUOTA_EXCEEDED',

            message:
              errorText,
          },
        };
      }


      return {
        ok: false,

        error: {
          code:
            'API_ERROR',

          message:
            errorText,
        },
      };
    }


    /*
     * -------------------------------------------------------
     * JSON
     * -------------------------------------------------------
     */

    let data:
      any;


    try {

      data =
        await response.json();

    } catch {

      return {
        ok: false,

        error: {
          code:
            'INVALID_RESPONSE',

          message:
            'Google Places API 回傳內容不是有效 JSON。',
        },
      };
    }


    /*
     * -------------------------------------------------------
     * Places
     * -------------------------------------------------------
     */

    if (
      !Array.isArray(
        data?.places,
      )
    ) {

      return {
        ok: false,

        error: {
          code:
            'INVALID_RESPONSE',

          message:
            'Google Places API 回傳缺少 places。',
        },
      };
    }


    const places =
      data.places
        .map(
          (
            raw: any,
          ) =>
            normalizePlace(
              raw,
              coordinate,
            ),
        )
        .filter(
          (
            place:
              GooglePlaceResult |
              undefined,
          ): place is GooglePlaceResult =>
            place !== undefined,
        );


    return {
      ok: true,

      places:
        sortPlaces(
          places,
        ),
    };

  } catch (
    error
  ) {

    console.error(
      '[Google Places Service] Request failed:',
      error,
    );


    return {
      ok: false,

      error: {
        code:
          'NETWORK_ERROR',

        message:
          '無法連線至 Google Places API。',
      },
    };
  }
}


/**
 * =========================================================
 * Convenience Functions
 * =========================================================
 *
 * 讓上層 Action 不需要自己處理搜尋類型。
 *
 * =========================================================
 */

export async function searchNearbyRestaurants(
  coordinate:
    GooglePlacesCoordinate,

  options:
    Omit<
      GooglePlacesSearchOptions,
      'type'
    > = {},
):
  Promise<GooglePlacesServiceResult> {

  return searchNearbyPlaces(
    coordinate,
    {
      ...options,

      type:
        'restaurant',
    },
  );
}


export async function searchNearbyFood(
  coordinate:
    GooglePlacesCoordinate,

  options:
    Omit<
      GooglePlacesSearchOptions,
      'type'
    > = {},
):
  Promise<GooglePlacesServiceResult> {

  return searchNearbyPlaces(
    coordinate,
    {
      ...options,

      type:
        'food',
    },
  );
}


export async function searchNearbyCafes(
  coordinate:
    GooglePlacesCoordinate,

  options:
    Omit<
      GooglePlacesSearchOptions,
      'type'
    > = {},
):
  Promise<GooglePlacesServiceResult> {

  return searchNearbyPlaces(
    coordinate,
    {
      ...options,

      type:
        'cafe',
    },
  );
}