import { GoogleGenAI } from '@google/genai';

import {
  FAMILY_MEMBERS,
  FamilyMember,
} from './family';

import {
  hasKnownFamilyTitle,
  resolveFamilyTitle,
} from './family-title-resolver';

export interface FamilyTarget {
  userId: string;
  member: FamilyMember;
}

/**
 * 根據使用者自然語言，判斷他想找的是哪一位家庭成員。
 *
 * 已知的 Style 家庭稱呼優先使用 deterministic resolver。
 * 如果訊息包含目前 Style 的家庭稱呼但無法唯一判斷，
 * 必須直接回傳 null，不交給 Gemini 猜測。
 */
export async function resolveFamilyTarget(
  message: string,
  gemini: GoogleGenAI,
): Promise<FamilyTarget | null> {
  const styleTarget = resolveFamilyTitle(message);

  if (styleTarget) {
    return {
      userId: styleTarget.userId,
      member: styleTarget.member,
    };
  }

  if (hasKnownFamilyTitle(message)) {
    return null;
  }

  const members = Object.entries(FAMILY_MEMBERS).map(
    ([userId, member]) => ({
      userId,
      identity: member.identity,
      aliases: member.aliases,
      role: member.role,
    }),
  );

  const response = await gemini.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: `
你是家庭成員辨識器。

請判斷使用者這句話想找哪一位家庭成員。

家庭成員：
${JSON.stringify(members, null, 2)}

使用者訊息：
${message}

規則：
1. 根據家庭成員的 identity、aliases 與 role 判斷。
2. aliases 是家庭成員平常可能被家人使用的其他稱呼。
3. 「小兒子」應理解為小兒子。
4. 「大兒子」應理解為大兒子。
5. 「哥哥」應理解為大兒子。
6. 「辰」應理解為小兒子。
7. 「妻子」、「老婆」、「老婆大人」等，可理解為妻子。
8. 「我」、「你本人」等，可理解為你本人。
9. 不確定時不要猜，直接回覆 null。
10. 只輸出對應的 userId。
11. 找不到時只輸出 null。
`,
    config: {
      temperature: 0,
    },
  });

  const result = response.text?.trim();

  if (!result || result === 'null') {
    return null;
  }

  const userId = result.replace(/[`"'\\s]/g, '');
  const member = FAMILY_MEMBERS[userId];

  if (!member) {
    return null;
  }

  return {
    userId,
    member,
  };
}
