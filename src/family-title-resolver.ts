import {
  FAMILY_MEMBERS,
  FamilyMember,
} from './family';

import {
  getActiveStyleLanguage,
} from './styles/style-language';

export interface FamilyTitleTarget {
  userId: string;
  member: FamilyMember;
  title: string;
}

/**
 * =========================================================
 * Style 家庭稱呼解析
 * =========================================================
 *
 * Identity 仍由 FAMILY_MEMBERS 管理。
 * Style Language 只提供目前風格下的家庭成員稱呼。
 *
 * 本模組負責把：
 *
 *   「王后」／「船長」／「主上」...
 *
 * 解析回固定家庭身份。
 *
 * 注意：
 * - 唯一匹配才回傳
 * - 同一稱呼對應多人時不猜
 * - 找不到時回傳 null
 * - 不在 Memory 內建立第二套家庭身份資料
 * =========================================================
 */

function normalizeTitleEntry(
  entry: string,
): {
  memberName: string;
  titles: string[];
} | null {
  const separatorIndex = entry.indexOf('：');

  if (separatorIndex < 0) {
    return null;
  }

  const memberName =
    entry.slice(0, separatorIndex).trim();

  const titles =
    entry
      .slice(separatorIndex + 1)
      .split('、')
      .map((title) => title.trim())
      .filter(Boolean);

  if (!memberName || !titles.length) {
    return null;
  }

  return {
    memberName,
    titles,
  };
}

function findMemberByStyleName(
  memberName: string,
): Array<{
  userId: string;
  member: FamilyMember;
}> {
  return Object.entries(FAMILY_MEMBERS)
    .filter(([, member]) =>
      member.identity === memberName ||
      member.mentionName === memberName ||
      member.primaryNames.includes(memberName),
    )
    .map(([userId, member]) => ({
      userId,
      member,
    }));
}

export function resolveFamilyTitle(
  text: string,
): FamilyTitleTarget | null {
  const normalized = text.trim();

  if (!normalized) {
    return null;
  }

  const styleLanguage =
    getActiveStyleLanguage();

  const candidates = new Map<
    string,
    FamilyTitleTarget
  >();

  for (const entry of styleLanguage.familyTitles) {
    const normalizedEntry =
      normalizeTitleEntry(entry);

    if (!normalizedEntry) {
      continue;
    }

    const members =
      findMemberByStyleName(
        normalizedEntry.memberName,
      );

    if (members.length !== 1) {
      continue;
    }

    const {
      userId,
      member,
    } = members[0];

    for (const title of normalizedEntry.titles) {
      if (!normalized.includes(title)) {
        continue;
      }

      candidates.set(
        userId,
        {
          userId,
          member,
          title,
        },
      );
    }
  }

  if (candidates.size !== 1) {
    return null;
  }

  return [...candidates.values()][0];
}
