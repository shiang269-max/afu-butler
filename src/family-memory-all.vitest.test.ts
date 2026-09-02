import { it } from 'vitest';

async function runLegacyTestFile(path: string): Promise<void> {
  process.exitCode = undefined;
  await import(path);
  await new Promise<void>((resolve) => setImmediate(resolve));

  if (process.exitCode !== undefined && process.exitCode !== 0) {
    const exitCode = process.exitCode;
    process.exitCode = undefined;
    throw new Error(`舊版測試 ${path} 執行失敗，exitCode=${exitCode}`);
  }

  process.exitCode = undefined;
}

it('Family Memory Core 1.0：核心測試', async () => {
  await runLegacyTestFile('./family-memory.test');
});

it('Family Memory 2.0：統計一致性與邊界測試', async () => {
  await runLegacyTestFile('./family-memory-v2.test');
});

it('Family Memory 2.0：資料隔離測試', async () => {
  await runLegacyTestFile('./family-memory-integrity.test');
});

it('Family Memory 2.0：輸入完整性測試', async () => {
  await runLegacyTestFile('./family-memory-input-integrity.test');
});

it('Family Memory 2.0：持久化測試', async () => {
  await runLegacyTestFile('./family-memory-persistence.test');
});

it('Family Memory 2.0：查詢邊界測試', async () => {
  await runLegacyTestFile('./family-memory-query-edge.test');
});

it('Family Memory 2.0：CRUD 邊界測試', async () => {
  await runLegacyTestFile('./family-memory-crud-edge.test');
});

it('Family Memory 2.0：統計邊界測試', async () => {
  await runLegacyTestFile('./family-memory-statistics-boundary.test');
});

it('Family Memory 2.0：競態測試', async () => {
  await runLegacyTestFile('./family-memory-concurrency.test');
});

it('Family Memory 2.0：共享檔案測試', async () => {
  await runLegacyTestFile('./family-memory-shared-file.test');
});

it('Family Memory 2.0：Integration 測試', async () => {
  await runLegacyTestFile('./family-memory-integration.test');
});

it('Memory 2.0：Intent Executor 測試', async () => {
  await runLegacyTestFile('./family-memory-intent-executor.test');
});

it('Memory 2.0：既有功能 Guard 測試', async () => {
  await runLegacyTestFile('./family-memory-existing-function-guard.test');
});

it('Memory 2.0：Route Boundary 測試', async () => {
  await runLegacyTestFile('./family-memory-route-boundary.test');
});

it('Memory 2.0：Response Adapter 測試', async () => {
  await runLegacyTestFile('./family-memory-response.test');
});
