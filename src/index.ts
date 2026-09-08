import './line-fetch-timeout';
import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
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
  invalidateObserver,
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

import { enqueueConversationTask } from './conversation-queue';
import { claimWebhookEvent } from './webhook-event-dedup';

/**
 * ============================================================
 * 大內總管
 * ============================================================
 */

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const geminiApiKey = process.env.GEMINI_API_KEY || '';

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken,
});

const lineMiddleware = middleware({
  channelSecret,
});

const gemini = geminiApiManager.createClient();

const ALL_TARGET_WORDS = [
  '本人',
  '大人',
  '全家',
  '全家人',
];

const FAMILY_TARGET_ACTION_WORDS = [
  '幫我',
  '幫他',
  '幫她',
  '問他',
  '問她',
  '通知他',
  '通知她',
  '告訴他',
  '告訴她',
  '找他',
  '找她',
  '幫',
  '替',
  '查',
  '設定',
  '提醒',
  '記得',
  '記下',
  '記住',
  '告知',
  '詢問',
  '通知',
  '安排',
  '修改',
  '取消',
  '刪除',
];

const FAMILY_GREETING_WORDS = [
  '早安',
  '午安',
  '晚安',
  '嗨',
  '哈囉',
  '你好',
];

function hasFamilyTargetIntent(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  const hasAllTarget = ALL_TARGET_WORDS.some((word) => text.includes(word));
  const hasGreeting = FAMILY_GREETING_WORDS.some((word) => text.includes(word));
  const hasAction = FAMILY_TARGET_ACTION_WORDS.some((word) => text.includes(word));

  if (hasAllTarget && hasGreeting) return true;
  if (hasAllTarget && hasAction) return true;
  if (ALL_TARGET_WORDS.some((word) => text === word)) return true;

  const hasKnownFamilyMember = Object.values(FAMILY_MEMBERS).some((member: any) => {
    const identity = typeof member?.identity === 'string' ? member.identity : '';
    const mentionName = typeof member?.mentionName === 'string' ? member.mentionName : '';
    return (identity && text.includes(identity)) || (mentionName && text.includes(mentionName));
  });

  return hasKnownFamilyMember && (hasGreeting || hasAction);
}

function hasReminderInvocation(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return text.includes('提醒');
}

function getObserverTraceId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function sendReminderReply(
  replyToken: string,
  replyText: string,
  mentionUserIds: string[] = [],
  mentionAll = false,
): Promise<void> {
  const mentionText = mentionAll ? '@all ' : mentionUserIds.length ? mentionUserIds.map((id) => `@${id}`).join(' ') + ' ' : '';
  await lineClient.replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text: `${mentionText}${replyText}`.slice(0, 5000),
    }],
  });
}

async function sendAiReply(replyToken: string, replyText: string): Promise<void> {
  await lineClient.replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text: replyText.slice(0, 5000),
    }],
  });
}

async function generateVoteOptions(prompt: string): Promise<string[]> {
  const response = await geminiApiManager.execute('generateVoteOptions', async (client) => {
    const result = await client.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt,
      config: {
        temperature: 0,
      },
    });
    return result.text || '';
  });

  return response
    .split('\n')
    .map((line) => line.replace(/^[-*\d.、)]+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

app.post('/webhook', lineMiddleware, async (req, res) => {
  const events = req.body.events;
  res.sendStatus(200);

  try {
    await Promise.all(events.map(async (event: any) => {
      if (!claimWebhookEvent(event.webhookEventId)) return;
      const eventReceivedAt = Date.now();
      const observerTraceId = getObserverTraceId();

      if (event.type === 'message' && event.message?.type === 'location') {
        if (!event.replyToken || (event.source.type !== 'user' && event.source.type !== 'group')) return;

        const locationResult = handleLocationMessage(event);
        if (!locationResult.handled) {
          console.warn('[Location] 無法處理 LINE 位置訊息:', locationResult.reason);
          return;
        }

        if (event.source.type === 'group' && event.source.groupId) {
          recordFamilyGroupMessage(event.source.groupId);
        }

        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: buildStyleResponse('喳，奴才已收到您剛分享的位置。') }],
        });
        return;
      }

      if (event.type !== 'message' || event.message.type !== 'text' || !event.replyToken) return;

      const userMessage = event.message.text;
      const familyMember = FAMILY_MEMBERS[event.source.userId || ''];
      if (event.source.type !== 'user' && event.source.type !== 'group') return;

      if (event.source.type === 'group' && event.source.groupId) {
        recordFamilyGroupMessage(event.source.groupId);
      }

      const conversationKey = getConversationKey(event);
      const routeReceivedAt = Date.now();
      console.log(`[RouteTiming] QUEUE_ENTER key=${conversationKey} elapsed=0ms message=${JSON.stringify(userMessage)}`);
      return enqueueConversationTask(conversationKey, async () => {
        console.log(`[RouteTiming] QUEUE_START key=${conversationKey} wait=${Date.now() - routeReceivedAt}ms`);
        const historyBeforeMessage = getMemory(conversationKey);
        const hasTrigger = hasCallName(userMessage);
        const hasTargetIntent = hasFamilyTargetIntent(userMessage);
        const shouldInvokeController = hasTrigger || hasTargetIntent;
        const observerTargetId = event.source.type === 'group' ? event.source.groupId : event.source.userId;

        if (shouldInvokeController && observerTargetId) {
          invalidateObserver(observerTargetId, eventReceivedAt);
        }

        if (observerTargetId && isObserverMuteCommand(userMessage)) {
          const mutedUntil = muteObserver(observerTargetId);
          console.log(`[ObserverRoute][${observerTraceId}] MUTE until=${new Date(mutedUntil).toISOString()}`);
          const reply = buildStyleResponse('喳，遵旨。奴才先安靜。');
          await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: reply }] });
          addToMemory(conversationKey, 'user', userMessage);
          addToMemory(conversationKey, 'assistant', reply);
          return;
        }

        if (observerTargetId && isObserverUnmuteCommand(userMessage)) {
          unmuteObserver(observerTargetId);
          console.log(`[ObserverRoute][${observerTraceId}] UNMUTE`);
          const reply = buildStyleResponse('喳，奴才恢復值班。');
          await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: reply }] });
          addToMemory(conversationKey, 'user', userMessage);
          addToMemory(conversationKey, 'assistant', reply);
          return;
        }

        if (hasTrigger && /額度|配額/.test(userMessage)) {
          try {
            const quota = await getQuotaSnapshot(lineClient);
            const quotaReply = formatQuotaSummary(quota);
            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: quotaReply.slice(0, 5000) }] });
            addToMemory(conversationKey, 'user', userMessage);
            addToMemory(conversationKey, 'assistant', quotaReply);
          } catch (error) {
            logError('LINE 額度查詢失敗', error);
            try {
              await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: buildStyleResponse('奴才暫時查不到 LINE 額度，請稍後再問。') }] });
            } catch (fallbackError) {
              logError('LINE 額度查詢備援回覆失敗', fallbackError);
            }
          }
          return;
        }

        try {
          const locationRouteResult = await handleHomeRouteRequest(userMessage, event.source.userId || '');
          if (locationRouteResult.handled) {
            const locationRouteReply = locationRouteResult.replyText || (locationRouteResult.success ? buildStyleResponse('喳，奴才已取得回家的路程資訊。') : buildStyleResponse('喳，奴才目前無法取得這道位置資訊。'));
            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: locationRouteReply.slice(0, 5000) }] });
            addToMemory(conversationKey, 'user', userMessage);
            addToMemory(conversationKey, 'assistant', locationRouteReply);
            return;
          }
        } catch (error) {
          logError('Location Route 處理失敗', error);
          try {
            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: buildStyleResponse('總管暫時無法處理這道位置資訊，請稍後再試。') }] });
          } catch (fallbackError) {
            logError('Location Route 備援回覆失敗', fallbackError);
          }
          return;
        }

        try {
          const locationIntentResult = handleLocationIntent(userMessage, event.source.userId || '');
          if (locationIntentResult.handled) {
            const canExecute = canExecuteLocationIntent(locationIntentResult);
            let locationReply: string;

            if (!canExecute && locationIntentResult.clarificationRequired) {
              locationReply = locationIntentResult.clarificationMessage || buildStyleResponse('總管目前還缺少必要的位置資訊，請先提供目前位置或設定固定位置。');
            } else if (canExecute && locationIntentResult.intent === 'CURRENT_LOCATION' && locationIntentResult.locationResolution?.location) {
              const location = locationIntentResult.locationResolution.location;
              locationReply = location.address ? `主上目前的位置是：${location.address}` : `主上目前的位置座標是：${location.latitude}, ${location.longitude}`;
            } else if (canExecute && (locationIntentResult.intent === 'NEAR_CURRENT' || locationIntentResult.intent === 'NEAR_HOME') && locationIntentResult.action) {
              try {
                const placesResult = await handleLocationPlacesAction({
                  action: locationIntentResult.action === 'SEARCH_NEAR_HOME' ? 'SEARCH_NEAR_HOME' : 'SEARCH_NEAR_CURRENT',
                  message: userMessage,
                  userId: event.source.userId || '',
                });

                if (!placesResult.success) {
                  if (placesResult.reason === 'current-location-unknown') {
                    locationReply = buildStyleResponse('喳，奴才目前沒有收到主上的最新位置，還不能替您搜尋附近店家。');
                  } else if (placesResult.reason === 'home-location-unknown') {
                    locationReply = buildStyleResponse('喳，奴才目前還沒有記下固定家位置，還不能替您搜尋家附近店家。');
                  } else if (placesResult.reason === 'MISSING_API_KEY') {
                    locationReply = buildStyleResponse('喳，位置已經確認，但附近店家搜尋服務目前尚未完成設定。');
                  } else {
                    locationReply = buildStyleResponse('喳，奴才已確認搜尋位置，但目前無法取得附近店家資料，請稍後再試。');
                  }
                } else {
                  const places = placesResult.places || [];
                  if (!places.length) {
                    locationReply = buildStyleResponse('喳，奴才已依照目前位置搜尋附近店家，但這次沒有找到合適的結果。');
                  } else {
                    const placeLines = places.slice(0, 10).map((place: any, index: number) => {
                      const name = typeof place?.displayName === 'string' ? place.displayName : typeof place?.displayName?.text === 'string' ? place.displayName.text : typeof place?.name === 'string' ? place.name : '未命名店家';
                      const address = typeof place?.formattedAddress === 'string' ? place.formattedAddress : typeof place?.address === 'string' ? place.address : '';
                      const rating = typeof place?.rating === 'number' ? `｜評分 ${place.rating}` : '';
                      const distance = typeof place?.distanceMeters === 'number' ? `｜約 ${Math.round(place.distanceMeters)} 公尺` : '';
                      return `${index + 1}. ${name}${rating}${distance}${address ? `\n   ${address}` : ''}`;
                    });
                    const searchLabel = locationIntentResult.intent === 'NEAR_HOME' ? '固定家附近' : '目前位置附近';
                    locationReply = buildStyleResponse(`喳，奴才已依照「${searchLabel}」的實際位置查到以下店家：\n\n`) + placeLines.join('\n\n');
                  }
                }
              } catch (error) {
                logError('Location Places Action 處理失敗', error);
                locationReply = buildStyleResponse('喳，奴才已接到您的附近搜尋需求，但目前無法取得店家資料，請稍後再試。');
              }
            } else {
              locationReply = locationIntentResult.clarificationMessage || buildStyleResponse('喳，奴才已接住這道位置需求，但目前還缺少可以執行的功能。');
            }

            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: locationReply.slice(0, 5000) }] });
            addToMemory(conversationKey, 'user', userMessage);
            addToMemory(conversationKey, 'assistant', locationReply);
            return;
          }
        } catch (error) {
          logError('Location Intent 處理失敗', error);
          try {
            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: buildStyleResponse('總管暫時無法處理這道位置資訊，請稍後再試。') }] });
          } catch (fallbackError) {
            logError('Location Intent 備援回覆失敗', fallbackError);
          }
          return;
        }

        if (hasTrigger && isCallNameHelpIntent(userMessage)) {
          const reply = buildActiveCallNamesHelpMessage();
          await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: reply.slice(0, 5000) }] });
          addToMemory(conversationKey, 'user', userMessage);
          addToMemory(conversationKey, 'assistant', reply);
          return;
        }

        const styleSwitchResult = handleStyleSwitch(userMessage, conversationKey, hasTrigger);
        if (styleSwitchResult.handled) {
          const reply = styleSwitchResult.replyText || '角色風格設定已處理。';
          await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: reply.slice(0, 5000) }] });
          addToMemory(conversationKey, 'user', userMessage);
          addToMemory(conversationKey, 'assistant', reply);
          return;
        }

        const functionHelpResult = handleFunctionHelp(userMessage, hasTrigger, conversationKey);
        if (functionHelpResult.handled) {
          const reply = functionHelpResult.reply || '目前沒有找到這個功能的說明。';
          await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: reply.slice(0, 5000) }] });
          addToMemory(conversationKey, 'user', userMessage);
          addToMemory(conversationKey, 'assistant', reply);
          return;
        }

        try {
          const voteContextId = event.source.type === 'group' ? event.source.groupId : event.source.type === 'user' ? event.source.userId : '';
          if (voteContextId) {
            const voteResult = await handleVoteMessage({ groupId: voteContextId, userId: event.source.userId || '', message: userMessage, generateOptions: generateVoteOptions });
            if (voteResult.handled) {
              const voteReply = voteResult.message || '投票狀態已更新。';
              await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: voteReply.slice(0, 5000) }] });
              addToMemory(conversationKey, 'user', userMessage);
              addToMemory(conversationKey, 'assistant', voteReply);
              return;
            }
          }
        } catch (error) {
          logError('Vote 處理失敗', error);
          try {
            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '投票功能目前無法處理這則訊息，請稍後再試。' }] });
          } catch (fallbackError) {
            logError('Vote 備援回覆失敗', fallbackError);
          }
          return;
        }

        try {
          const stageStartedAt = Date.now();
          const reminderGroupId = event.source.type === 'group' ? event.source.groupId : loadFamilyGroupId();
          if (reminderGroupId) {
            const reminderResult = await handleReminderMessage(userMessage, event.source.userId || '', reminderGroupId, gemini, hasReminderInvocation(userMessage));
            console.log(`[RouteTiming] REMINDER_DONE elapsed=${Date.now() - stageStartedAt}ms total=${Date.now() - routeReceivedAt}ms`);
            if (reminderResult.handled) {
              const reminderReply = reminderResult.message || (reminderResult.created ? buildStyleResponse('已記下，奴才會依旨提醒。') : buildStyleResponse('喳，奴才已處理這道 Reminder。'));
              const reminderMentionUserIds = event.source.type === 'group' ? reminderResult.mentionUserIds : [];
              const reminderMentionAll = event.source.type === 'group' && reminderResult.mentionAll === true;
              await sendReminderReply(event.replyToken, reminderReply, reminderMentionUserIds, reminderMentionAll);
              addToMemory(conversationKey, 'user', userMessage);
              addToMemory(conversationKey, 'assistant', reminderReply);
              return;
            }
          }
        } catch (error) {
          logError('Reminder 處理失敗', error);
          return;
        }

        try {
          const stageStartedAt = Date.now();
          const familyMemoryRoute = routeFamilyMemoryMessage(userMessage, {
            existingFunctionMatched: false,
            actorUserId: event.source.userId || '',
            integration: familyMemoryIntegration,
          });
          console.log(`[RouteTiming] MEMORY_DONE elapsed=${Date.now() - stageStartedAt}ms total=${Date.now() - routeReceivedAt}ms type=${familyMemoryRoute.type}`);
          if (familyMemoryRoute.type === 'executed') {
            const reply = buildStyleResponse(buildFamilyMemoryResponse(familyMemoryRoute.result));
            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: reply.slice(0, 5000) }] });
            addToMemory(conversationKey, 'user', userMessage);
            addToMemory(conversationKey, 'assistant', reply);
            return;
          }
        } catch (error) {
          logError('Family Memory 處理失敗', error);
          try {
            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: buildStyleResponse('總管暫時無法處理這道家庭記憶，請稍後再試。') }] });
          } catch (fallbackError) {
            logError('Family Memory 備援回覆失敗', fallbackError);
          }
          return;
        }

        if (!shouldInvokeController) {
          observeMessage({
            targetId: observerTargetId || '',
            userId: event.source.userId || '',
            message: userMessage,
            gemini,
            lineClient,
            traceId: observerTraceId,
            eventReceivedAt,
            replyDeadlineAt: eventReceivedAt + 4500,
          });
          return;
        }

        const cleanedMessage = cleanCallNames(userMessage);
        const activeCallNames = getActiveCallNames();
        const familyTargetResult = await resolveFamilyTarget(cleanedMessage, event.source.userId || '', activeCallNames, gemini);
        const aiContext = buildAiContext({
          conversationKey,
          actorUserId: event.source.userId || '',
          familyMember,
          familyTargetResult,
          history: normalizeConversationMessages(historyBeforeMessage),
          familyMemoryIntegration,
        });

        const aiStartedAt = Date.now();
        console.log(`[RouteTiming] PRE_AI elapsed=${aiStartedAt - routeReceivedAt}ms`);
        try {
          const reply = await runAiCore({
            userMessage: cleanedMessage,
            conversationHistory: buildConversationPrompt(historyBeforeMessage),
            aiContext,
            systemInstruction: SYSTEM_INSTRUCTION,
            geminiApiManager,
          });
          console.log(`[RouteTiming] AI_DONE elapsed=${Date.now() - aiStartedAt}ms total=${Date.now() - routeReceivedAt}ms`);
          addToMemory(conversationKey, 'user', userMessage);
          addToMemory(conversationKey, 'assistant', reply);
          await sendAiReply(event.replyToken, reply);
          console.log(`[RouteTiming] REPLY_DONE elapsed=${Date.now() - aiStartedAt}ms total=${Date.now() - routeReceivedAt}ms`);
        } catch (error) {
          logError('AI 回覆失敗', error);
          const fallback = getFallbackMessage(error);
          addToMemory(conversationKey, 'user', userMessage);
          addToMemory(conversationKey, 'assistant', fallback);
          try {
            await sendAiReply(event.replyToken, fallback);
          } catch (fallbackError) {
            logError('AI 備援回覆失敗', fallbackError);
          }
        }
      });
    }));
  } catch (error) {
    logError('Webhook 處理失敗', error);
  }
});

app.get('/', (_req, res) => {
  res.status(200).send('大內總管運作中');
});

app.listen(PORT, () => {
  console.log(`大內總管啟動於 ${PORT}`);
  startProactiveScheduler();
});
