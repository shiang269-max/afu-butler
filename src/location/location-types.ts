/**
 * =========================================================
 * Location Types
 * =========================================================
 *
 * 目前只負責描述 LINE 傳入的位置資料。
 *
 * 這一層不負責：
 * - Google API
 * - Places / Routes
 * - AI 意圖判斷
 * - 搜尋
 * - 額度
 *
 * 先把「LINE → Node.js」的位置資料獨立出來。
 * =========================================================
 */

export type LocationSourceType =
  | 'user'
  | 'group';

export interface LocationRecord {
  userId: string;

  title?: string;

  address?: string;

  latitude: number;

  longitude: number;

  sourceType: LocationSourceType;

  sourceGroupId?: string;

  updatedAt: string;
}