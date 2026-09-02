import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FamilyMemoryStore } from './family-memory';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}\n預期：${String(expected)}\n實際：${String(actual)}`,
    );
  }
}

function assertClose(
  actual: number | null,
  expected: number,
  message: string,
): void {
  if (actual === null || Math.abs(actual - expected) > 1e-9) {
    throw new Error(
      `${message}\n預期：${expected}\n實際：${String(actual)}`,
    );
  }
}

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempPath(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'afu-family-memory-statistics-boundary-'),
  );
  return path.join(directory, 'family-memory.json');
}

function assertThrows(fn: () => unknown, message: string): void {
  let thrown = false;

  try {
    fn();
  } catch {
    thrown = true;
  }

  assertTrue(thrown, message);
}

async function test(name: string, fn: () => void): Promise<void> {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('平均值支援零值且不因 || 0 造成錯誤', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '體重變化',
      value: 0,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重變化',
      value: 2,
      unit: 'kg',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    const result = store.average({
      subject: '爸爸',
      category: '體重變化',
    });

    assertEqual(result.count, 2, '零值應計入平均值 count');
    assertClose(result.average, 1, '含零值的平均值計算錯誤');
  });

  await test('趨勢的零值不應被誤判成缺失資料', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '媽媽',
      category: '數值',
      value: 0,
      unit: '分',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '媽媽',
      category: '數值',
      value: 5,
      unit: '分',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    const result = store.trend({
      subject: '媽媽',
      category: '數值',
    });

    assertEqual(result.count, 2, '零值應計入趨勢 count');
    assertEqual(result.first?.value, 0, '第一筆零值應保留');
    assertEqual(result.latest?.value, 5, '最新值錯誤');
    assertEqual(result.change, 5, '零值趨勢 change 錯誤');
    assertEqual(result.direction, '上升', '零值趨勢方向錯誤');
  });

  await test('平均值在只有非數值紀錄時應回傳空統計', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '備註',
      content: '只有文字',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    const result = store.average({
      subject: '爸爸',
      category: '備註',
    });

    assertEqual(result.count, 0, '無數值紀錄 count 應為 0');
    assertEqual(result.average, null, '無數值紀錄 average 應為 null');
    assertEqual(result.unit, undefined, '無數值紀錄不應產生 unit');
  });

  await test('趨勢會忽略沒有 value 的紀錄', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 6,
      unit: '小時',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      content: '沒有數值',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 8,
      unit: '小時',
      occurredAt: '2026-09-03T08:00:00+08:00',
    });

    const result = store.trend({
      subject: '爸爸',
      category: '睡眠',
    });

    assertEqual(result.count, 2, '趨勢應只計算有 value 的紀錄');
    assertEqual(result.first?.value, 6, '第一筆數值紀錄錯誤');
    assertEqual(result.latest?.value, 8, '最後一筆數值紀錄錯誤');
    assertEqual(result.change, 2, '趨勢 change 錯誤');
    assertEqual(result.direction, '上升', '趨勢方向錯誤');
  });

  await test('相同標準化 unit 的統計結果應保留第一筆原始 unit', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: ' kg ',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 62,
      unit: 'KG',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    const result = store.average({
      subject: '爸爸',
      category: '體重',
    });

    assertEqual(result.count, 2, '標準化 unit 後 count 錯誤');
    assertClose(result.average, 61, '平均值錯誤');
    assertEqual(result.unit, 'kg', '統計結果 unit 應使用儲存後正規化值');
  });

  await test('unit 混用時平均與趨勢都應拒絕', () => {
    const store = new FamilyMemoryStore(createTempPath());
    store.addRecord({
      subject: '爸爸',
      category: '距離',
      value: 1,
      unit: 'km',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '距離',
      value: 100,
      unit: 'm',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    assertThrows(
      () => store.average({ subject: '爸爸', category: '距離' }),
      '混合 unit 的平均值應被拒絕',
    );
    assertThrows(
      () => store.trend({ subject: '爸爸', category: '距離' }),
      '混合 unit 的趨勢應被拒絕',
    );
  });

  console.log('');
  console.log('Memory 2.0 統計邊界測試完成');
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
