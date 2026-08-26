import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

import { SYSTEM_INSTRUCTION } from './persona';
import { FAMILY_MEMBERS } from './family';

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
  return [
    '大內總管',
    '總管',
    '內內',
    '喳子',
    '渣子',
    '阿福',
  ].some(
    (word) => message.includes(word),
  );
}


/**
 * =========================================================
 * 清除總管呼叫詞
 * =========================================================
 */

function cleanTriggerWords(
  message: string,
): string {

  return message
    .replace(/大內總管/g, '')
    .replace(/總管/g, '')
    .replace(/內內/g, '')
    .replace(/喳子/g, '')
    .replace(/渣子/g, '')
    .replace(/阿福/g, '')
    .trim();
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
 * LINE 基本頁面
 * =========================================================
 */

app.get(
  '/',
  (req, res) => {

    res.send(
      'LINE第五個家人正在運作',
    );
  },
);


/**
 * =========================================================
 * LINE Webhook
 * =========================================================
 */

app.post(
  '/webhook',
  lineMiddleware,
  async (req, res) => {

    const events =
      req.body.events;


    try {

      await Promise.all(

        events.map(
          async (event: any) => {

            /*
             * Observer 的 Reply Token 時間基準。
             * 從收到 webhook event 就開始計時，避免前面的流程把安全時間吃掉。
             */
            const eventReceivedAt = Date.now();
            const observerTraceId =
              `evt-${eventReceivedAt}-${Math.random().toString(36).slice(2, 7)}`;

            console.log(
              `[ObserverRoute][${observerTraceId}] EVENT_RECEIVED type=${event.type} source=${event.source?.type || 'unknown'} replyToken=${event.replyToken ? 'yes' : 'no'}`,
            );


            /*
             * =====================================================
             * LINE Location 訊息
             * =====================================================
             *
             * Location 不進 Gemini，也不進 Reminder / Observer。
             *
             * 先由獨立 Location Handler 接收並保存，
             * 後續文字訊息再由 createAiContext() 取得最近位置。
             *
             * 這一層目前只建立：
             *
             * LINE
             *   ↓
             * Node.js
             *   ↓
             * Location State
             *
             * Google API / Places / Routes 暫時完全不介入。
             * =====================================================
             */

            if (
              event.type === 'message' &&
              event.message.type === 'location'
            ) {

              if (
                !event.replyToken ||
                (
                  event.source.type !== 'user' &&
                  event.source.type !== 'group'
                )
              ) {
                return;
              }

              const locationResult =
                handleLocationMessage(
                  event,
                );

              if (
                !locationResult.handled
              ) {
                console.warn(
                  '[Location] 無法處理 LINE 位置訊息:',
                  locationResult.reason,
                );

                return;
              }

              if (
                event.source.type === 'group' &&
                event.source.groupId
              ) {
                recordFamilyGroupMessage(
                  event.source.groupId,
                );
              }

              console.log(
                '[Location] 已收到位置:',
                JSON.stringify(
                  locationResult.location,
                ),
              );

              await lineClient.replyMessage(
                {
                  replyToken:
                    event.replyToken,

                  messages: [
                    {
                      type: 'text',

                      text:
                        '喳，奴才已收到您剛分享的位置。',
                    },
                  ],
                },
              );

              return;
            }


            /*
             * =====================================================
             * 文字訊息
             * =====================================================
             */

            if (
              event.type !== 'message' ||
              event.message.type !== 'text' ||
              !event.replyToken
            ) {
              return;
            }


            const userMessage =
              event.message.text;


            /*
             * =====================================================
             * 目前說話的人
             * =====================================================
             */

            const familyMember =
              FAMILY_MEMBERS[
                event.source.userId || ''
              ];




            /*
             * =====================================================
             * 目前只處理：
             *
             * - 私訊
             * - 群組
             * =====================================================
             */

            if (
              event.source.type !== 'user' &&
              event.source.type !== 'group'
            ) {
              return;
            }


            /*
             * =====================================================
             * 家庭群組活動記錄
             * =====================================================
             *
             * 只有群組訊息會更新家庭群組最後活動時間。
             *
             * 私訊不影響家庭群組冷場判定。
             * =====================================================
             */

            if (
              event.source.type === 'group' &&
              event.source.groupId
            ) {

              recordFamilyGroupMessage(
                event.source.groupId,
              );
            }


            /*
             * =====================================================
             * 取得這次對話的記憶區
             * =====================================================
             */

            const conversationKey =
              getConversationKey(
                event,
              );


            /*
             * =====================================================
             * 取得目前訊息之前的記憶
             * =====================================================
             *
             * currentMessage 不會先塞進 history。
             *
             * 它會另外作為 AI Context 的
             * currentMessage。
             *
             * 這樣 Gemini 能清楚區分：
             *
             * 「之前發生什麼」
             *
             * 與
             *
             * 「現在正在問什麼」。
             * =====================================================
             */

            const historyBeforeMessage =
              getMemory(
                conversationKey,
              );








            /*
             * =====================================================
             * 主動呼叫總管／家庭目標意圖
             * =====================================================
             */

            const triggerWords = [
  '大內總管',
  '總管',
  '內內',
  '喳子',
  '渣子',
  '阿福',
];


            const hasTrigger =
              triggerWords.some(
                (word) =>
                  userMessage.includes(
                    word,
                  ),
              );


            const hasTargetIntent =
              hasFamilyTargetIntent(
                userMessage,
              );


            const shouldInvokeController =
  hasTrigger ||
  hasTargetIntent;

const shouldResolveTarget =
  hasTargetIntent;

/*
 * =====================================================
 * Observer 閉嘴／解除閉嘴
 * =====================================================
 *
 * 這是 Observer 控制指令，不交給 Gemini。
 *
 * 「閉嘴」只暫停被動插話；
 * 之後如果使用者再次明確叫總管，仍會走主動 AI Core。
 * =====================================================
 */

const observerTargetId =
  event.source.type === 'group'
    ? event.source.groupId
    : event.source.userId;

if (
  observerTargetId &&
  isObserverMuteCommand(userMessage)
) {

  const mutedUntil =
    muteObserver(observerTargetId);

  console.log(
    `[ObserverRoute][${observerTraceId}] MUTE until=${new Date(mutedUntil).toISOString()}` ,
  );

  await lineClient.replyMessage(
    {
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '喳，遵旨。奴才先安靜。',
        },
      ],
    },
  );

  addToMemory(
    conversationKey,
    'user',
    userMessage,
  );

  addToMemory(
    conversationKey,
    'assistant',
    '喳，遵旨。奴才先安靜。',
  );

  return;
}

if (
  observerTargetId &&
  isObserverUnmuteCommand(userMessage)
) {

  unmuteObserver(observerTargetId);

  console.log(
    `[ObserverRoute][${observerTraceId}] UNMUTE`,
  );

  await lineClient.replyMessage(
    {
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '喳，奴才恢復值班。',
        },
      ],
    },
  );

  addToMemory(
    conversationKey,
    'user',
    userMessage,
  );

  addToMemory(
    conversationKey,
    'assistant',
    '喳，奴才恢復值班。',
  );

  return;
}

/*
 * =====================================================
 * LINE 額度查詢
 * =====================================================
 *
 * 這是免費的 Reply Message。
 *
 * 使用：
 * 「內內查詢額度」
 * 「總管 LINE 配額」
 * 「內內剩餘多少額度」
 *
 * 直接查 LINE Messaging API，
 * 不交給 Gemini，避免浪費 Gemini 額度。
 * =====================================================
 */

if (
  hasTrigger &&
  /額度|配額/.test(
    userMessage,
  )
) {

  try {

    const quota =
      await getQuotaSnapshot(
        lineClient,
      );

    const quotaReply =
      formatQuotaSummary(
        quota,
      );

    await lineClient.replyMessage(
      {
        replyToken:
          event.replyToken,

        messages: [
          {
            type:
              'text',

            text:
              quotaReply.slice(
                0,
                5000,
              ),
          },
        ],
      },
    );

    addToMemory(
      conversationKey,
      'user',
      userMessage,
    );

    addToMemory(
      conversationKey,
      'assistant',
      quotaReply,
    );

  } catch (error) {

    logError(
      'LINE 額度查詢失敗',
      error,
    );

    try {

      await lineClient.replyMessage(
        {
          replyToken:
            event.replyToken,

          messages: [
            {
              type:
                'text',

              text:
                '奴才暫時查不到 LINE 額度，請稍後再問。',
            },
          ],
        },
      );

    } catch (
      fallbackError
    ) {

      logError(
        'LINE 額度查詢備援回覆失敗',
        fallbackError,
      );
    }
  }

  return;
}

/*
 * =====================================================
 * Location Route
 * =====================================================
 *
 * 回家路線需求優先於 Reminder / Observer / AI Core。
 *
 * 例如：
 * - 我回家要多久
 * - 我回到家要多久
 * - 到家還要多久
 * - 回家多遠
 *
 * Handler 自己負責：
 * - 判斷是否為回家路線需求
 * - 確認目前位置
 * - 確認固定家位置
 * - 呼叫 Google Routes Service
 * - 產生安全回覆
 *
 * index.ts 只負責：
 * - 把文字交給 Handler
 * - 將 Handler 結果送回 LINE
 * - 成功或失敗後寫入 Memory
 *
 * 重要：
 * Location Route Handler 若判定 handled=true，
 * 本 event 不得再進入 Reminder / Observer / AI Core，
 * 避免同一個 replyToken 被重複使用。
 * =====================================================
 */

try {
  const locationRouteResult =
    await handleHomeRouteRequest(
      userMessage,
      event.source.userId || '',
    );

  if (locationRouteResult.handled) {

    const locationRouteReply =
      locationRouteResult.replyText ||
      (
        locationRouteResult.success
          ? '喳，奴才已取得回家的路程資訊。'
          : '喳，奴才目前無法取得這道位置資訊。'
      );

    await lineClient.replyMessage(
      {
        replyToken:
          event.replyToken,

        messages: [
          {
            type: 'text',

            text:
              locationRouteReply.slice(
                0,
                5000,
              ),
          },
        ],
      },
    );

    addToMemory(
      conversationKey,
      'user',
      userMessage,
    );

    addToMemory(
      conversationKey,
      'assistant',
      locationRouteReply,
    );

    return;
  }

} catch (error) {
  logError(
    'Location Route 處理失敗',
    error,
  );

  /*
   * Location Route 已經進入獨立處理流程。
   * 如果 Handler 發生例外，仍然不能讓同一個
   * replyToken 繼續往下進入 Reminder / AI Core。
   */

  try {
    await lineClient.replyMessage(
      {
        replyToken:
          event.replyToken,

        messages: [
          {
            type: 'text',

            text:
              '總管暫時無法處理這道位置資訊，請稍後再試。',
          },
        ],
      },
    );
  } catch (fallbackError) {
    logError(
      'Location Route 備援回覆失敗',
      fallbackError,
    );
  }

  return;
}

/*
 * =====================================================
 * Location Intent
 * =====================================================
 *
 * Location Intent 必須在 Reminder / Observer / AI Core 前完成。
 *
 * 規則：
 *
 * 1. handled=false
 *    → 不是位置需求，繼續既有流程。
 *
 * 2. handled=true 且無法安全執行
 *    → 直接回覆 clarificationMessage，然後 return。
 *
 * 3. CURRENT_LOCATION
 *    → 直接使用目前 Location State 回覆。
 *
 * 4. NEAR_CURRENT / NEAR_HOME
 *    → 交給 Location Places Action Handler。
 *
 * 5. HOME_ROUTE
 *    → 已由上面的 Location Route Handler 優先處理。
 *
 * 重要：
 * Location Intent handled=true 後，
 * 本 event 不得再進入 Reminder / Observer / AI Core。
 * =====================================================
 */

try {
  const locationIntentResult =
    handleLocationIntent(
      userMessage,
      event.source.userId || '',
    );

  if (
    locationIntentResult.handled
  ) {
    const canExecute =
      canExecuteLocationIntent(
        locationIntentResult,
      );

    let locationReply: string;

    /*
     * -----------------------------------------------------
     * 需要補充位置資訊
     * -----------------------------------------------------
     */

    if (
      !canExecute &&
      locationIntentResult.clarificationRequired
    ) {
      locationReply =
        locationIntentResult.clarificationMessage ||
        '總管目前還缺少必要的位置資訊，請先提供目前位置或設定固定位置。';
    }

    /*
     * -----------------------------------------------------
     * CURRENT_LOCATION
     * -----------------------------------------------------
     */

    else if (
      canExecute &&
      locationIntentResult.intent ===
        'CURRENT_LOCATION' &&
      locationIntentResult.locationResolution?.location
    ) {
      const location =
        locationIntentResult.locationResolution.location;

      locationReply =
        location.address
          ? (
              `主上目前的位置是：` +
              `${location.address}`
            )
          : (
              `主上目前的位置座標是：` +
              `${location.latitude}, ` +
              `${location.longitude}`
            );
    }

    /*
     * -----------------------------------------------------
     * NEAR_CURRENT / NEAR_HOME
     * -----------------------------------------------------
     *
     * Intent 只負責判斷需求與確認位置是否足夠。
     * 真正的 Places 搜尋交給 Action Handler。
     *
     * Action Handler：
     *
     * Location State / Home Location
     *          ↓
     * Google Places Service
     *          ↓
     * 真實店家結果
     *
     * 這裡只負責把結果整理成 LINE 回覆。
     * -----------------------------------------------------
     */

    else if (
      canExecute &&
      (
        locationIntentResult.intent ===
          'NEAR_CURRENT' ||
        locationIntentResult.intent ===
          'NEAR_HOME'
      ) &&
      locationIntentResult.action
    ) {
      try {
        const placesResult =
          await handleLocationPlacesAction(
            {
              action:
                locationIntentResult.action ===
                  'SEARCH_NEAR_HOME'
                  ? 'SEARCH_NEAR_HOME'
                  : 'SEARCH_NEAR_CURRENT',

              message:
                userMessage,

              userId:
                event.source.userId || '',
            },
          );

        if (
          !placesResult.success
        ) {
          if (
            placesResult.reason ===
              'current-location-unknown'
          ) {
            locationReply =
              '喳，奴才目前沒有收到主上的最新位置，還不能替您搜尋附近店家。';
          }

          else if (
            placesResult.reason ===
              'home-location-unknown'
          ) {
            locationReply =
              '喳，奴才目前還沒有記下固定家位置，還不能替您搜尋家附近店家。';
          }

          else if (
            placesResult.reason ===
              'MISSING_API_KEY'
          ) {
            locationReply =
              '喳，位置已經確認，但附近店家搜尋服務目前尚未完成設定。';
          }

          else {
            locationReply =
              '喳，奴才已確認搜尋位置，但目前無法取得附近店家資料，請稍後再試。';
          }
        }

        else {
          const places =
            placesResult.places || [];

          if (
            !places.length
          ) {
            locationReply =
              '喳，奴才已依照目前位置搜尋附近店家，但這次沒有找到合適的結果。';
          }

          else {
            const placeLines =
              places
                .slice(0, 10)
                .map(
                  (place: any, index: number) => {
                    const name =
                      typeof place?.displayName === 'string'
                        ? place.displayName
                        : typeof place?.displayName?.text === 'string'
                          ? place.displayName.text
                          : typeof place?.name === 'string'
                            ? place.name
                            : '未命名店家';

                    const address =
                      typeof place?.formattedAddress === 'string'
                        ? place.formattedAddress
                        : typeof place?.address === 'string'
                          ? place.address
                          : '';

                    const rating =
                      typeof place?.rating === 'number'
                        ? `｜評分 ${place.rating}`
                        : '';

                    const distance =
                      typeof place?.distanceMeters === 'number'
                        ? `｜約 ${Math.round(place.distanceMeters)} 公尺`
                        : '';

                    return (
                      `${index + 1}. ${name}` +
                      `${rating}` +
                      `${distance}` +
                      (address
                        ? `\n   ${address}`
                        : '')
                    );
                  },
                );

            const searchLabel =
              locationIntentResult.intent ===
                'NEAR_HOME'
                ? '固定家附近'
                : '目前位置附近';

            locationReply =
              `喳，奴才已依照「${searchLabel}」的實際位置查到以下店家：\n\n` +
              placeLines.join('\n\n');
          }
        }

      } catch (error) {
        logError(
          'Location Places Action 處理失敗',
          error,
        );

        locationReply =
          '喳，奴才已接到您的附近搜尋需求，但目前無法取得店家資料，請稍後再試。';
      }
    }

    /*
     * -----------------------------------------------------
     * 其他 handled=true
     * -----------------------------------------------------
     */

    else {
      locationReply =
        locationIntentResult.clarificationMessage ||
        '喳，奴才已接住這道位置需求，但目前還缺少可以執行的功能。';
    }

    await lineClient.replyMessage(
      {
        replyToken:
          event.replyToken,

        messages: [
          {
            type:
              'text',

            text:
              locationReply.slice(
                0,
                5000,
              ),
          },
        ],
      },
    );

    addToMemory(
      conversationKey,
      'user',
      userMessage,
    );

    addToMemory(
      conversationKey,
      'assistant',
      locationReply,
    );

    return;
  }

} catch (error) {
  logError(
    'Location Intent 處理失敗',
    error,
  );

  /*
   * Location Intent 發生例外時，
   * 不能讓這個 event 繼續進入 Reminder / Observer / AI Core。
   * 否則可能重複使用同一個 replyToken。
   */

  try {
    await lineClient.replyMessage(
      {
        replyToken:
          event.replyToken,

        messages: [
          {
            type:
              'text',

            text:
              '總管暫時無法處理這道位置資訊，請稍後再試。',
          },
        ],
      },
    );
  } catch (fallbackError) {
    logError(
      'Location Intent 備援回覆失敗',
      fallbackError,
    );
  }

  return;
}

/* 
 * =====================================================
 * Style Switch
 * =====================================================
 *
 * 角色風格查詢與切換。
 *
 * 例如：
 *
 * - 阿福，切換風格
 * - 阿福，有哪些風格
 * - 阿福，切換成大內總管
 *
 * Style Switch 不使用 AI。
 *
 * 只有明確呼叫總管時才處理，
 * 避免一般聊天中的「換成」「改成」
 * 被誤判為角色風格切換。
 *
 * 必須放在 Function Help / Vote / Reminder /
 * Observer / AI Core 前面。
 * =====================================================
 */

if (
  hasTrigger
) {

  const styleSwitchResult =
    handleStyleSwitch(
      userMessage,
    );


  if (
    styleSwitchResult.handled
  ) {

    const styleSwitchReply =
      styleSwitchResult.replyText ||
      '角色風格設定已處理。';


    await lineClient.replyMessage(
      {
        replyToken:
          event.replyToken,

        messages: [
          {
            type:
              'text',

            text:
              styleSwitchReply.slice(
                0,
                5000,
              ),
          },
        ],
      },
    );


    addToMemory(
      conversationKey,
      'user',
      userMessage,
    );


    addToMemory(
      conversationKey,
      'assistant',
      styleSwitchReply,
    );


    return;
  }
}

/*
 * =====================================================
 * Function Help
 * =====================================================
 *
 * 群組可直接操作功能的說明入口。
 *
 * 必須使用呼叫詞，例如：
 *
 * - 喳子，有什麼功能
 * - 喳子，功能
 * - 喳子，投票怎麼用
 * - 喳子，提醒怎麼用
 * - 喳子，位置怎麼用
 *
 * Function Help 不使用 AI，
 * 直接由固定功能目錄回覆。
 *
 * 必須放在 Vote 之前，
 * 避免「投票怎麼用」被當成新的投票指令。
 * =====================================================
 */

const functionHelpResult =
  handleFunctionHelp(
    userMessage,
    hasTrigger,
    conversationKey,
  );

if (functionHelpResult.handled) {
  const functionHelpReply =
    functionHelpResult.reply ||
    '目前沒有找到這個功能的說明。';

  await lineClient.replyMessage({
    replyToken:
      event.replyToken,

    messages: [
      {
        type:
          'text',

        text:
          functionHelpReply.slice(
            0,
            5000,
          ),
      },
    ],
  });

  addToMemory(
    conversationKey,
    'user',
    userMessage,
  );

  addToMemory(
    conversationKey,
    'assistant',
    functionHelpReply,
  );

  return;
}


/*
 * =====================================================
 * Vote
 * =====================================================
 *
 * Vote 必須在 Reminder / Observer / AI Core 前處理。
 *
 * 原因：
 *
 * - ACTIVE 投票中的「1」
 * - 「火鍋」
 * - 「我要投燒肉」
 * - 「改投 2」
 *
 * 都可能不包含「投票」關鍵字，
 * 但已經是明確的投票操作。
 *
 * Vote Handler 自己負責：
 *
 * - 投票狀態
 * - 候選項目
 * - 投票人數
 * - 投票
 * - 改票
 * - 自動完成
 * - 平手
 *
 * index.ts 只負責：
 *
 * - 取得 groupId / userId
 * - 呼叫 Handler
 * - 回覆 LINE
 * - 寫入 Memory
 *
 * Vote 核心與 Persona / style 完全分離。
 * =====================================================
 */

try {
  const voteContextId =
    event.source.type === 'group'
      ? event.source.groupId
      : event.source.type === 'user'
        ? event.source.userId
        : '';

  /**
   * Vote Session context:
   *
   * - 群組 → groupId
   * - 私訊 → userId
   *
   * 私訊使用 userId 作為獨立 Vote Session，
   * 不與家庭群組 Vote 共用狀態。
   */
  if (voteContextId) {
    const voteResult =
      await handleVoteMessage({
        groupId:
          voteContextId,

        userId:
          event.source.userId || '',

        message:
          userMessage,

        generateOptions:
          generateVoteOptions,
      });

    if (voteResult.handled) {
      const voteReply =
        voteResult.message ||
        '投票狀態已更新。';

      await lineClient.replyMessage({
        replyToken:
          event.replyToken,

        messages: [
          {
            type:
              'text',

            text:
              voteReply.slice(
                0,
                5000,
              ),
          },
        ],
      });

      addToMemory(
        conversationKey,
        'user',
        userMessage,
      );

      addToMemory(
        conversationKey,
        'assistant',
        voteReply,
      );

      return;
    }
  }
} catch (error) {
  logError(
    'Vote 處理失敗',
    error,
  );

  /**
   * Vote 一旦進入 Handler，
   * 就直接結束 event，
   * 不讓同一個 replyToken 再進入
   * Reminder / Observer / AI Core。
   */
  try {
    await lineClient.replyMessage({
      replyToken:
        event.replyToken,

      messages: [
        {
          type:
            'text',

          text:
            '投票功能目前無法處理這則訊息，請稍後再試。',
        },
      ],
    });
  } catch (fallbackError) {
    logError(
      'Vote 備援回覆失敗',
      fallbackError,
    );
  }

  return;
}



/*
 * =====================================================
 * Reminder
 * =====================================================
 *
 * Reminder Handler 自己負責：
 *
 * - 新建立
 * - 查詢
 * - 修改
 * - 取消
 * - Pending confirmation
 *
 * index.ts 只負責：
 *
 * 1. 把訊息交給 Handler
 * 2. 將 Handler 的結果送回 LINE
 * 3. 執行真正的 Mention
 *
 * 注意：
 * 不再用「訊息是否包含提醒」作為唯一入口。
 * 「1取消」、「取消1」、「同意」等 Pending 操作
 * 本身可能沒有「提醒」兩字，也必須能進 Handler。
 * =====================================================
 */

try {
  const reminderGroupId =
    event.source.type === 'group'
      ? event.source.groupId
      : loadFamilyGroupId();

  if (reminderGroupId) {
    const reminderResult =
      await handleReminderMessage(
        userMessage,
        event.source.userId || '',
        reminderGroupId,
        gemini,
        hasReminderInvocation(userMessage),
      );

    if (reminderResult.handled) {
      const reminderReply =
        reminderResult.message ||
        (
          reminderResult.created
            ? '已記下，奴才會依旨提醒。'
            : '喳，奴才已處理這道 Reminder。'
        );

      // LINE Mention 只在群組訊息中執行。
      // 私訊即使 Handler 回傳 mentionUserIds，也不把 Mention payload
      // 帶進私訊回覆，避免特殊 Reminder 回覆路徑使用不適合的 payload。
      const reminderMentionUserIds =
        event.source.type === 'group'
          ? reminderResult.mentionUserIds
          : [];

      const reminderMentionAll =
        event.source.type === 'group' &&
        reminderResult.mentionAll === true;

      await sendReminderReply(
        event.replyToken,
        reminderReply,
        reminderMentionUserIds,
        reminderMentionAll,
      );

      addToMemory(
        conversationKey,
        'user',
        userMessage,
      );

      addToMemory(
        conversationKey,
        'assistant',
        reminderReply,
      );

      return;
    }
  }
} catch (error) {
  logError(
    'Reminder 處理失敗',
    error,
  );

  /*
   * Reminder 已經接管這個 event。
   * 如果 Reminder 回覆階段失敗，不能再把同一個 replyToken
   * 交給下方 AI Core 二次處理。
   *
   * 否則會形成：
   * Reminder reply 失敗
   *   ↓
   * catch 吞掉錯誤
   *   ↓
   * AI Core 再次處理同一個 event
   *   ↓
   * 再次使用同一個 replyToken
   *   ↓
   * LINE Invalid reply token
   *
   * 因此這裡直接結束本次 event。
   */
  return;
}

            /*
             * =====================================================
             * 沒有叫總管，也沒有明確家庭目標
             *
             * → 保留 Observer 原本流程
             * =====================================================
             *
             * Observer 使用當次 webhook 的 replyToken。
             * 被動插話超過 4.5 秒直接放棄，絕不改用 pushMessage。
             * =====================================================
             */

            console.log(
              `[ObserverRoute][${observerTraceId}] ROUTE_DECISION shouldInvokeController=${shouldInvokeController} elapsed=${Date.now() - eventReceivedAt}ms message=${JSON.stringify(userMessage)}`,
            );

            if (!shouldInvokeController) {

              addToMemory(
                conversationKey,
                'user',
                userMessage,
              );


              const targetId =
                event.source.type === 'group'
                  ? event.source.groupId
                  : event.source.userId;


              if (!targetId) {
                console.log(`[ObserverRoute][${observerTraceId}] OBSERVER_SKIP reason=no-target elapsed=${Date.now() - eventReceivedAt}ms`);
                return;
              }


              console.log(
                `[ObserverRoute][${observerTraceId}] OBSERVER_ENTER elapsed=${Date.now() - eventReceivedAt}ms target=${targetId} replyRemaining=${Math.max(0, eventReceivedAt + 4500 - Date.now())}ms`,
              );

              observeMessage(
                {
                  diagnosticTraceId: observerTraceId,
                  eventReceivedAt,
                  targetId,

                  userMessage,

                  replyToken:
                    event.replyToken,

                  replyDeadlineAt:
                    eventReceivedAt + 4500,

                  familyMember,

                  getConversationContext:
                    () => {

                      const latestHistory =
                        getMemory(
                          conversationKey,
                        );


                      return buildConversationPrompt(
                        latestHistory,
                        '',
                      );
                    },


                  gemini,

                  lineClient,


                  onPassiveReply:
                    (
                      replyText,
                    ) => {

                      addToMemory(
                        conversationKey,
                        'assistant',
                        replyText,
                      );
                    },
                },
              );


              return;
            }


            /*
             * =====================================================
             * 進入主動 AI Core
             * =====================================================
             */

            try {

              /*
               * ===================================================
               * 去掉「喳子／總管」等呼叫詞。
               *
               * 但如果沒有呼叫詞，
               * 就保留原始訊息。
               *
               * 例如：
               *
               * 喳子你知道量子糾纏嗎
               * ↓
               * 你知道量子糾纏嗎
               *
               * 大家晚安
               * ↓
               * 大家晚安
               * ===================================================
               */

              const cleanedMessage =
                hasTrigger
                  ? cleanTriggerWords(
                      userMessage,
                    )
                  : userMessage.trim();


              /*
               * =====================================================
               * 家庭目標解析
               * =====================================================
               *
               * 這部分保留原本設計。
               *
               * AI Core 不負責判斷 LINE 要 @誰。
               *
               * Resolver 負責確認對象。
               *
               * LINE 傳送層負責真正 @。
               * =====================================================
               */

              const wantsAll =
                ALL_TARGET_WORDS.some(
                  (word) =>
                    cleanedMessage.includes(
                      word,
                    ),
                );


              const resolvedFamilyTarget =
                wantsAll
                  ? null
                  : await resolveFamilyTarget(
                      cleanedMessage,
                      gemini,
                    );


              const familyTarget =
                wantsAll
                  ? {
                      type: 'all' as const,
                    }
                  : resolvedFamilyTarget
                    ? {
                        type: 'user' as const,
                        ...resolvedFamilyTarget,
                      }
                    : null;


              /*
               * =====================================================
               * CMD 顯示解析結果
               * =====================================================
               */

              if (familyTarget) {

                if (
                  familyTarget.type === 'all'
                ) {


                } else {

                }
              }


              /*
               * =====================================================
               * 建立真正的 AI Context
               * =====================================================
               *
               * Memory
               * ↓
               * normalizeConversationMessages()
               * ↓
               * AiContext
               * ↓
               * AI Core
               * ↓
               * Gemini
               *
               * 這裡不再讓 index.ts 自己處理
               * Memory 的欄位名稱。
               * =====================================================
               */

              const aiContext =
                createAiContext(
                  event,
                  familyMember,
                  historyBeforeMessage,
                  cleanedMessage ||
                    '有人在聊天中叫你，請自然地回應。',
                );


              /*
               * =====================================================
               * AI Memory Debug
               * =====================================================
               *
               * 這裡額外確認：
               *
               * Gemini 實際拿到多少則 Context。
               *
               * 如果 history count = 2，
               * 但 AI Context count = 0，
               * 就代表轉換層有問題。
               *
               * 修正後應該一致。
               * =====================================================
               */





              /*
               * =====================================================
               * 執行 AI Core
               * =====================================================
               */

              const aiResult =
                await runAiCore(
                  {
                    geminiApiManager,

                    context:
                      aiContext,
                  },
                );


              const replyText =
                aiResult.text.trim();


              /*
               * =====================================================
               * 傳送 LINE 回覆
               * =====================================================
               *
               * AI Core 只負責：
               *
               * Gemini → 回答
               *
               * LINE mention：
               *
               * index.ts → 執行
               * =====================================================
               */

              await sendAiReply(
                event.replyToken,
                replyText,
                event.source.type === 'group'
                  ? familyTarget
                  : null,
              );


              /*
               * =====================================================
               * 成功後才寫入記憶
               * =====================================================
               *
               * AI 在生成時看到的是：
               *
               * historyBeforeMessage
               * +
               * currentMessage
               *
               * 回答成功後，
               * 才把 user / assistant 寫入下一輪記憶。
               * =====================================================
               */

              addToMemory(
                conversationKey,
                'user',
                userMessage,
              );


              addToMemory(
                conversationKey,
                'assistant',
                replyText,
              );


            } catch (error) {

              /*
               * =====================================================
               * 錯誤處理
               * =====================================================
               */

              logError(
                '主動呼叫總管失敗',
                error,
              );


              try {

                await lineClient.replyMessage(
                  {
                    replyToken:
                      event.replyToken,

                    messages: [
                      {
                        type: 'text',

                        text:
                          getFallbackMessage(
                            error,
                          ),
                      },
                    ],
                  },
                );


              } catch (
                fallbackError
              ) {

                logError(
                  'LINE 備援回覆失敗',
                  fallbackError,
                );
              }
            }
          },
        ),
      );


      res.sendStatus(200);


    } catch (error) {

      logError(
        'Webhook error',
        error,
      );


      res.sendStatus(500);
    }
  },
);


/**
 * =========================================================
 * AI 回覆送出
 * =========================================================
 *
 * AI Core 只負責產生文字。
 *
 * 真正的 LINE：
 *
 * - replyMessage
 * - @ALL
 * - @指定成員
 *
 * 都在這裡處理。
 * ========================================================= */

async function sendReminderReply(
  replyToken: string,
  replyText: string,
  mentionUserIds: string[] = [],
  mentionAll = false,
): Promise<void> {
  const safeReply =
    replyText.slice(
      0,
      4950,
    );

  if (mentionAll) {
    await lineClient.replyMessage({
      replyToken,
      messages: [
        {
          type: 'textV2',
          text:
            `{target} ${safeReply}`,
          substitution: {
            target: {
              type: 'mention',
              mentionee: {
                type: 'all',
              },
            },
          },
        },
      ],
    });

    return;
  }

  const uniqueUserIds =
    [...new Set(
      mentionUserIds.filter(
        (userId) =>
          typeof userId === 'string' &&
          userId.trim().length > 0,
      ),
    )];

  if (!uniqueUserIds.length) {
    await lineClient.replyMessage({
      replyToken,
      messages: [
        {
          type: 'text',
          text: safeReply,
        },
      ],
    });

    return;
  }

  const substitutions: Record<string, any> = {};

  const mentionText =
    uniqueUserIds
      .map((userId, index) => {
        const key =
          `mention${index}`;

        substitutions[key] = {
          type: 'mention',
          mentionee: {
            type: 'user',
            userId,
          },
        };

        return `{${key}}`;
      })
      .join(' ');

  await lineClient.replyMessage({
    replyToken,
    messages: [
      {
        type: 'textV2',
        text:
          `${mentionText} ${safeReply}`,
        substitution:
          substitutions,
      } as any,
    ],
  });
}

async function sendAiReply(
  replyToken: string,
  replyText: string,

  familyTarget?:
    | {
        type: 'all';
      }
    | {
        type: 'user';

        userId: string;

        member: {
          identity: string;

          mentionName: string;
        };
      }
    | null,
): Promise<void> {

  const safeReply =
    replyText.slice(
      0,
      4950,
    );


  /*
   * =========================================================
   * @ALL
   * =========================================================
   */

  if (
    familyTarget &&
    familyTarget.type === 'all'
  ) {

    await lineClient.replyMessage(
      {
        replyToken,

        messages: [
          {
            type: 'textV2',

            text:
              `{target} ${safeReply}`,

            substitution: {
              target: {
                type: 'mention',

                mentionee: {
                  type: 'all',
                },
              },
            },
          },
        ],
      },
    );


    return;
  }


  /*
   * =========================================================
   * @單一家庭成員
   * =========================================================
   */

  if (
    familyTarget &&
    familyTarget.type === 'user'
  ) {

    await lineClient.replyMessage(
      {
        replyToken,

        messages: [
          {
            type: 'textV2',

            text:
              `{target} ${safeReply}`,

            substitution: {
              target: {
                type: 'mention',

                mentionee: {
                  type: 'user',

                  userId:
                    familyTarget.userId,
                },
              },
            },
          },
        ],
      },
    );


    return;
  }


  /*
   * =========================================================
   * 一般文字回覆
   * =========================================================
   */

  await lineClient.replyMessage(
    {
      replyToken,

      messages: [
        {
          type: 'text',

          text:
            replyText.slice(
              0,
              5000,
            ),
        },
      ],
    },
  );
}


/**
 * =========================================================
 * 主動訊息產生器
 * =========================================================
 *
 * 固定晚安：
 * 直接使用指定內容。
 *
 * 冷場：
 * 交給 Gemini 生成一句短話。
 *
 * 這部分暫時維持原本設計。
 * ========================================================= */

async function generateProactiveReply(
  type:
    | 'good-night'
    | 'silence',
): Promise<string> {

  /*
   * =========================================================
   * 固定晚安
   * =========================================================
   */

  if (
    type === 'good-night'
  ) {

    return (
      '諸位，夜深了，奴才先向各位道一聲晚安。' +
      '若還有什麼吩咐，隨時喚奴才一聲便是。'
    );
  }


  /*
   * =========================================================
   * 冷場主動訊息
   * =========================================================
   */

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
    '諸位都如此安靜，奴才倒有些不習慣了。'
  );
}


/**
 * =========================================================
 * 啟動
 * ========================================================= */

app.listen(
  PORT,

  () => {

    console.log(
      `Server running on port ${PORT}`,
    );


    console.log(
      'LINE第五個家人正在啟動',
    );


    /*
     * =====================================================
     * 啟動主動訊息排程器
     * =====================================================
     */

    startProactiveScheduler(
      lineClient,
      generateProactiveReply,
    );
  },
);