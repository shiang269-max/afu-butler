import {
  AverageResult,
  FamilyMemory,
  FamilyMemoryStore,
  LifeRecord,
  MemoryQuery,
  RecordQuery,
  TrendResult,
  familyMemory,
} from './family-memory';

/**
 * =========================================================
 * 家庭記憶 Integration Boundary 1.0
 * =========================================================
 *
 * 這一層是 Family Memory Core 與未來 LINE / AI 之間的
 * 唯一入口邊界。
 *
 * 目前刻意不接：
 * - LINE webhook
 * - Vote
 * - Reminder
 * - Location
 * - 既有 memory.ts 對話上下文
 *
 * 目的不是增加新行為，而是先建立一個可獨立測試、可控的
 * 整合面，避免未來直接把 Family Memory 寫進既有 /webhook
 * 路由而造成流程衝突或競態。
 * =========================================================
 */

export class FamilyMemoryIntegration {
  constructor(private readonly store: FamilyMemoryStore = familyMemory) {}

  addMemory(input: {
    subject: string;
    content: string;
    tags?: string[];
  }): FamilyMemory {
    return this.store.addMemory(input);
  }

  listMemories(query: MemoryQuery = {}): FamilyMemory[] {
    return this.store.listMemories(query);
  }

  getMemory(id: string): FamilyMemory | null {
    return this.store.getMemory(id);
  }

  updateMemory(
    id: string,
    changes: {
      subject?: string;
      content?: string;
      tags?: string[];
    },
  ): FamilyMemory | null {
    return this.store.updateMemory(id, changes);
  }

  forgetMemory(id: string): boolean {
    return this.store.forgetMemory(id);
  }

  addRecord(input: {
    subject: string;
    category: string;
    value?: number;
    unit?: string;
    content?: string;
    occurredAt?: string | Date;
  }): LifeRecord {
    return this.store.addRecord(input);
  }

  listRecords(query: RecordQuery = {}): LifeRecord[] {
    return this.store.listRecords(query);
  }

  average(query: RecordQuery = {}): AverageResult {
    return this.store.average(query);
  }

  trend(query: RecordQuery = {}): TrendResult {
    return this.store.trend(query);
  }
}

export const familyMemoryIntegration = new FamilyMemoryIntegration();
