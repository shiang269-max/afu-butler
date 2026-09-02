import { FamilyMemoryIntegration } from './family-memory-integration';

function formatValue(value: number | undefined, unit: string | undefined, content: string | undefined): string {
  if (value !== undefined) return `${value}${unit ? ` ${unit}` : ''}`;
  return content || '已記錄';
}

/** 將 Family Memory 轉成 AI 可讀的長期家庭記憶 Context。只讀，不修改 Memory，也不負責 AI 判斷。 */
export function buildFamilyMemoryAiContext(integration: FamilyMemoryIntegration): string {
  const memories = integration.listMemories();
  const records = integration.listRecords();

  const memorySection = memories.length > 0
    ? memories.map((memory) => `- ${memory.subject}：${memory.content}${memory.tags.length ? `（${memory.tags.join('、')}）` : ''}`).join('\n')
    : '目前沒有家庭長期記憶。';

  const recordSection = records.length > 0
    ? records.map((record) => `- ${record.occurredAt}｜${record.subject}｜${record.category}：${formatValue(record.value, record.unit, record.content)}`).join('\n')
    : '目前沒有生活紀錄。';

  return [
    '【家庭長期記憶】',
    '',
    '以下是目前 Family Memory 中已明確保存的資料。',
    '這些資料是家庭成員過去明確要求總管記住的內容。',
    '不要自行新增不存在的記憶，也不要因為目前沒有相關資料就猜測。',
    '',
    memorySection,
    '',
    '【家庭生活紀錄】',
    '',
    '以下是目前已保存的時間性生活紀錄。',
    recordSection,
  ].join('\n');
}
