/**
 * =========================================================
 * Location Handler
 * =========================================================
 *
 * 只處理 LINE location message。
 *
 * 流程：
 *
 * LINE location event
 *        ↓
 * 解析 location
 *        ↓
 * Location State
 *
 * 這裡刻意不碰：
 * - Gemini
 * - AI Core
 * - Reminder
 * - Observer
 * - Google API
 * - Places / Routes
 *
 * 後續 Node.js Action Layer 可以直接使用 Location State。
 * =========================================================
 */

import {
  setLatestLocation,
} from './location-state';

import {
  LocationRecord,
} from './location-types';

export interface LocationEventResult {
  handled: boolean;

  location?: LocationRecord;

  reason?: string;
}

export function handleLocationMessage(
  event: any,
): LocationEventResult {

  if (
    event?.type !== 'message' ||
    event?.message?.type !== 'location'
  ) {
    return {
      handled: false,
      reason: 'not-location-message',
    };
  }

  const userId =
    typeof event?.source?.userId === 'string'
      ? event.source.userId.trim()
      : '';

  const latitude =
    Number(event?.message?.latitude);

  const longitude =
    Number(event?.message?.longitude);

  if (
    !userId ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return {
      handled: false,
      reason: 'invalid-location-message',
    };
  }

  const sourceType =
    event?.source?.type === 'group'
      ? 'group' as const
      : 'user' as const;

  const location: LocationRecord = {
    userId,

    title:
      typeof event?.message?.title === 'string' &&
      event.message.title.trim()
        ? event.message.title.trim()
        : undefined,

    address:
      typeof event?.message?.address === 'string' &&
      event.message.address.trim()
        ? event.message.address.trim()
        : undefined,

    latitude,

    longitude,

    sourceType,

    sourceGroupId:
      sourceType === 'group' &&
      typeof event?.source?.groupId === 'string'
        ? event.source.groupId
        : undefined,

    updatedAt:
      new Date().toISOString(),
  };

  setLatestLocation(
    location,
  );

  return {
    handled: true,
    location,
  };
}