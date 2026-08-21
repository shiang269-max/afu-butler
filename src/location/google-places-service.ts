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
  | 'store'
  | 'convenience_store'
  | 'gas_station';


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

  /** Google Places 回傳的主要類型，用於結果品質過濾。 */
  primaryType?: string;

  /** 加油站專用：Google 回傳的燃料種類。 */
  fuelTypes?: string[];

  googleMapsUri?: string;
}


export interface GooglePlacesSearchOptions {
  radiusMeters?: number;

  maxResults?: number;

  type?: GooglePlacesSearchType;

  query?: string;

  rankByDistance?: boolean;
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
 * Google Places request timeout.
 *
 * 避免單次 Google API 請求長時間等待，
 * 導致 LINE Location Handler 看起來像整個死機。
 */
const GOOGLE_PLACES_REQUEST_TIMEOUT_MS =
  10000;


/**
 * =========================================================
 * Development Diagnostic Trace
 * =========================================================
 *
 * 目前只用於 Location / Places 實測。
 * 不記錄 API Key。
 * 不改變搜尋邏輯、搜尋參數或回傳結果。
 *
 * =========================================================
 */

const LOCATION_PLACES_DEBUG =
  true;


function placesDebug(
  label: string,
  data?: unknown,
): void {

  if (
    !LOCATION_PLACES_DEBUG
  ) {
    return;
  }

  console.log(
    `[Google Places Debug] ${label}`,
    data === undefined
      ? ''
      : JSON.stringify(
          data,
          null,
          2,
        ),
  );
}


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


const PLACES_TEXT_SEARCH_URL =
  'https://places.googleapis.com/v1/places:searchText';


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

    rankPreference:
      options.rankByDistance === false
        ? 'POPULARITY'
        : 'DISTANCE',

    languageCode:
      'zh-TW',

    regionCode:
      'TW',
  };
}


function buildTextSearchRequestBody(
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

  const query =
    typeof options.query === 'string'
      ? options.query.trim()
      : '';

  const body:
    Record<string, unknown> = {

    textQuery:
      query,

    maxResultCount:
      maxResults,

    locationBias: {
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

    rankPreference:
      options.rankByDistance === false
        ? 'RELEVANCE'
        : 'DISTANCE',

    languageCode:
      'zh-TW',

    regionCode:
      'TW',
  };

  /*
   * 有 query 時以文字搜尋意圖為主。
   *
   * 例如「火鍋」：
   *   textQuery = 火鍋
   *
   * 不再強制 strictTypeFiltering=restaurant，
   * 避免 Google 將有效的火鍋店結果過度過濾，
   * 造成「無法取得附近店家資訊」。
   *
   * 沒有 query 時才使用 type 作為明確類型篩選。
   */
  if (
    options.type &&
    !query
  ) {

    body.includedType =
      options.type;

    body.strictTypeFiltering =
      true;
  }

  return body;
}


/**
 * =========================================================
 * Taiwan Address Normalization
 * =========================================================
 *
 * Google Places 偶爾仍可能回傳英文格式地址。
 *
 * 原則：
 * 1. 優先使用 Google 的 zh-TW formattedAddress。
 * 2. 若仍是明顯英文地址，不把英文地址直接丟給使用者。
 * 3. 沒有可靠的中文轉換資料時，寧可不顯示地址。
 *
 * 地址不是搜尋結果的核心資訊，因此不為了「一定要有地址」
 * 而自行猜測或翻譯道路名稱。
 * =========================================================
 */

function normalizeTaiwanAddress(
  formattedAddress:
    string |
    undefined,

  shortFormattedAddress:
    string |
    undefined,

  addressComponents:
    any[] |
    undefined,
):
  string |
  undefined {

  const candidates = [
    formattedAddress,
    shortFormattedAddress,
  ].filter(
    (
      value,
    ): value is string =>
      typeof value === 'string' &&
      value.trim().length > 0,
  );

  /*
   * Google 已依 zh-TW 回傳中文時直接採用。
   */
  const chineseAddress =
    candidates.find(
      (value) =>
        /[\u3400-\u9fff]/.test(value),
    );

  if (
    chineseAddress
  ) {
    return chineseAddress.trim();
  }

  /*
   * 若 formattedAddress 仍是英文，嘗試使用
   * addressComponents 的中文 longText。
   *
   * 這不是自行翻譯，因此不會猜測道路名稱。
   */
  if (
    Array.isArray(addressComponents)
  ) {
    const parts =
      addressComponents
        .map(
          (component: any) =>
            optionalString(
              component?.longText,
            ),
        )
        .filter(
          (value): value is string =>
            typeof value === 'string' &&
            /[\u3400-\u9fff]/.test(value),
        );

    if (
      parts.length
    ) {
      return [
        ...new Set(parts),
      ].join('');
    }
  }

  /*
   * 沒有可靠的繁體中文地址時不輸出英文地址。
   */
  return undefined;
}


function extractFuelTypes(
  raw:
    any,
): string[] {

  const fuelPrices =
    Array.isArray(
      raw?.fuelOptions?.fuelPrices,
    )
      ? raw.fuelOptions.fuelPrices
      : [];

  return fuelPrices
    .map(
      (item: any) =>
        optionalString(
          item?.type,
        ),
    )
    .filter(
      (value: unknown): value is string =>
        typeof value === 'string',
    );
}


function isPureGasOnlyStation(
  raw:
    any,
): boolean {

  const primaryType =
    optionalString(
      raw?.primaryType,
    );

  const types =
    Array.isArray(raw?.types)
      ? raw.types.filter(
          (value: unknown): value is string =>
            typeof value === 'string',
        )
      : [];

  const fuelTypes =
    extractFuelTypes(
      raw,
    );

  const gasOnlyFuelTypes =
    fuelTypes.length > 0 &&
    fuelTypes.every(
      (fuelType) =>
        fuelType === 'LPG' ||
        fuelType === 'METHANE',
    );

  const name =
    optionalString(
      raw?.displayName?.text,
    ) || '';

  const obviousGasOnlyName =
    /(加氣|加气|天然氣|天然气|CNG|LPG|LNG)/i.test(
      name,
    );

  return (
    gasOnlyFuelTypes ||
    (
      obviousGasOnlyName &&
      primaryType !== 'gas_station' &&
      !types.includes('gas_station')
    )
  );
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
      normalizeTaiwanAddress(
        optionalString(
          raw.formattedAddress,
        ),
        optionalString(
          raw.shortFormattedAddress,
        ),
        Array.isArray(
          raw.addressComponents,
        )
          ? raw.addressComponents
          : undefined,
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

    primaryType:
      optionalString(
        raw.primaryType,
      ),

    fuelTypes:
      extractFuelTypes(
        raw,
      ),

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

const hasQuery =
    typeof options.query === 'string' &&
    options.query.trim().length > 0;

  const requestUrl =
    hasQuery
      ? PLACES_TEXT_SEARCH_URL
      : PLACES_NEARBY_URL;

  const requestBody =
    hasQuery
      ? buildTextSearchRequestBody(
          coordinate,
          {
            ...options,
            radiusMeters,
            maxResults,
          },
        )
      : buildRequestBody(
          coordinate,
          {
            ...options,
            radiusMeters,
            maxResults,
          },
        );


    placesDebug(
      'REQUEST',
      {
        endpoint:
          hasQuery
            ? 'searchText'
            : 'searchNearby',

        requestUrl,

        coordinate,

        options: {
          ...options,
        },

        effectiveRadiusMeters:
          radiusMeters,

        effectiveMaxResults:
          maxResults,

        requestBody,
      },
    );



  let timeout:
    ReturnType<typeof setTimeout> | undefined;


  try {

    const controller =
      new AbortController();

    timeout =
      setTimeout(
        () =>
          controller.abort(),
        GOOGLE_PLACES_REQUEST_TIMEOUT_MS,
      );


    placesDebug(
      'FETCH_START',
      {
        timeoutMs:
          GOOGLE_PLACES_REQUEST_TIMEOUT_MS,
      },
    );


    const response =
  await fetch(
    requestUrl,
    {
      method:
        'POST',

      signal:
        controller.signal,

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
                'places.shortFormattedAddress',
                'places.addressComponents',
                'places.location',
                'places.rating',
                'places.userRatingCount',
                'places.currentOpeningHours.openNow',
                'places.types',
                'places.primaryType',
                'places.fuelOptions',
                'places.googleMapsUri',
              ].join(','),
          },

          body:
            JSON.stringify(
              requestBody,
            ),
        },
      );


    
    placesDebug(
      'HTTP_RESPONSE',
      {
        status:
          response.status,

        statusText:
          response.statusText,

        ok:
          response.ok,
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

        clearTimeout(
          timeout,
        );

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


      clearTimeout(
        timeout,
      );

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

    placesDebug(
      'JSON_PARSED',
      {
        hasPlaces:
          Array.isArray(
            data?.places,
          ),

        placeCount:
          Array.isArray(
            data?.places,
          )
            ? data.places.length
            : undefined,
      },
    );



    } catch {

      clearTimeout(
        timeout,
      );

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


    placesDebug(
      'RAW_RESPONSE_SUMMARY',
      {
        placeCount:
          data.places.length,

        places:
          data.places.map(
            (raw: any) => ({
              id:
                optionalString(
                  raw?.id,
                ),

              name:
                optionalString(
                  raw?.displayName?.text,
                ),

              formattedAddress:
                optionalString(
                  raw?.formattedAddress,
                ),

              latitude:
                toFiniteNumber(
                  raw?.location?.latitude,
                ),

              longitude:
                toFiniteNumber(
                  raw?.location?.longitude,
                ),

              rating:
                toFiniteNumber(
                  raw?.rating,
                ),

              primaryType:
                optionalString(
                  raw?.primaryType,
                ),

              types:
                Array.isArray(
                  raw?.types,
                )
                  ? raw.types
                  : [],

              fuelTypes:
                extractFuelTypes(
                  raw,
                ),

              googleMapsUri:
                optionalString(
                  raw?.googleMapsUri,
                ),
            }),
          ),
      },
    );


    const rawPlaces =
      data.places.filter(
        (raw: any) => {

          if (
            options.type !== 'gas_station'
          ) {
            return true;
          }

          const primaryType =
            optionalString(
              raw?.primaryType,
            );

          const types =
            Array.isArray(raw?.types)
              ? raw.types.filter(
                  (value: unknown): value is string =>
                    typeof value === 'string',
                )
              : [];

          const isActualGasStation =
            primaryType === 'gas_station' ||
            types.includes('gas_station');

          if (
            !isActualGasStation
          ) {
            return false;
          }

          return !isPureGasOnlyStation(
            raw,
          );
        },
      );

    const normalizedPlaces =
      rawPlaces
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

    placesDebug(
      'NORMALIZED_RESULTS',
      {
        count:
          normalizedPlaces.length,

        places:
          normalizedPlaces.map(
            (place: GooglePlaceResult) => ({
              placeId:
                place.placeId,

              name:
                place.name,

              address:
                place.address,

              latitude:
                place.latitude,

              longitude:
                place.longitude,

              distanceMeters:
                place.distanceMeters,

              rating:
                place.rating,

              primaryType:
                place.primaryType,

              types:
                place.types,

              fuelTypes:
                place.fuelTypes,
            }),
          ),
      },
    );


    /*
     * 同一 place 可能因 Google 搜尋結果特性重複出現。
     * 回覆前以 placeId 去重，再做真正直線距離排序。
     */
    const uniquePlaces: GooglePlaceResult[] =
      Array.from(
        new Map<string, GooglePlaceResult>(
          normalizedPlaces.map(
            (place: GooglePlaceResult) => [
              place.placeId,
              place,
            ],
          ),
        ).values(),
      );

    const sortedPlaces =
      sortPlaces(
        uniquePlaces,
      );

    const finalPlaces =
      sortedPlaces.slice(
        0,
        maxResults,
      );


    /*
     * 加油站是高風險的 POI 類型。
     * 如果經過嚴格 gas_station 過濾後完全沒有真實結果，
     * 不把空陣列當成成功，避免上層再讓 AI 自行補一個店家。
     */
    if (
      options.type === 'gas_station' &&
      finalPlaces.length === 0
    ) {

      clearTimeout(
        timeout,
      );

      return {
        ok: false,

        error: {
          code:
            'API_ERROR',

          message:
            'Google Places 沒有回傳符合條件的真正加油站。',
        },
      };
    }


    clearTimeout(
      timeout,
    );

    placesDebug(
      'FINAL_RESULTS',
      {
        uniqueCount:
          uniquePlaces.length,

        returnedCount:
          finalPlaces.length,

        places:
          finalPlaces.map(
            (place: GooglePlaceResult) => ({
              placeId:
                place.placeId,

              name:
                place.name,

              address:
                place.address,

              distanceMeters:
                place.distanceMeters,

              rating:
                place.rating,

              primaryType:
                place.primaryType,

              types:
                place.types,

              fuelTypes:
                place.fuelTypes,
            }),
          ),
      },
    );


    return {
      ok: true,

      places:
        finalPlaces,
    };

  } catch (
    error
  ) {

    if (
      timeout !== undefined
    ) {
      clearTimeout(
        timeout,
      );
    }

    const isTimeout =
      error instanceof Error &&
      error.name === 'AbortError';


    console.error(
      '[Google Places Service] Request failed:',
      error,
    );


    placesDebug(
      isTimeout
        ? 'FETCH_TIMEOUT'
        : 'FETCH_ERROR',
      {
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );


    return {
      ok: false,

      error: {
        code:
          'NETWORK_ERROR',

        message:
          isTimeout
            ? `Google Places API 超過 ${GOOGLE_PLACES_REQUEST_TIMEOUT_MS / 1000} 秒未回應。`
            : '無法連線至 Google Places API。',
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