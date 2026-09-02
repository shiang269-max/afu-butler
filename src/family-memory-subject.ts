import { FAMILY_MEMBERS } from './family';

/**
 * 將 Memory 中的「我／未指定人物」解析成實際發話者的家庭身份。
 *
 * Family Memory Core 不知道 LINE userId；身份解析留在 Integration Boundary。
 */
export function resolveFamilyMemorySubject(
  subject: string | undefined,
  actorUserId: string | undefined,
): string | undefined {
  const actor = actorUserId
    ? FAMILY_MEMBERS[actorUserId]
    : undefined;

  if (!actor) {
    return subject;
  }

  const primaryName = actor.primaryNames?.[0] || actor.identity;

  if (!subject || subject === '我' || subject === '家庭') {
    return primaryName;
  }

  return subject;
}
