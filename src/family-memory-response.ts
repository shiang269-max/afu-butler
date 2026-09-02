import { FamilyMemoryExecutionResult } from './family-memory-intent-executor';

function formatRecordValue(
  value: number | undefined,
  unit: string | undefined,
  content: string | undefined,
): string {
  if (value !== undefined) {
    return `${value}${unit ? ` ${unit}` : ''}`;
  }

  return content || '已記錄';
}

function formatMemoryList(
  memories: Extract<FamilyMemoryExecutionResult, { type: 'memories_found' }>,
): string {
  return memories.memories
    .slice(0, 10)
    .map(
      (memory, index) =>
        `${index + 1}. ${memory.subject}：${memory.content}` +
        (memory.tags.length ? `（${memory.tags.join('、')}）` : ''),
    )
    .join('\n');
}

function formatRecordList(
  records: Extract<FamilyMemoryExecutionResult, { type: 'records_found' }>,
): string {
  return records.records
    .slice(0, 10)
    .map(
      (record, index) =>
        `${index + 1}. ${record.occurredAt} ${record.subject}｜${record.category}：${formatRecordValue(record.value, record.unit, record.content)}`,
    )
    .join('\n');
}

export function buildFamilyMemoryResponse(
  result: FamilyMemoryExecutionResult,
): string {
  switch (result.type) {
    case 'memory_added':
      return `已記住：${result.memory.subject}，${result.memory.content}`;

    case 'memories_found':
      return `目前找到 ${result.memories.length} 筆記憶：\n${formatMemoryList(result)}`;

    case 'memory_forgotten':
      return `已忘記：${result.memory.subject}，${result.memory.content}`;

    case 'record_added':
      return `已記錄：${result.record.subject}｜${result.record.category}：${formatRecordValue(result.record.value, result.record.unit, result.record.content)}`;

    case 'records_found':
      return `目前找到 ${result.records.length} 筆生活紀錄：\n${formatRecordList(result)}`;

    case 'average':
      if (result.result.average === null) {
        return '目前沒有足夠的數值紀錄可以計算平均值。';
      }
      return `平均值：${result.result.average}${result.result.unit ? ` ${result.result.unit}` : ''}（共 ${result.result.count} 筆）`;

    case 'trend':
      if (result.result.count < 2 || result.result.first === null || result.result.latest === null) {
        return '目前沒有足夠的數值紀錄可以判斷趨勢。';
      }
      return `趨勢：${result.result.direction}，從 ${result.result.first} 變為 ${result.result.latest}，變化 ${result.result.change}`;

    case 'ambiguous_forget':
      return `找到多筆可能的記憶，暫時不直接刪除：\n${result.memories
        .slice(0, 10)
        .map((memory, index) => `${index + 1}. ${memory.subject}：${memory.content}`)
        .join('\n')}`;

    case 'not_found':
      return '目前找不到符合條件的記憶或生活紀錄。';
  }
}
