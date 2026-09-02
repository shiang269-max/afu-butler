import { MemoryQuery, RecordQuery } from './family-memory';

export type FamilyMemoryIntent =
  | {
      type: 'add_memory';
      input: { subject: string; content: string; tags?: string[] };
    }
  | {
      type: 'query_memory';
      query: MemoryQuery;
    }
  | {
      type: 'forget_memory';
      query: MemoryQuery;
    }
  | {
      type: 'add_record';
      input: {
        subject: string;
        category: string;
        value?: number;
        unit?: string;
        content?: string;
      };
    }
  | {
      type: 'list_records';
      query: RecordQuery;
    }
  | {
      type: 'average';
      query: RecordQuery;
    }
  | {
      type: 'trend';
      query: RecordQuery;
    }
  | {
      type: 'unknown';
      text: string;
    };

const SUBJECTS = ['爸爸', '媽媽', '哥哥', '姐姐', '弟弟', '妹妹', '我'];

const MEMORY_CALL_NAMES = ['阿福'];

function hasMemoryCallName(text: string): boolean {
  return MEMORY_CALL_NAMES.some((callName) => text.includes(callName));
}

function extractSubject(text: string): string | undefined {
  return SUBJECTS.find((subject) => text.includes(subject));
}

function extractUnit(text: string): string | undefined {
  const match = text.match(/(公斤|kg|小時|分鐘|度|公分|公尺|次|元)/i);
  return match?.[1];
}

function extractValue(text: string): number | undefined {
  const match = text.match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}

function extractCategory(text: string): string | undefined {
  if (/體重/.test(text)) return '體重';
  if (/睡眠|睡覺|睡多久|睡了多久/.test(text)) return '睡眠';
  if (/起床|起來/.test(text)) return '起床';
  if (/身高/.test(text)) return '身高';
  if (/步數|走了幾步/.test(text)) return '步數';
  return undefined;
}

function extractContentAfterSubject(text: string, subject?: string): string {
  let content = text
    .replace(/^(阿福[，,、]?\s*)?(請)?(幫我)?(記住|記得|記下|保存|存下)\s*/u, '')
    .trim();

  if (subject && content.startsWith(subject)) {
    content = content.slice(subject.length).trim();
  }

  return content.replace(/^(是|為|：|:)/, '').trim();
}

function extractMemoryQuery(text: string): MemoryQuery {
  const subject = extractSubject(text);
  let keyword = text
    .replace(/^(阿福[，,、]?\s*)?(請)?(幫我)?(查|找|搜尋|看看|列出|告訴我)\s*/u, '')
    .replace(/(記憶|記得|事情|資料|資訊)/g, '')
    .trim();

  if (subject) {
    keyword = keyword
      .replace(new RegExp(subject, 'g'), '')
      .replace(/^[的之]\s*/u, '')
      .replace(/^[、，,：:]\s*/u, '')
      .trim();
  }

  return {
    ...(subject ? { subject } : {}),
    ...(keyword ? { keyword } : {}),
  };
}

function extractRecordQuery(text: string): RecordQuery {
  const subject = extractSubject(text);
  const category = extractCategory(text);
  const unit = extractUnit(text);

  return {
    ...(subject ? { subject } : {}),
    ...(category ? { category } : {}),
    ...(unit ? { unit } : {}),
  };
}

export function parseFamilyMemoryIntent(text: string): FamilyMemoryIntent {
  const normalized = text.trim();

  if (!normalized) {
    return { type: 'unknown', text: normalized };
  }

  const subject = extractSubject(normalized);
  const memoryCallNamePresent = hasMemoryCallName(normalized);

  if (/^(阿福[，,、]?\s*)?(請)?(幫我)?(記住|記得|記下|保存|存下)/u.test(normalized)) {
    const content = extractContentAfterSubject(normalized, subject);
    if (!content) return { type: 'unknown', text: normalized };

    return {
      type: 'add_memory',
      input: {
        subject: subject || '家庭',
        content,
      },
    };
  }

  const category = extractCategory(normalized);
  const value = extractValue(normalized);
  if (category && value !== undefined) {
    return {
      type: 'add_record',
      input: {
        subject: subject || '我',
        category,
        value,
        ...(extractUnit(normalized)
          ? { unit: extractUnit(normalized) }
          : {}),
      },
    };
  }

  if (!memoryCallNamePresent) {
    return { type: 'unknown', text: normalized };
  }

  const callBody = normalized
    .replace(/^阿福[，,、]?\s*/u, '')
    .replace(/^(請)?(幫我)?\s*/u, '')
    .trim();

  if (/^(忘記|忘了|刪除記憶|不要記得)/u.test(callBody)) {
    const queryText = callBody
      .replace(/^(忘記|忘了|刪除記憶|不要記得)\s*/u, '')
      .trim();

    return {
      type: 'forget_memory',
      query: extractMemoryQuery(queryText),
    };
  }

  if (/平均/u.test(callBody)) {
    return {
      type: 'average',
      query: extractRecordQuery(callBody),
    };
  }

  if (/趨勢|變化|上升還是下降/u.test(callBody)) {
    return {
      type: 'trend',
      query: extractRecordQuery(callBody),
    };
  }

  if (/^(查|找|搜尋|看看|列出|有哪些|有沒有)/u.test(callBody)) {
    return {
      type: category ? 'list_records' : 'query_memory',
      query: category
        ? extractRecordQuery(callBody)
        : extractMemoryQuery(callBody),
    };
  }

  return { type: 'unknown', text: normalized };
}
