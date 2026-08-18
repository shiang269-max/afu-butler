import 'dotenv/config';

import { GoogleGenAI } from '@google/genai';
const apiKey =
  process.env.GEMINI_API_KEY?.trim();

if (!apiKey) {
  throw new Error(
    '找不到 GEMINI_API_KEY，請確認 .env。',
  );
}

const ai =
  new GoogleGenAI({
    apiKey,
  });

async function main() {

  console.log(
    '[Gemini Search Test] 開始單次 Search 測試',
  );

  try {

    const response =
      await ai.models.generateContent({
        model:
          'gemini-3.5-flash-lite',

        contents:
          '請搜尋板橋瑞安街附近目前適合吃飯的餐廳，列出幾家實際存在的店家。',

        config: {
          tools: [
            {
              googleSearch: {},
            },
          ],
        },
      });

    console.log(
      '[Gemini Search Test] 成功',
    );

    console.log(
      '[Gemini Search Test] 回答：',
    );

    console.log(
      response.text ?? '',
    );

  } catch (error) {

    console.error(
      '[Gemini Search Test] 失敗',
    );

    console.error(
      error,
    );
  }
}

main();