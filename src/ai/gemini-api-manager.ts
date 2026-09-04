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

class GeminiApiManager {

  private readonly keys: GeminiKeyState[];

  /*
   * 只在同步選 Key 階段遞增。
   * 不在 await 之後回寫共享索引，避免並發請求互相覆蓋。
   */
  private nextIndex = 0;

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
          this.nextIndex +
          offset
        ) % this.keys.length;

      const key =
        this.keys[index];

      if (
        key.failedUntil > now
      ) {
        continue;
      }

      /*
       * 選定後立即前移。
       * 這段沒有 await，因此不同並發請求不會同時拿到同一個輪替位置。
       */
      this.nextIndex =
        (index + 1) % this.keys.length;

      return key;
    }

    return null;
  }

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
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(
      '目前沒有可用的 Gemini API Key。',
    );
  }

  createClient(): GoogleGenAI {
    const manager =
      this;

    const firstKey =
      this.keys[
        this.nextIndex % this.keys.length
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

export const geminiApiManager =
  new GeminiApiManager();

export function getGeminiClient():
  GoogleGenAI {
  return geminiApiManager.createClient();
}
