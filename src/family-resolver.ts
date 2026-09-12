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

  // 沒有任何家庭成員目標線索時，不必再呼叫 Gemini 做一次全家搜尋。
  // 這條路徑常見於「阿福，今天怎樣？」「阿福，你睡著了嗎？」等一般 Controller 對話。
  const familyTargetWords = [
    '本人', '大人', '全家', '全家人',
    '幫我', '幫他', '幫她', '問他', '問她', '通知他', '通知她',
    '告訴他', '告訴她', '找他', '找她', '幫', '替', '查', '設定',
    '提醒', '記得', '記下', '記住', '告知', '詢問', '通知', '安排',
    '修改', '取消', '刪除', '早安', '午安', '晚安', '嗨', '哈囉', '你好',
  ];
  const hasTargetCue = familyTargetWords.some((word) => message.includes(word));
  const hasKnownMemberName = Object.values(FAMILY_MEMBERS).some((member) => {
    const identity = typeof member?.identity === 'string' ? member.identity : '';
    const mentionName = typeof member?.mentionName === 'string' ? member.mentionName : '';
    return (identity && message.includes(identity)) || (mentionName && message.includes(mentionName));
  });

  if (!hasTargetCue && !hasKnownMemberName) {
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
      httpOptions: {
        timeout: 15_000,
      },
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
