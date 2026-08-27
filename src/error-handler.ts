/*
 * 大內總管 — 錯誤處理
 *
 * 負責：
 * 1. 統一記錄錯誤
 * 2. 判斷是否可能是 Gemini / API 限流
 * 3. 提供依目前 Style 顯示的備援訊息
 *
 * 不負責：
 * - Persona
 * - Memory
 * - Observer
 * - LINE 事件判斷
 */

import fs from 'fs';
import path from 'path';

import {
  buildStyleResponse,
} from './styles/style-response';


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
 *
 * 同時：
 * 1. 顯示在終端機
 * 2. 寫入 logs/error.log
 */
export function logError(
  context: string,
  error: unknown,
): void {

  const type =
    classifyError(
      error,
    );

  const errorMessage =
    getErrorMessage(
      error,
    );

  const timestamp =
    new Date().toISOString();

  const logLine =
    `[${timestamp}] [${type}] ${context}: ${errorMessage}`;


  /*
   * 保留原本的終端機紀錄。
   */
  console.error(
    logLine,
    error,
  );


  /*
   * 寫入錯誤日誌。
   */
  try {

    const logDirectory =
      path.join(
        process.cwd(),
        'logs',
      );


    /*
     * 如果 logs 不存在，自動建立。
     */
    fs.mkdirSync(
      logDirectory,
      {
        recursive: true,
      },
    );


    const logFile =
      path.join(
        logDirectory,
        'error.log',
      );


    fs.appendFileSync(
      logFile,
      `${logLine}\n`,
      'utf8',
    );

  } catch (
    logWriteError
  ) {

    /*
     * 如果連錯誤日誌都寫不進去，
     * 至少把這個問題留在終端機。
     */
    console.error(
      '[unknown] 無法寫入錯誤日誌:',
      logWriteError,
    );
  }
}


/*
 * 提供給使用者看到的
 * 備援訊息。
 *
 * 注意：
 * 不把 API 技術錯誤暴露給家人。
 *
 * 不再在這裡寫死任何宮廷風格詞彙。
 *
 * 所有最終回覆統一經過
 * Style Response Layer，
 * 由目前 Active Style
 * 轉換成對應的語言風格。
 */
export function getFallbackMessage(
  error: unknown,
): string {

  const type =
    classifyError(
      error,
    );


  let content: string;


  switch (
    type
  ) {

    case 'rate_limit':
      content =
        '我這邊現在有點忙，晚一點再試一次。';
      break;

    case 'network':
      content =
        '我剛才好像斷線了一下，請再試一次。';
      break;

    case 'api':
      content =
        '我這邊出了點小問題，請再試一次。';
      break;

    case 'unknown':
    default:
      content =
        '我剛才好像失神了一下，請再試一次。';
      break;
  }


  return buildStyleResponse(
    content,
    {
      preserveContent: true,
    },
  );
}