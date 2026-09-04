import { messagingApi } from '@line/bot-sdk';

import {
  loadFamilyGroupId,
  saveFamilyGroupId,
} from './family-group-state';

import {
  getDueReminders,
  claimReminder,
  markReminderSent,
  markReminderFailed,
  expireReminderBacklog,
} from './reminder';

import {
  canSendPush,
  getQuotaSnapshot,
} from './line-quota';


/*
 * =========================================================
 * 總管主動訊息排程器
 * =========================================================
 *
 * 固定作息：
 *
 * 06:00 → 早安
 * 22:30 → 晚安
 *
 * 冷場：
 *
 * 連續 6 小時沒有人說話
 * → 主動打破冷清
 *
 * 每日最多：
 *
 * 2 次冷場主動訊息
 *
 * 夜間：
 *
 * 23:00～06:00
 * → 禁止「冷場主動訊息」
 *
 * 注意：
 *
 * 夜間禁用只限制冷場主動。
 * 不影響正常對話、正常回覆、被叫、被問問題。
 */

const TIME_ZONE = 'Asia/Taipei';

const GOOD_NIGHT_HOUR = 22;
const GOOD_NIGHT_MINUTE = 30;
const ENABLE_GOOD_NIGHT = false;
const ENABLE_GOOD_MORNING = false;

const GOOD_MORNING_HOUR = 6;
const GOOD_MORNING_MINUTE = 0;

const SILENCE_HOURS = 48;
const SILENCE_QUIET_START_HOUR = 23;
const SILENCE_QUIET_END_HOUR = 6;
const MAX_SILENCE_REPLIES_PER_DAY = 2;
const CHECK_INTERVAL_MS = 30 * 1000;

interface GroupState {
  lastHumanMessageAt: number | null;
  lastGoodNightDate: string | null;
  lastGoodMorningDate: string | null;
  silenceRepliesDate: string | null;
  silenceRepliesCount: number;
}

const groupStates = new Map<string, GroupState>();

/* 防止 Scheduler tick 重疊，避免同一冷場狀態同時產生多次 Gemini / Push。 */
let schedulerCheckInFlight = false;

function loadSavedFamilyGroup(): void {
  const groupId = loadFamilyGroupId();

  if (!groupId) {
    console.log('[Proactive Scheduler] 尚未保存家庭群組 ID');
    return;
  }

  groupStates.set(groupId, {
    lastHumanMessageAt: null,
    lastGoodNightDate: null,
    lastGoodMorningDate: null,
    silenceRepliesDate: null,
    silenceRepliesCount: 0,
  });

  console.log('[Proactive Scheduler] 已恢復家庭群組', groupId);
}

function getGroupState(groupId: string): GroupState {
  let state = groupStates.get(groupId);

  if (!state) {
    state = {
      lastHumanMessageAt: null,
      lastGoodNightDate: null,
      lastGoodMorningDate: null,
      silenceRepliesDate: null,
      silenceRepliesCount: 0,
    };

    groupStates.set(groupId, state);
  }

  return state;
}

function getTaipeiNow(): {
  date: string;
  hour: number;
  minute: number;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function isSilenceQuietHours(hour: number): boolean {
  return hour >= SILENCE_QUIET_START_HOUR || hour < SILENCE_QUIET_END_HOUR;
}

export function recordFamilyGroupMessage(groupId: string): void {
  if (!groupId) return;

  saveFamilyGroupId(groupId);

  const state = getGroupState(groupId);
  state.lastHumanMessageAt = Date.now();
}

async function sendProactiveMessage(
  lineClient: messagingApi.MessagingApiClient,
  groupId: string,
  text: string,
): Promise<void> {
  const quota = await getQuotaSnapshot(lineClient);

  if (!canSendPush(quota, 'non-essential')) {
    console.log('[Quota Guard] 阻止非必要主動 Push。', JSON.stringify(quota));
    return;
  }

  await lineClient.pushMessage({
    to: groupId,
    messages: [
      {
        type: 'text',
        text: text.slice(0, 5000),
      },
    ],
  });
}

function getGoodNightMessage(): string {
  return '諸位，夜深了，奴才先向各位道一聲晚安。' +
    '若還有什麼吩咐，隨時喚奴才一聲便是。';
}

function getGoodMorningMessage(): string {
  return '諸位，早安。新的一日已開始，' +
    '奴才也在門口候著，諸位若有吩咐，隨時喚奴才便是。';
}

function isExactMinute(
  hour: number,
  minute: number,
  targetHour: number,
  targetMinute: number,
): boolean {
  return hour === targetHour && minute === targetMinute;
}

function resetDailySilenceCountIfNeeded(
  state: GroupState,
  date: string,
): void {
  if (state.silenceRepliesDate !== date) {
    state.silenceRepliesDate = date;
    state.silenceRepliesCount = 0;
  }
}

async function handleGoodNight(
  lineClient: messagingApi.MessagingApiClient,
  groupId: string,
  state: GroupState,
  date: string,
  hour: number,
  minute: number,
): Promise<void> {
  if (!ENABLE_GOOD_NIGHT) return;

  if (!isExactMinute(hour, minute, GOOD_NIGHT_HOUR, GOOD_NIGHT_MINUTE)) return;

  if (state.lastGoodNightDate === date) return;

  await sendProactiveMessage(lineClient, groupId, getGoodNightMessage());
  state.lastGoodNightDate = date;
}

async function handleGoodMorning(
  lineClient: messagingApi.MessagingApiClient,
  groupId: string,
  state: GroupState,
  date: string,
  hour: number,
  minute: number,
): Promise<void> {
  if (!ENABLE_GOOD_MORNING) return;

  if (!isExactMinute(hour, minute, GOOD_MORNING_HOUR, GOOD_MORNING_MINUTE)) return;

  if (state.lastGoodMorningDate === date) return;

  await sendProactiveMessage(lineClient, groupId, getGoodMorningMessage());
  state.lastGoodMorningDate = date;
  state.lastHumanMessageAt = Date.now();
}

async function handleSilence(
  lineClient: messagingApi.MessagingApiClient,
  groupId: string,
  state: GroupState,
  generateProactiveReply: (
    type: 'good-night' | 'silence',
  ) => Promise<string>,
  date: string,
  hour: number,
): Promise<void> {
  if (isSilenceQuietHours(hour)) return;
  if (state.lastHumanMessageAt === null) return;

  resetDailySilenceCountIfNeeded(state, date);

  if (state.silenceRepliesCount >= MAX_SILENCE_REPLIES_PER_DAY) return;

  const silenceDurationMs = Date.now() - state.lastHumanMessageAt;
  const silenceThresholdMs = SILENCE_HOURS * 60 * 60 * 1000;

  if (silenceDurationMs < silenceThresholdMs) return;

  const quota = await getQuotaSnapshot(lineClient);

  if (!canSendPush(quota, 'non-essential')) {
    console.log('[Quota Guard] 冷場主動訊息暫停:', JSON.stringify(quota));
    return;
  }

  const reply = await generateProactiveReply('silence');
  if (!reply || !reply.trim()) return;

  await sendProactiveMessage(lineClient, groupId, reply.trim());

  state.silenceRepliesCount += 1;
  state.lastHumanMessageAt = Date.now();
}

async function checkReminders(
  lineClient: messagingApi.MessagingApiClient,
): Promise<void> {
  const dueReminders = getDueReminders();

  for (const reminder of dueReminders) {
    if (!claimReminder(reminder.id)) continue;

    try {
      const quota = await getQuotaSnapshot(lineClient);

      if (!canSendPush(quota, 'reminder')) {
        console.log('[Quota Guard] Reminder 因剩餘額度為 0 而終結:', reminder.id, JSON.stringify(quota));
        markReminderFailed(reminder.id);
        continue;
      }

      if (reminder.target.type === 'all') {
        await lineClient.pushMessage({
          to: reminder.groupId,
          messages: [
            {
              type: 'textV2',
              text: `{target} ${reminder.content}`,
              substitution: {
                target: {
                  type: 'mention',
                  mentionee: { type: 'all' },
                },
              },
            },
          ],
        });
      } else {
        await lineClient.pushMessage({
          to: reminder.groupId,
          messages: [
            {
              type: 'textV2',
              text: `{target} ${reminder.content}`,
              substitution: {
                target: {
                  type: 'mention',
                  mentionee: {
                    type: 'user',
                    userId: reminder.target.userId,
                  },
                },
              },
            },
          ],
        });
      }

      markReminderSent(reminder.id);
      console.log('[Reminder] 已發送 Reminder:', reminder.id);
    } catch (error) {
      markReminderFailed(reminder.id);
      console.error('[Reminder] 發送 Reminder 失敗，已終結:', reminder.id, error);
    }
  }
}

async function checkGroup(
  lineClient: messagingApi.MessagingApiClient,
  groupId: string,
  generateProactiveReply: (
    type: 'good-night' | 'silence',
  ) => Promise<string>,
): Promise<void> {
  const now = getTaipeiNow();
  const state = getGroupState(groupId);

  resetDailySilenceCountIfNeeded(state, now.date);

  await handleGoodNight(
    lineClient,
    groupId,
    state,
    now.date,
    now.hour,
    now.minute,
  );

  await handleGoodMorning(
    lineClient,
    groupId,
    state,
    now.date,
    now.hour,
    now.minute,
  );

  await handleSilence(
    lineClient,
    groupId,
    state,
    generateProactiveReply,
    now.date,
    now.hour,
  );
}

export function startProactiveScheduler(
  lineClient: messagingApi.MessagingApiClient,
  generateProactiveReply: (
    type: 'good-night' | 'silence',
  ) => Promise<string>,
): void {
  const expiredBacklogCount = expireReminderBacklog();

  if (expiredBacklogCount > 0) {
    console.log('[Reminder] 啟動時已阻止 Backlog 補送:', expiredBacklogCount);
  }

  loadSavedFamilyGroup();

  console.log('總管主動訊息排程器已啟動');
  console.log('固定早安：暫停');
  console.log('固定晚安：暫停');
  console.log(`冷場門檻：${SILENCE_HOURS} 小時`);
  console.log(`冷場每日上限：${MAX_SILENCE_REPLIES_PER_DAY} 次`);
  console.log('冷場夜間禁用：23:00～06:00');

  const checkAllGroups = async (): Promise<void> => {
    if (schedulerCheckInFlight) {
      console.log('[Proactive Scheduler] 跳過重疊檢查。');
      return;
    }

    schedulerCheckInFlight = true;

    try {
      try {
        await checkReminders(lineClient);
      } catch (error) {
        console.error('[Reminder] Reminder 檢查失敗:', error);
      }

      for (const groupId of groupStates.keys()) {
        try {
          await checkGroup(
            lineClient,
            groupId,
            generateProactiveReply,
          );
        } catch (error) {
          console.error('總管主動訊息失敗:', groupId, error);
        }
      }
    } finally {
      schedulerCheckInFlight = false;
    }
  };

  void checkAllGroups();

  setInterval(
    () => {
      void checkAllGroups();
    },
    CHECK_INTERVAL_MS,
  );
}
