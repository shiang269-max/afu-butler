import {
  AverageResult,
  FamilyMemory,
  LifeRecord,
  TrendResult,
} from './family-memory';
import { FamilyMemoryIntegration } from './family-memory-integration';
import { FamilyMemoryIntent } from './family-memory-intent';

export type FamilyMemoryExecutionResult =
  | { type: 'memory_added'; memory: FamilyMemory }
  | { type: 'memories_found'; memories: FamilyMemory[] }
  | { type: 'memory_forgotten'; memory: FamilyMemory }
  | { type: 'record_added'; record: LifeRecord }
  | { type: 'records_found'; records: LifeRecord[] }
  | { type: 'average'; result: AverageResult }
  | { type: 'trend'; result: TrendResult }
  | {
      type: 'ambiguous_forget';
      memories: FamilyMemory[];
    }
  | { type: 'not_found'; query: string };

export function executeFamilyMemoryIntent(
  intent: FamilyMemoryIntent,
  integration: FamilyMemoryIntegration,
): FamilyMemoryExecutionResult | null {
  switch (intent.type) {
    case 'add_memory':
      return {
        type: 'memory_added',
        memory: integration.addMemory(intent.input),
      };

    case 'query_memory': {
      const memories = integration.listMemories(intent.query);
      return {
        type: memories.length ? 'memories_found' : 'not_found',
        ...(memories.length
          ? { memories }
          : { query: JSON.stringify(intent.query) }),
      } as FamilyMemoryExecutionResult;
    }

    case 'forget_memory': {
      const memories = integration.listMemories(intent.query);

      if (memories.length !== 1) {
        return memories.length === 0
          ? {
              type: 'not_found',
              query: JSON.stringify(intent.query),
            }
          : {
              type: 'ambiguous_forget',
              memories,
            };
      }

      const target = memories[0];
      if (!integration.forgetMemory(target.id)) {
        return {
          type: 'not_found',
          query: JSON.stringify(intent.query),
        };
      }

      return {
        type: 'memory_forgotten',
        memory: target,
      };
    }

    case 'add_record':
      return {
        type: 'record_added',
        record: integration.addRecord(intent.input),
      };

    case 'list_records': {
      const records = integration.listRecords(intent.query);
      return records.length
        ? { type: 'records_found', records }
        : {
            type: 'not_found',
            query: JSON.stringify(intent.query),
          };
    }

    case 'average':
      return {
        type: 'average',
        result: integration.average(intent.query),
      };

    case 'trend':
      return {
        type: 'trend',
        result: integration.trend(intent.query),
      };

    case 'unknown':
      return null;
  }
}
