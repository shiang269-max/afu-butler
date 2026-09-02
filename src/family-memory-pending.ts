import { FamilyMemory } from './family-memory';

export type FamilyMemoryPendingOperation = {
  actorUserId: string;
  memories: FamilyMemory[];
};

const pending = new Map<string, FamilyMemoryPendingOperation>();

export function setPendingFamilyMemory(
  actorUserId: string,
  memories: FamilyMemory[],
): void {
  if (!actorUserId || memories.length === 0) {
    pending.delete(actorUserId);
    return;
  }

  pending.set(actorUserId, {
    actorUserId,
    memories: memories.map((memory) => ({ ...memory, tags: [...memory.tags] })),
  });
}

export function consumePendingFamilyMemory(
  actorUserId: string,
): FamilyMemoryPendingOperation | null {
  if (!actorUserId) return null;

  const operation = pending.get(actorUserId) || null;
  pending.delete(actorUserId);
  return operation;
}

export function clearPendingFamilyMemory(actorUserId: string): void {
  if (actorUserId) pending.delete(actorUserId);
}
