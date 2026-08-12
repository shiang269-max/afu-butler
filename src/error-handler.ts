/*
 * 大內總管 — 錯誤處理
 *
 * 負責：
 * 1. 統一記錄錯誤
 * 2. 判斷是否可能是 Gemini / API 限流
 * 3. 提供總管風格的備援訊息
 *
 * 不負責：
 * - Persona
 * - Memory
 * - Observer
 * - LINE 事件判斷
 */

export type ErrorType =
  | 'rate_limit'
  | 'network'
  | 'api'
  | 'unknown';


/*
 * 判斷錯誤類型。
 */
export function classifyError(
  error: unknown,
): ErrorType {

  const message =
    getErrorMessage(error).toLowerCase();


  /*
   * API 限流 / 額度。
   */
  if (
    message.includes('429') ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many requests')
  ) {
    return 'rate_limit';
  }


  /*
   * 網路或暫時性連線問題。
   */
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('socket')
  ) {
    return 'network';
  }


  /*
   * 一般 API 錯誤。
   */
  if (
    message.includes('api') ||
    message.includes('gemini') ||
    message.includes('line')
  ) {
    return 'api';
  }


  return 'unknown';
}


/*
 * 統一取得錯誤文字。
 */
export function getErrorMessage(
  error: unknown,
): string {

  if (
    error instanceof Error
  ) {
    return error.message;
  }


  if (
    typeof error === 'string'
  ) {
    return error;
  }


  try {
    return JSON.stringify(
      error,
    );
  } catch {
    return String(error);
  }
}


/*
 * 統一記錄錯誤。
 */
export function logError(
  context: string,
  error: unknown,
): void {

  const type =
    classifyError(error);

  console.error(
    `[${type}] ${context}:`,
    error,
  );
}


/*
 * 提供給使用者看到的
 * 總管式備援訊息。
 *
 * 注意：
 * 這些訊息故意保持簡短，
 * 不把 API 技術錯誤暴露給家人。
 */
export function getFallbackMessage(
  error: unknown,
): string {

  const type =
    classifyError(error);


  switch (type) {

    case 'rate_limit':
      return (
        '啟奏……內務府今日似乎也有點忙。'
      );


    case 'network':
      return (
        '啟奏……奴才剛才好像被風吹斷線了。'
      );


    case 'api':
      return (
        '啟奏……內務府出了點小差錯。'
      );


    case 'unknown':
    default:
      return (
        '啟奏……奴才剛才突然失神了一下。'
      );
  }
}