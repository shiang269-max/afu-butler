import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

import { SYSTEM_INSTRUCTION } from './persona';
import { FAMILY_MEMBERS } from './family';
import { resolveFamilyTarget } from './family-resolver';

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
             * 目前說話的人。
             *
             * 這是根據 LINE userId 判斷，
             * 與「這次想找誰」完全不同。
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
             * 取得這次聊天來源的記憶區。
             */
            const conversationKey =
              getConversationKey(
                event,
              );


            /*
             * 取得目前訊息之前的記憶。
             */
            const historyBeforeMessage =
              getMemory(
                conversationKey,
              );


            /*
             * 主動呼叫總管的觸發詞。
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
             *
             * 先記憶。
             *
             * 私訊現在暫時當作群組測試 Observer。
             */
            if (!hasTrigger) {

              addToMemory(
                conversationKey,
                'user',
                userMessage,
              );


              /*
               * Observer 的 targetId：
               *
               * 私訊：
               * userId
               *
               * 群組：
               * groupId
               */
              const targetId =
                event.source.type === 'group'
                  ? event.source.groupId
                  : event.source.userId;


              if (!targetId) {
                return;
              }


              /*
               * 啟用 Observer。
               */
              observeMessage(
                {
                  targetId,

                  userMessage,

                  familyMember,

                  /*
                   * Observer 如果延遲幾秒，
                   * 到真正要回答時再取得最新記憶。
                   */
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


                  /*
                   * Observer 成功插話後，
                   * 把總管的話放進記憶。
                   */
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
             *
             * 立即正常回覆。
             */
            try {

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
               *
               * familyMember 永遠代表：
               *
               * 「這一句話是誰說的？」
               *
               * 絕對不是這次要找的人。
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
請依照這個人的家庭身份與互動方式回應。
不要把「目前說話者」與「這次要找的人」混為一談。
`
                  : `
【目前說話者】

目前說話者尚未登記在家庭成員資料中。
不要自行猜測其家庭身份。
`;


              /*
               * =====================================================
               * 找出使用者這次想找的家庭成員
               * =====================================================
               */
              const familyTarget =
                await resolveFamilyTarget(
                  cleanedMessage,
                  gemini,
                );


              if (familyTarget) {
                console.log(
                  'Family target:',
                  familyTarget.member.identity,
                  familyTarget.userId,
                );
              }


              /*
               * =====================================================
               * 目前要找的人
               * =====================================================
               *
               * familyTarget 與 familyMember 是兩個完全不同
               * 的概念。
               *
               * familyMember：
               * 誰正在說話。
               *
               * familyTarget：
               * 使用者要求總管找誰／聯絡誰。
               */
              const targetContext =
                familyTarget
                  ? `
【目前要找／聯絡的家庭成員】

身份：${familyTarget.member.identity}
總管對此人的稱呼：${familyTarget.member.mentionName}
LINE User ID：${familyTarget.userId}

這是一位真實存在、已登記的家庭成員。
程式已經根據家庭資料確認其身份。

請注意：
這個人不是目前說話者。
這個人是目前說話者要求你找／聯絡的對象。

不要把這個人的身份套到目前說話者身上。
不要否認這個人的存在。
不要說自己沒有實體的這位家庭成員。
`
                  : `
【目前要找／聯絡的家庭成員】

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

【最重要的判斷規則】

1. 目前說話者與目前要找的人是兩個不同概念。
2. familyMember 是說話者。
3. familyTarget 是要找／聯絡的人。
4. 如果兩者不同，絕對不要混淆。
5. 如果 familyTarget 已經存在，代表程式已經確認這位家庭成員。
6. 不要自行否認 familyTarget 的存在。
7. 自然使用家庭身份與稱呼，不要把設定資料直接朗讀出來。
`;


              /*
               * 將最近記憶與目前訊息組合。
               */
              const prompt =
                buildConversationPrompt(
                  historyBeforeMessage,
                  messageForGemini,
                );


              /*
               * =====================================================
               * 立即呼叫 Gemini
               * =====================================================
               *
               * 只有群組才真正執行 LINE Mention。
               *
               * 私訊即使解析到了 familyTarget，
               * 也不會嘗試 Mention。
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
               * Gemini 回覆成功後，
               * 將使用者訊息與 AI 回覆加入記憶。
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
               * 記錄完整錯誤。
               */
              logError(
                '主動呼叫總管失敗',
                error,
              );


              /*
               * 嘗試送出備援訊息。
               */
              try {

                await lineClient.replyMessage(
                  {
                    replyToken: event.replyToken,

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

                /*
                 * 如果連 LINE 備援回覆都失敗，
                 * 只記錄錯誤。
                 */
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
  familyTarget?: {
    userId: string;
    member: {
      identity: string;
      mentionName: string;
    };
  } | null,
): Promise<string> {


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


  const replyText =
    response.text?.trim() ||
    '我剛剛好像沒有想好要怎麼回答。';


  /*
   * 群組中有指定目標：
   * 使用真正的 LINE Mention。
   */
  if (familyTarget) {

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

  } else {

    /*
     * 一般文字回覆。
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
  },
);