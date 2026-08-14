import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

import { SYSTEM_INSTRUCTION } from './persona';
import { FAMILY_MEMBERS } from './family';
import { resolveFamilyTarget } from './family-resolver';
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
} from './observer';

import {
  getFallbackMessage,
  logError,
} from './error-handler';


dotenv.config();


const app = express();


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


app.get('/', (req, res) => {
  res.send(
    'LINE第五個家人正在運作',
  );
});


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


            console.log(
              'LINE event source:',
              event.source.type,
              'userId:',
              event.source.userId,
              'message:',
              userMessage,
            );


            /*
             * 目前只處理私訊與群組。
             */
            if (
              event.source.type !== 'user' &&
              event.source.type !== 'group'
            ) {
              return;
            }


            /*
             * =====================================================
             * 主動排程器：記錄家庭群組最後一次有人說話
             * =====================================================
             *
             * 只有真正的家庭群組訊息才會更新冷場計時。
             * 私訊不會影響家庭群組的冷場判定。
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
             * 取得這次聊天來源的記憶區
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
             */
            const historyBeforeMessage =
              getMemory(
                conversationKey,
              );


            /*
             * =====================================================
             * 主動呼叫總管的觸發詞
             * =====================================================
             */
            const triggerWords = [
              '大內總管',
              '總管',
              '內內',
              '喳子',
            ];


            const hasTrigger =
              triggerWords.some(
                (word) =>
                  userMessage.includes(
                    word,
                  ),
              );


            /*
             * =====================================================
             * 沒有叫總管
             * =====================================================
             */
            if (!hasTrigger) {

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
                return;
              }


              /*
               * Observer
               */
              observeMessage(
                {
                  targetId,

                  userMessage,

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
             * 有叫「總管」
             * =====================================================
             */
            try {

              /*
               * 去掉總管呼叫名稱。
               */
              const cleanedMessage =
                userMessage
                  .replace(/大內總管/g, '')
                  .replace(/總管/g, '')
                  .replace(/內內/g, '')
                  .replace(/喳子/g, '')
                  .trim();


              /*
               * =====================================================
               * 目前說話者
               * =====================================================
               */
              const speakerContext =
                familyMember
                  ? `
【目前說話者】

身份：${familyMember.identity}
家庭角色：${familyMember.role}
家庭地位：${familyMember.authority}
個性：${familyMember.personality}
互動方式：${familyMember.interaction}
總管對此人的稱呼：${familyMember.mentionName}

這個人就是目前正在和你說話的人。
請依照這個人的家庭身份與互動方式自然回應。

不要把目前說話者與目前要找／聯絡的人混為一談。
`
                  : `
【目前說話者】

目前說話者尚未登記在家庭成員資料中。
不要自行猜測其家庭身份。
`;


              /*
               * =====================================================
               * 判斷是否要叫所有人
               * =====================================================
               */
              const allTargetWords = [
                '所有人',
                '大家',
                '全家人',
                '全員',
              ];


              const wantsAll =
                allTargetWords.some(
                  (word) =>
                    cleanedMessage.includes(
                      word,
                    ),
                );


              /*
               * =====================================================
               * 解析目標人物
               * =====================================================
               *
               * ALL：
               * 直接指定全體。
               *
               * USER：
               * 使用原本的 family-resolver。
               *
               * 這裡會把 Resolver 回傳的 FamilyTarget
               * 補上一個 type: 'user'，
               * 讓 TypeScript 可以明確區分兩種目標。
               */
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
               * 紀錄解析結果
               * =====================================================
               */
              if (familyTarget) {

                if (
                  familyTarget.type === 'all'
                ) {

                  console.log(
                    'Family target: ALL',
                  );

                } else {

                  console.log(
                    'Family target:',
                    familyTarget.member.identity,
                    familyTarget.userId,
                  );
                }
              }


              /*
               * =====================================================
               * 目標人物上下文
               * =====================================================
               */
              const targetContext =
                familyTarget
                  ? familyTarget.type === 'all'
                    ? `
【目前要找／聯絡的對象】

目標：全體家庭成員

使用者要求你聯絡所有人。
程式會在群組中使用真正的 LINE @All。

不要把「所有人」當成某一個家庭成員。
`
                    : `
【目前要找／聯絡的家庭成員】

身份：${familyTarget.member.identity}
總管對此人的稱呼：${familyTarget.member.mentionName}
LINE User ID：${familyTarget.userId}

這是一位真實存在、已登記的家庭成員。
程式已經確認這個人的身份。

這個人不是目前說話者。
這個人是目前說話者要求你找／聯絡的對象。

不要否認這個人的存在。
不要說自己沒有實體的這位家庭成員。
`
                  : `
【目前要找／聯絡的對象】

目前沒有解析出特定的家庭成員。
不要自行猜測目標人物。
`;


              /*
               * =====================================================
               * 提供給 Gemini 的完整上下文
               * =====================================================
               */
              const messageForGemini =
                `${speakerContext}

${targetContext}

【目前訊息】

${cleanedMessage || '有人在聊天中叫你，請自然地回應。'}

【重要判斷規則】

1. 目前說話者與目前要找的人是兩個不同概念。
2. familyMember 代表目前說話者。
3. familyTarget 代表目前要找／聯絡的對象。
4. 如果兩者不同，絕對不要混淆。
5. 如果 familyTarget 已經存在，代表程式已經確認這位家庭成員。
6. 不要自行否認 familyTarget 的存在。
7. 如果目標是全體家庭成員，程式會執行真正的 LINE @All。
8. 自然理解家庭設定，不要直接朗讀設定資料。
`;


              /*
               * =====================================================
               * 建立 Gemini Prompt
               * =====================================================
               */
              const prompt =
                buildConversationPrompt(
                  historyBeforeMessage,
                  messageForGemini,
                );


              /*
               * =====================================================
               * Gemini 回覆
               * =====================================================
               */
              const replyText =
                await replyWithGemini(
                  event.replyToken,
                  prompt,
                  event.source.type === 'group'
                    ? familyTarget
                    : null,
                );


              /*
               * =====================================================
               * 記憶
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


/* =========================================================
 * Gemini 正常主動回覆
 * ========================================================= */


async function replyWithGemini(
  replyToken: string,
  prompt: string,

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

): Promise<string> {

  /*
   * =========================================================
   * 呼叫 Gemini
   * =========================================================
   */
  const response =
    await gemini.models.generateContent(
      {
        model:
          'gemini-3.5-flash-lite',

        contents:
          prompt,

        config: {
          systemInstruction:
            SYSTEM_INSTRUCTION,
        },
      },
    );


  /*
   * =========================================================
   * Gemini 回覆內容
   * =========================================================
   */
  const replyText =
    response.text?.trim() ||
    '我剛剛好像沒有想好要怎麼回答。';


  /*
   * =========================================================
   * 有指定目標
   * =========================================================
   */
  if (familyTarget) {

    /*
     * ---------------------------------------------------------
     * @ALL
     * ---------------------------------------------------------
     */
    if (
      familyTarget.type === 'all'
    ) {

      await lineClient.replyMessage(
        {
          replyToken,

          messages: [
            {
              type: 'textV2',

              text:
                `{target} ${replyText.slice(0, 4950)}`,

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


    } else {

      /*
       * ---------------------------------------------------------
       * @單一家庭成員
       * ---------------------------------------------------------
       */
      await lineClient.replyMessage(
        {
          replyToken,

          messages: [
            {
              type: 'textV2',

              text:
                `{target} ${replyText.slice(0, 4950)}`,

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
    }


  } else {

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


  return replyText;
}


/* =========================================================
 * 主動訊息產生器
 * =========================================================
 *
 * 固定晚安：
 * 直接使用指定內容，不讓 Gemini 自由改寫。
 *
 * 冷場：
 * 交給 Gemini 依照總管人格自然生成一句短話。
 * ========================================================= */

async function generateProactiveReply(
  type: 'good-night' | 'silence',
): Promise<string> {

  if (type === 'good-night') {
    return (
      '諸位，夜深了，奴才先向各位道一聲晚安。' +
      '若還有什麼吩咐，隨時喚奴才一聲便是。'
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
    '諸位都如此安靜，奴才倒有些不習慣了。'
  );
}


/* =========================================================
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