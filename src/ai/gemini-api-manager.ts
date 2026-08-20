import 'dotenv/config';

import { GoogleGenAI } from '@google/genai';

interface GeminiKeyConfig {
  name: string;
  apiKey: string;
}

interface GeminiKeyState {
  config: GeminiKeyConfig;
  client: GoogleGenAI;
  failedUntil: number;
}

const KEY_COOLDOWN_MS = 60_000;

function isKeyRelatedError(error: unknown): boolean {
  const record =
    typeof error === 'object' &&
    error !== null
      ? error as Record<string, unknown>
      : {};

  const status =
    record.status ??
    record.statusCode ??
    record.httpStatus;

  const code =
    record.code;

  const message =
    error instanceof Error
      ? error.message
      : typeof record.message === 'string'
        ? record.message
        : String(error);

  const text =
    message.toLowerCase();

  /*
   * =======================================================
   * HTTP 429 / Gemini RESOURCE_EXHAUSTED
   * =======================================================
   */

  if (
    status === 429 ||
    code === 429 ||
    text.includes('resource_exhausted') ||
    text.includes('resource exhausted') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('too many requests')
  ) {
    return true;
  }

  /*
   * =======================================================
   * API Key / 授權相關錯誤
   * =======================================================
   */

  const keyErrorPatterns = [
    'api key',
    'apikey',
    'invalid key',
    'key disabled',
    'key expired',
    'unauthorized',
    'authentication',
    'permission denied',
    'permission_denied',
    'forbidden',
  ];

  return keyErrorPatterns.some(
    (pattern) =>
      text.includes(pattern),
  );
}


/**
 * =========================================================
 * Gemini API Manager
 * =========================================================
 *
 * 主要目的：
 *
 * 1. 管理多組 Gemini API Key
 * 2. 正常情況使用目前 Key
 * 3. 遇到：
 *    - 429
 *    - quota
 *    - RESOURCE_EXHAUSTED
 *    - rate limit
 *    - API Key 錯誤
 *    - authentication
 *    - permission
 *
 *    自動切換其他 Key
 *
 * 4. 不需要修改既有：
 *    gemini.models.generateContent(...)
 *
 * 5. Key 冷卻一段時間後可以重新使用。
 *
 * 這樣可以把「Key 故障保護」
 * 與既有 AI Core / Reminder / Observer
 * 完全分離。
 * =========================================================
 */

class GeminiApiManager {

  private readonly keys: GeminiKeyState[];

  private currentIndex = 0;


  constructor() {

    const configs: GeminiKeyConfig[] = [];

    const primaryKey =
      process.env.GEMINI_API_KEY?.trim();

    const backupKey =
      process.env.GEMINI_BACKUP_API_KEY?.trim();


    if (primaryKey) {
      configs.push({
        name: 'Primary',
        apiKey: primaryKey,
      });
    }


    if (backupKey) {
      configs.push({
        name: 'Backup',
        apiKey: backupKey,
      });
    }


    if (configs.length === 0) {
      throw new Error(
        '找不到 Gemini API Key。',
      );
    }


    this.keys =
      configs.map(
        (config) => ({
          config,

          client:
            new GoogleGenAI({
              apiKey:
                config.apiKey,
            }),

          failedUntil:
            0,
        }),
      );


    console.log(
      `[Gemini API Manager] 已載入 ${this.keys.length} 組 Key。`,
    );
  }


  /**
   * =======================================================
   * 取得目前可使用的 Key
   * =======================================================
   */

  private getAvailableKey():
    GeminiKeyState | null {

    const now =
      Date.now();


    for (
      let offset = 0;
      offset < this.keys.length;
      offset += 1
    ) {

      const index =
        (
          this.currentIndex +
          offset
        ) % this.keys.length;


      const key =
        this.keys[index];


      if (
        key.failedUntil > now
      ) {
        continue;
      }


      this.currentIndex =
        index;


      return key;
    }


    return null;
  }


  /**
   * =======================================================
   * Key 暫時失效
   * =======================================================
   */

  private markFailed(
    key: GeminiKeyState,
  ): void {

    key.failedUntil =
      Date.now() +
      KEY_COOLDOWN_MS;


    console.warn(
      `[Gemini API Manager] ${key.config.name} 暫時不可用，60 秒內切換其他 Key。`,
    );
  }


  /**
   * =======================================================
   * 執行 Gemini API
   * =======================================================
   */

  async execute<T>(
    operation: (
      gemini: GoogleGenAI,
    ) => Promise<T>,
  ): Promise<T> {

    const attempted =
      new Set<GeminiKeyState>();


    let lastError:
      unknown = null;


    while (
      attempted.size <
      this.keys.length
    ) {

      const key =
        this.getAvailableKey();


      if (!key) {
        break;
      }


      if (
        attempted.has(key)
      ) {
        break;
      }


      attempted.add(key);


      try {

        console.log(
          `[Gemini API Manager] 使用 ${key.config.name} Key`,
        );


        const result =
          await operation(
            key.client,
          );


        return result;

      } catch (error) {

        lastError =
          error;


        /*
         * 不是 Key / 額度 / 限流問題。
         *
         * 不切換 Key，
         * 直接把原始錯誤交回上層。
         */

        if (
          !isKeyRelatedError(
            error,
          )
        ) {
          throw error;
        }


        this.markFailed(
          key,
        );


        /*
         * 從下一把 Key 開始。
         */

        this.currentIndex =
          (
            this.currentIndex + 1
          ) % this.keys.length;
      }
    }


    if (lastError) {
      throw lastError;
    }


    throw new Error(
      '目前沒有可用的 Gemini API Key。',
    );
  }


  /**
   * =======================================================
   * 建立相容既有架構的 Gemini Client
   * =======================================================
   *
   * 既有程式全部仍然可以：
   *
   * gemini.models.generateContent(...)
   *
   * 不需要逐個模組修改。
   *
   * 真正執行 generateContent 時，
   * 會自動進入 execute()，
   * 因此發生 Key / 429 / quota 問題時
   * 可以自動換下一把 Key。
   * =======================================================
   */

  createClient(): GoogleGenAI {

    const manager =
      this;


    const firstKey =
      this.keys[
        this.currentIndex
      ];


    if (!firstKey) {
      throw new Error(
        '目前沒有可用的 Gemini API Key。',
      );
    }


    const proxyClient =
      new Proxy(
        firstKey.client,
        {
          get(
            target,
            property,
            receiver,
          ) {

            if (
              property !== 'models'
            ) {
              return Reflect.get(
                target,
                property,
                receiver,
              );
            }


            return new Proxy(
              Reflect.get(
                target,
                property,
                receiver,
              ),
              {
                get(
                  modelsTarget,
                  modelsProperty,
                  modelsReceiver,
                ) {

                  if (
                    modelsProperty !==
                    'generateContent'
                  ) {
                    return Reflect.get(
                      modelsTarget,
                      modelsProperty,
                      modelsReceiver,
                    );
                  }


                  return async (
                    request: Parameters<
                      GoogleGenAI['models']['generateContent']
                    >[0],
                  ) => {

                    return manager.execute(
                      (
                        activeGemini,
                      ) =>
                        activeGemini.models.generateContent(
                          request,
                        ),
                    );
                  };
                },
              },
            );
          },
        },
      );


    return proxyClient;
  }


  /**
   * =======================================================
   * Key 狀態
   * =======================================================
   */

  getStatus(): Array<{
    name: string;
    available: boolean;
  }> {

    const now =
      Date.now();


    return this.keys.map(
      (key) => ({
        name:
          key.config.name,

        available:
          key.failedUntil <= now,
      }),
    );
  }
}


/**
 * =========================================================
 * Singleton
 * =========================================================
 */

export const geminiApiManager =
  new GeminiApiManager();


/**
 * =========================================================
 * 對外提供既有程式使用的 Gemini Client
 * =========================================================
 */

export function getGeminiClient():
  GoogleGenAI {

  return geminiApiManager.createClient();
}