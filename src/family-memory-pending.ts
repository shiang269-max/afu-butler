import { FamilyMemory } from './family-memory';

export type FamilyMemoryPendingOperation = {
  actorUserId: string;
  memories: FamilyMemory[];
};

const PENDING_TTL_MS = 10 * 60 * 1000;

type PendingEntry = {
  operation: FamilyMemoryPendingOperation;
  expiresAt: number;
};

const pending = new Map<string, PendingEntry>();

function cleanupExpired(now = Date.now()): void {
  for (const [actorUserId, entry] of pending) {
    if (entry.expiresAt <= now) {
      pending.delete(actorUserId);
    }
  }
}

export function setPendingFamilyMemory(
  actorUserId: string,
  memories: FamilyMemory[],
): void {
  if (!actorUserId || memories.length === 0) {
    pending.delete(actorUserId);
    return;
  }

  pending.set(actorUserId, {
    operation: {
      actorUserId,
      memories: memories.map((memory) => ({ ...memory, tags: [...memory.tags] })),
    },
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
}

export function hasPendingFamilyMemory(actorUserId: string): boolean {
  if (!actorUserId) return false;

  cleanupExpired();
  return pending.has(actorUserId);
}

export function consumePendingFamilyMemory(
  actorUserId: string,
): FamilyMemoryPendingOperation | null {
  if (!actorUserId) return null;

  cleanupExpired();

  const entry = pending.get(actorUserId) || null;
  pending.delete(actorUserId);
  return entry?.operation || null;
}

export function clearPendingFamilyMemory(actorUserId: string): void {
  if (actorUserId) pending.delete(actorUserId);
}
