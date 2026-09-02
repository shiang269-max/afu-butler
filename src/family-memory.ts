import fs from 'node:fs';
import path from 'node:path';

/**
 * =========================================================
 * 家庭記憶 Core 1.0
 * =========================================================
 *
 * 這個模組目前完全獨立：
 * - 不接觸 Vote
 * - 不接觸 Reminder
 * - 不接觸 Location
 * - 不接觸 AI 自動判斷
 * - 不修改既有 memory.ts 的對話上下文功能
 *
 * 負責兩種資料：
 * 1. Memory：較穩定的家庭／人物資訊
 * 2. Record：帶有時間的生活紀錄與簡單數據
 *
 * 第一版先提供：
 * - 新增、查詢、修改、刪除記憶
 * - 新增、查詢生活紀錄
 * - 平均值
 * - 趨勢摘要
 * - JSON 持久化
 *
 * 尚未整合 LINE 路由；因此不會改變目前總管行為。
 * =========================================================
 */

export type FamilyMemory = {
  id: string;
  subject: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type LifeRecord = {
  id: string;
  subject: string;
  category: string;
  value?: number;
  unit?: string;
  content?: string;
  occurredAt: string;
  createdAt: string;
};

type MemoryFile = {
  memories: FamilyMemory[];
  records: LifeRecord[];
};

export type MemoryQuery = {
  subject?: string;
  keyword?: string;
  tag?: string;
};

export type RecordQuery = {
  subject?: string;
  category?: string;
  from?: string;
  to?: string;
};

export type AverageResult = {
  count: number;
  average: number | null;
  unit?: string;
};

export type TrendResult = {
  count: number;
  first: LifeRecord | null;
  latest: LifeRecord | null;
  change: number | null;
  direction: '上升' | '下降' | '持平' | '資料不足';
};

const DEFAULT_FILE_PATH =
  path.resolve(process.cwd(), 'data', 'family-memory.json');

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyFile(): MemoryFile {
  return {
    memories: [],
    records: [],
  };
}

export class FamilyMemoryStore {
  private readonly filePath: string;
  private data: MemoryFile;

  constructor(filePath = DEFAULT_FILE_PATH) {
    this.filePath = filePath;
    this.data = this.load();
  }

  private load(): MemoryFile {
    if (!fs.existsSync(this.filePath)) {
      return emptyFile();
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<MemoryFile>;

      return {
        memories: Array.isArray(parsed.memories)
          ? parsed.memories
          : [],
        records: Array.isArray(parsed.records)
          ? parsed.records
          : [],
      };
    } catch {
      return emptyFile();
    }
  }

  private save(): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      this.filePath,
      JSON.stringify(this.data, null, 2),
      'utf8',
    );
  }

  getFilePath(): string {
    return this.filePath;
  }

  addMemory(input: {
    subject: string;
    content: string;
    tags?: string[];
  }): FamilyMemory {
    const timestamp = nowIso();
    const memory: FamilyMemory = {
      id: createId('mem'),
      subject: input.subject.trim(),
      content: input.content.trim(),
      tags: (input.tags || [])
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.data.memories.push(memory);
    this.save();
    return clone(memory);
  }

  listMemories(query: MemoryQuery = {}): FamilyMemory[] {
    const subject = query.subject
      ? normalize(query.subject)
      : '';
    const keyword = query.keyword
      ? normalize(query.keyword)
      : '';
    const tag = query.tag
      ? normalize(query.tag)
      : '';

    return clone(
      this.data.memories.filter((memory) => {
        if (
          subject &&
          !normalize(memory.subject).includes(subject)
        ) {
          return false;
        }

        if (
          keyword &&
          !normalize(memory.content).includes(keyword)
        ) {
          return false;
        }

        if (
          tag &&
          !memory.tags.some(
            (item) => normalize(item) === tag,
          )
        ) {
          return false;
        }

        return true;
      }),
    );
  }

  getMemory(id: string): FamilyMemory | null {
    const memory = this.data.memories.find(
      (item) => item.id === id,
    );

    return memory ? clone(memory) : null;
  }

  updateMemory(
    id: string,
    changes: {
      subject?: string;
      content?: string;
      tags?: string[];
    },
  ): FamilyMemory | null {
    const memory = this.data.memories.find(
      (item) => item.id === id,
    );

    if (!memory) {
      return null;
    }

    if (changes.subject !== undefined) {
      memory.subject = changes.subject.trim();
    }

    if (changes.content !== undefined) {
      memory.content = changes.content.trim();
    }

    if (changes.tags !== undefined) {
      memory.tags = changes.tags
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    memory.updatedAt = nowIso();
    this.save();
    return clone(memory);
  }

  forgetMemory(id: string): boolean {
    const index = this.data.memories.findIndex(
      (memory) => memory.id === id,
    );

    if (index < 0) {
      return false;
    }

    this.data.memories.splice(index, 1);
    this.save();
    return true;
  }

  addRecord(input: {
    subject: string;
    category: string;
    value?: number;
    unit?: string;
    content?: string;
    occurredAt?: string | Date;
  }): LifeRecord {
    const timestamp = nowIso();
    const occurredAt = input.occurredAt
      ? new Date(input.occurredAt).toISOString()
      : timestamp;

    if (
      input.value !== undefined &&
      !Number.isFinite(input.value)
    ) {
      throw new Error('生活紀錄的 value 必須是有限數字');
    }

    const record: LifeRecord = {
      id: createId('rec'),
      subject: input.subject.trim(),
      category: input.category.trim(),
      value: input.value,
      unit: input.unit?.trim() || undefined,
      content: input.content?.trim() || undefined,
      occurredAt,
      createdAt: timestamp,
    };

    this.data.records.push(record);
    this.save();
    return clone(record);
  }

  listRecords(query: RecordQuery = {}): LifeRecord[] {
    const subject = query.subject
      ? normalize(query.subject)
      : '';
    const category = query.category
      ? normalize(query.category)
      : '';

    const from = query.from
      ? new Date(query.from).getTime()
      : Number.NEGATIVE_INFINITY;
    const to = query.to
      ? new Date(query.to).getTime()
      : Number.POSITIVE_INFINITY;

    return clone(
      this.data.records
        .filter((record) => {
          if (
            subject &&
            !normalize(record.subject).includes(subject)
          ) {
            return false;
          }

          if (
            category &&
            normalize(record.category) !== category
          ) {
            return false;
          }

          const occurredAt = new Date(
            record.occurredAt,
          ).getTime();

          return occurredAt >= from && occurredAt <= to;
        })
        .sort(
          (a, b) =>
            new Date(a.occurredAt).getTime() -
            new Date(b.occurredAt).getTime(),
        ),
    );
  }

  average(
    query: RecordQuery = {},
  ): AverageResult {
    const records = this.listRecords(query).filter(
      (record) => record.value !== undefined,
    );

    if (records.length === 0) {
      return {
        count: 0,
        average: null,
      };
    }

    const total = records.reduce(
      (sum, record) => sum + (record.value || 0),
      0,
    );

    const units = records
      .map((record) => record.unit)
      .filter(Boolean);
    const unit = units.length > 0
      ? units[0]
      : undefined;

    return {
      count: records.length,
      average: total / records.length,
      unit,
    };
  }

  trend(query: RecordQuery = {}): TrendResult {
    const records = this.listRecords(query).filter(
      (record) => record.value !== undefined,
    );

    if (records.length < 2) {
      return {
        count: records.length,
        first: records[0] || null,
        latest: records[0] || null,
        change: null,
        direction: '資料不足',
      };
    }

    const first = records[0];
    const latest = records[records.length - 1];
    const change =
      (latest.value as number) -
      (first.value as number);

    let direction: TrendResult['direction'] = '持平';

    if (change > 0) {
      direction = '上升';
    } else if (change < 0) {
      direction = '下降';
    }

    return {
      count: records.length,
      first,
      latest,
      change,
      direction,
    };
  }

  clearAll(): void {
    this.data = emptyFile();
    this.save();
  }
}

export const familyMemory = new FamilyMemoryStore();
