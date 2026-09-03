import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

import { SYSTEM_INSTRUCTION } from './persona';
import { FAMILY_MEMBERS } from './family';

import {
  getActiveCallNames,
  hasCallName,
  cleanCallNames,
  isCallNameHelpIntent,
  buildActiveCallNamesHelpMessage,
} from './call-names';

import {
  handleVoteMessage,
} from './vote-handler';
import { resolveFamilyTarget } from './family-resolver';

import {
  handleFunctionHelp,
} from './function-help';

import {
  handleStyleSwitch,
} from './style-switch';

import {
  handleReminderMessage,
} from './reminder-handler';

import {
  loadFamilyGroupId,
} from './family-group-state';

import {
  startProactiveScheduler,
  recordFamilyGroupMessage,
} from './proactive-scheduler';

import {
  addToMemory,
  buildConversationPrompt,
  getConversationKey,
  getMemory,
} from './memory';

import {
  observeMessage,
  isObserverMuteCommand,
  isObserverUnmuteCommand,
  muteObserver,
  unmuteObserver,
} from './observer';

import {
  runAiCore,
} from './ai/ai-core';

import {
  geminiApiManager,
} from './ai/gemini-api-manager';

import {
  buildAiContext,
  normalizeConversationMessages,
} from './ai/ai-context';

import {
  getFallbackMessage,
  logError,
} from './error-handler';

import {
  getQuotaSnapshot,
  formatQuotaSummary,
} from './line-quota';

import {
  handleLocationMessage,
} from './location/location-handler';

import {
  getLatestLocation,
} from './location/location-state';

import {
  handleHomeRouteRequest,
} from './location/location-route-handler';

import {
  handleLocationIntent,
  canExecuteLocationIntent,
} from './location/location-intent-handler';

import {
  handleLocationPlacesAction,
} from './location/location-places-action-handler';

import {
  buildStyleResponse,
} from './styles/style-response';

import {
  familyMemoryIntegration,
} from './family-memory-integration';

import {
  routeFamilyMemoryMessage,
} from './family-memory-route-boundary';

import {
  buildFamilyMemoryResponse,
} from './family-memory-response';


/**
 * =========================================================
 * 環境設定
 * =========================================================
 */

dotenv.config();


const app =
  express();


const PORT =
  process.env.PORT || 3000;


const channelAccessToken =
  process.env.LINE_CHANNEL_ACCESS_TOKEN || '';


const channelSecret =
  process.env.LINE_CHANNEL_SECRET || '';


const geminiApiKey =
  process.env.GEMINI_API_KEY || '';


const lineClient =
  new messagingApi.MessagingApiClient({
    channelAccessToken,
  });


const lineMiddleware =
  middleware({
    channelSecret,
  });


const gemini =
  new GoogleGenAI({
    apiKey: geminiApiKey,
  });


/**
 * =========================================================
 * 家庭目標意圖判斷
 * =========================================================
 *
 * 私訊與群組共用同一套目標辨識邏輯。
 *
 * 但不能看到「大家」兩個字就直接當成 @ALL，
 * 否則一般聊天例如：
 *
 * 「大家今天吃飯了嗎」
 *
 * 也可能被誤判。
 *
 * 因此只有在明確情境下，
 * 才進入 family-resolver。
 * =========================================================
 */


const ALL_TARGET_WORDS = [
  '所有人',
  '大家',
  '全家人',
  '全員',
];


const FAMILY_TARGET_ACTION_WORDS = [
  '幫我叫',
  '幫忙叫',
  '替我叫',
  '請叫',
  '叫',
  '找',
  '聯絡',
  '通知',
  '提醒',
  '告訴',
  '跟',
  '向',
  '對',
];


const FAMILY_GREETING_WORDS = [
  '晚安',
  '早安',
  '午安',
  '早上好',
  '晚上好',
];


function hasFamilyTargetIntent(
  message: string,
): boolean {

  const text =
    message.trim();


  if (!text) {
    return false;
  }


  const hasAllTarget =
    ALL_TARGET_WORDS.some(
      (word) =>
        text.includes(word),
    );


  const hasGreeting =
    FAMILY_GREETING_WORDS.some(
      (word) =>
        text.includes(word),
    );


  const hasAction =
    FAMILY_TARGET_ACTION_WORDS.some(
      (word) =>
        text.includes(word),
    );


  if (
    hasAllTarget &&
    hasGreeting
  ) {
    return true;
  }


  if (
    hasAllTarget &&
    hasAction
  ) {
    return true;
  }


  if (
    ALL_TARGET_WORDS.some(
      (word) =>
        text === word,
    )
  ) {
    return true;
  }


  const hasKnownFamilyMember =
    Object.values(
      FAMILY_MEMBERS,
    ).some(
      (member: any) => {
        const identity =
          typeof member?.identity === 'string'
            ? member.identity
            : '';

        const mentionName =
          typeof member?.mentionName === 'string'
            ? member.mentionName
            : '';

        return (
          (identity && text.includes(identity)) ||
          (mentionName && text.includes(mentionName))
        );
      },
    );


  if (
    hasKnownFamilyMember &&
    (hasGreeting || hasAction)
  ) {
    return true;
  }


  return false;
}


/**
 * =========================================================
 * Reminder 呼叫詞
 * =========================================================
 */

function hasReminderInvocation(
  message: string,
): boolean {

  const text =
    message.trim();


  if (!text) {
    return false;
  }


  /*
   * 明確的 Family Memory 寫入指令不能先被 Reminder 攔截。
   * 例如：
   * - 阿福，記住媽媽喜歡吃火鍋
   * - 阿福記得媽媽喜歡吃火鍋
   * - 阿福記下媽媽喜歡吃火鍋
   *
   * Memory 位於 Reminder 後方，因此在這裡先排除。
   */
  if (/^(?:阿福[，,、]?\s*)?(?:請)?(?:幫我)?(?:記住|記得|記下|保存|存下)/u.test(text)) {
    return false;
  }


  return getActiveCallNames().some(
    (callName) =>
      text.startsWith(callName),
  );
}
