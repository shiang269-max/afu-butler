import { GoogleGenAI } from '@google/genai';
import {
  FAMILY_MEMBERS,
  FamilyMember,
} from './family';

export interface FamilyTarget {
  userId: string;
  member: FamilyMember;
}

/**
 * 根據使用者自然語言，
 * 判斷他想找的是哪一位家庭成員。
 */
export async function resolveFamilyTarget(
  message: string,
  gemini: GoogleGenAI,
): Promise<FamilyTarget | null> {

  const members = Object.entries(
    FAMILY_MEMBERS,
  ).map(([userId, member]) => ({
    userId,
    identity: member.identity,
    role: member.role,
  }));

  const response =
    await gemini.models.generateContent({
      model: 'gemini-3.5-flash-lite',

      contents: `
你是家庭成員辨識器。

請判斷使用者這句話想找哪一位家庭成員。

家庭成員：
${JSON.stringify(members, null, 2)}

使用者訊息：
${message}

規則：
1. 只根據家庭成員的 identity 與 role 判斷。
2. 「小兒子」應理解為小兒子。
3. 「大兒子」應理解為大兒子。
4. 「妻子」、「老婆」、「老婆大人」等，可理解為妻子。
5. 「我」、「你本人」等，可理解為你本人。
6. 不確定時不要猜，直接回覆 null。
7. 只輸出對應的 userId。
8. 找不到時只輸出 null。
`,

      config: {
        temperature: 0,
      },
    });

  const result =
    response.text?.trim();

  if (!result || result === 'null') {
    return null;
  }

  const userId =
    result.replace(/[`"'\\s]/g, '');

  const member =
    FAMILY_MEMBERS[userId];

  if (!member) {
    return null;
  }

  return {
    userId,
    member,
  };
}