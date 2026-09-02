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


  /*
   * 「大家晚安」
   * 「全家人早安」
   */

  if (
    hasAllTarget &&
    hasGreeting
  ) {
    return true;
  }


  /*
   * 「幫我叫大家」
   * 「通知所有人」
   */

  if (
    hasAllTarget &&
    hasAction
  ) {
    return true;
  }


  /*
   * 「大家」
   * 「全家人」
   * 「所有人」
   */

  if (
    ALL_TARGET_WORDS.some(
      (word) =>
        text === word,
    )
  ) {
    return true;
  }


  /*
   * 已登記家庭成員的直接稱呼。
   *
   * 例如：
   *
   * 「小兒子晚安」
   * 「叫小兒子」
   * 「小兒子」
   */

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


  return getActiveCallNames().some(
    (callName) =>
      text.startsWith(callName),
  );
}


/**
 * =========================================================
 * 清除有效呼叫詞
 * =========================================================
 *
 * 呼叫詞統一由：
 *
 * src/call-names.ts
 *
 * 動態管理。
 *
 * 這裡不得再寫死任何特定 Style 的呼叫詞，
 * 避免切換風格後無法正確清除目前有效名稱。
 *
 * =========================================================
 */

function cleanTriggerWords(
  message: string,
): string {

  return cleanCallNames(
    message,
  );
}


/**
 * =========================================================
 * 家庭成員轉換
 * =========================================================
 */

function buildFamilyMemberContexts() {

  return Object.values(
    FAMILY_MEMBERS,
  ).map(
    (member: any) => {

      return {
        userId:
          member.userId ?? '',

        identity:
          member.identity ?? '',

        role:
          member.role,

        authority:
          member.authority,

        personality:
          member.personality,

        interaction:
          member.interaction,

        mentionName:
          member.mentionName,

        aliases:
          Array.isArray(member.aliases)
            ? member.aliases
            : [],
      };
    },
  );
}


/**
 * =========================================================
 * 建立 AI Context
 * =========================================================
 *
 * 重要：
 *
 * Memory 的實際資料結構目前使用：
 *
 * {
 *   role: 'user' | 'assistant',
 *   text: '...'
 * }
 *
 * 不在 index.ts 自己重新猜測 Memory 欄位。
 *
 * 直接交給 ai-context.ts：
 *
 * normalizeConversationMessages()
 *
 * 它目前已經能處理：
 *
 * - content
 * - text
 * - message
 *
 * 因此 Memory 與 AI Context 的格式轉換
 * 集中由 ai-context.ts 負責。
 *
 * 這次修正的核心就在這裡。
 * =========================================================
 */

/**
 * =========================================================
 * Vote option generator
 * =========================================================
 *
 * This is only an AI utility for generating candidate options.
 * It deliberately does NOT use SYSTEM_INSTRUCTION / Persona,
 * so the vote core remains independent of personality and style.
 *
 * The returned data is parsed into plain option strings and
 * passed into vote-handler.ts / vote.ts.
 * =========================================================
 */

async function generateVoteOptions(
  prompt: string,
): Promise<string[]> {

  try {

    const response =
      await geminiApiManager.execute(
        async (gemini) => {

          return gemini.models.generateContent(
            {
              model:
                'gemini-3.5-flash-lite',

              contents:
                [
                  '你是一個候選項目產生器。',
                  '',
                  '請根據下面的投票題目提供 4 個合理、彼此不同、適合實際家庭決策的候選項目。',
                  '只輸出候選項目。',
                  '每行一個。',
                  '不要編號。',
                  '不要解釋。',
                  '不要輸出其他文字。',
                  '',
                  prompt,
                ].join('\n'),
            },
          );
        },
      );


    return (
      response.text
        ?.split(/\r?\n/)
        .map(
          (line) =>
            line
              .replace(
                /^\s*(?:[-*•]|\d+[.)、．])\s*/,
                '',
              )
              .trim(),
        )
        .filter(
          Boolean,
        )
        .slice(0, 4)
      || []
    );

  } catch (error) {

    logError(
      'Vote 選項產生失敗',
      error,
    );


    return [];

  }

}


function createAiContext(
  event: any,
  familyMember: any,
  historyBeforeMessage: any[],
  currentMessage: string,
) {

  const conversationType =
    event.source.type === 'group'
      ? 'group' as const
      : 'private' as const;


  /*
   * =======================================================
   * Memory → AI Conversation Messages
   * =======================================================
   *
   * 不再直接讀 message.content。
   *
   * 由 normalizeConversationMessages()
   * 正確處理目前 Memory 的 text 欄位。
   * =======================================================
   */

  const recentMessages =
    normalizeConversationMessages(
      historyBeforeMessage,
    );


  const latestLocation =
    getLatestLocation(
      event.source.userId,
    );


  return buildAiContext({

    conversationType,

    groupId:
      event.source.type === 'group'
        ? event.source.groupId
        : undefined,

    speakerUserId:
      event.source.userId,

    speaker:
      familyMember
        ? {
            userId:
              event.source.userId || '',

            identity:
              familyMember.identity,

            role:
              familyMember.role,

            authority:
              familyMember.authority,

            personality:
              familyMember.personality,

            interaction:
              familyMember.interaction,

            mentionName:
              familyMember.mentionName,
          }
        : undefined,

    familyMembers:
      buildFamilyMemberContexts(),

    recentMessages,

    location:
      latestLocation
        ? {
            userId:
              latestLocation.userId,

            name:
              latestLocation.title,

            address:
              latestLocation.address,

            latitude:
              latestLocation.latitude,

            longitude:
              latestLocation.longitude,

            sourceType:
              latestLocation.sourceType,

            sourceGroupId:
              latestLocation.sourceGroupId,

            updatedAt:
              latestLocation.updatedAt,
          }
        : undefined,

    currentMessage,
  });

}


/**
 * =========================================================
 * 主動訊息產生器
 * =========================================================
 */

async function generateProactiveReply(
  type:
    | 'good-night'
    | 'silence',
): Promise<string> {

  if (
    type === 'good-night'
  ) {

    return buildStyleResponse(
      '諸位，夜深了，奴才先向各位道一聲晚安。' +
      '若還有什麼吩咐，隨時喚奴才一聲便是。',
    );

  }


  const response =
    await gemini.models.generateContent(
      {
        model:
          'gemini-3.5-flash-lite',

        contents: `
你現在是這個家庭的「大內總管」。

目前家庭群組已經連續一段時間沒有人說話。

你現在要主動打破冷清。

請只說一句自然、簡短、有總管性格的話。

可以像是在宮門口主動探頭看看眾人是否還醒著，
可以帶一點幽默、關心或宮廷感。

不要提到：

- 系統
- 排程
- 冷場
- 三小時
- 監控
- 程式
- AI

不要說自己需要休息或要下線。

不要假裝有人剛剛叫你。

直接輸出要在家庭群組中說的那一句話。
        `.trim(),

        config: {
          systemInstruction:
            SYSTEM_INSTRUCTION,
        },
      },
    );


  return (
    response.text?.trim() ||
    buildStyleResponse('諸位都如此安靜，奴才倒有些不習慣了。')
  );

}


/**
 * =========================================================
 * Proactive Scheduler
 * =========================================================
 */

startProactiveScheduler(
  lineClient,
  generateProactiveReply,
);


app.listen(
  PORT,
  () => {

    console.log(
      `LINE第五個家人伺服器已啟動: ${PORT}`,
    );

  },
);
