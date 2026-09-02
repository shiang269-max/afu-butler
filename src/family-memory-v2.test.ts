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

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
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

function createTempPath(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'afu-family-memory-v2-'),
  );
  return path.join(directory, 'family-memory.json');
}

async function main(): Promise<void> {
  await test('不同 unit 不可混算平均與趨勢', () => {
    const store = new FamilyMemoryStore(createTempPath());

    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 132,
      unit: 'lb',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    assertThrows(
      () => store.average({ subject: '爸爸', category: '體重' }),
      '不同 unit 的資料不可直接計算平均值',
    );
    assertThrows(
      () => store.trend({ subject: '爸爸', category: '體重' }),
      '不同 unit 的資料不可直接計算趨勢',
    );
  });

  await test('指定 unit 後只統計相同 unit', () => {
    const store = new FamilyMemoryStore(createTempPath());

    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 59,
      unit: 'kg',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 132,
      unit: 'lb',
      occurredAt: '2026-09-03T08:00:00+08:00',
    });

    const kgAverage = store.average({
      subject: '爸爸',
      category: '體重',
      unit: 'KG',
    });
    assertEqual(kgAverage.count, 2, '指定 kg 後平均值 count 錯誤');
    assertClose(kgAverage.average, 59.5, '指定 kg 後平均值錯誤');
    assertEqual(kgAverage.unit, 'kg', '指定 kg 後 unit 錯誤');

    const kgTrend = store.trend({
      subject: '爸爸',
      category: '體重',
      unit: 'kg',
    });
    assertEqual(kgTrend.count, 2, '指定 kg 後趨勢 count 錯誤');
    assertEqual(kgTrend.change, -1, '指定 kg 後趨勢 change 錯誤');
    assertEqual(kgTrend.direction, '下降', '指定 kg 後趨勢方向錯誤');
  });

  await test('統計可正確套用日期區間', () => {
    const store = new FamilyMemoryStore(createTempPath());

    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 6,
      unit: '小時',
      occurredAt: '2026-08-30T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 8,
      unit: '小時',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 7,
      unit: '小時',
      occurredAt: '2026-09-03T08:00:00+08:00',
    });

    const query = {
      subject: '爸爸',
      category: '睡眠',
      from: '2026-09-01T00:00:00+08:00',
      to: '2026-09-02T23:59:59+08:00',
    };

    const average = store.average(query);
    assertEqual(average.count, 1, '日期區間平均值 count 錯誤');
    assertEqual(average.average, 8, '日期區間平均值錯誤');

    const trend = store.trend(query);
    assertEqual(trend.count, 1, '日期區間趨勢 count 錯誤');
    assertEqual(trend.direction, '資料不足', '單筆日期區間趨勢應為資料不足');
  });

  await test('統計查詢不會跨人物或分類混算', () => {
    const store = new FamilyMemoryStore(createTempPath());

    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 62,
      unit: 'kg',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });
    store.addRecord({
      subject: '媽媽',
      category: '體重',
      value: 50,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '睡眠',
      value: 8,
      unit: '小時',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });

    const weight = store.average({
      subject: '爸爸',
      category: '體重',
    });
    assertEqual(weight.count, 2, '人物／分類篩選後 count 錯誤');
    assertEqual(weight.average, 61, '人物／分類篩選後平均值錯誤');
  });

  await test('unit 名稱大小寫與前後空白不應造成誤判', () => {
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
      value: 59,
      unit: 'KG',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    const result = store.average({
      subject: '爸爸',
      category: '體重',
      unit: ' kg ',
    });
    assertEqual(result.count, 2, 'unit 正規化後 count 錯誤');
    assertEqual(result.unit, 'kg', 'unit 正規化後結果錯誤');
    assertEqual(result.average, 59.5, 'unit 正規化後平均值錯誤');
  });

  await test('無 unit 的數值資料只能與無 unit 資料混算', () => {
    const store = new FamilyMemoryStore(createTempPath());

    store.addRecord({
      subject: '媽媽',
      category: '心情',
      value: 5,
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '媽媽',
      category: '心情',
      value: 7,
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    const result = store.average({
      subject: '媽媽',
      category: '心情',
    });
    assertEqual(result.count, 2, '無 unit 平均 count 錯誤');
    assertEqual(result.average, 6, '無 unit 平均值錯誤');
    assertEqual(result.unit, undefined, '無 unit 平均結果不應產生 unit');

    store.addRecord({
      subject: '媽媽',
      category: '心情',
      value: 6,
      unit: '分',
      occurredAt: '2026-09-03T08:00:00+08:00',
    });

    assertThrows(
      () => store.average({ subject: '媽媽', category: '心情' }),
      '有 unit 與無 unit 不可直接混算',
    );
  });

  await test('持平趨勢可正確判定', () => {
    const store = new FamilyMemoryStore(createTempPath());

    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-01T08:00:00+08:00',
    });
    store.addRecord({
      subject: '爸爸',
      category: '體重',
      value: 60,
      unit: 'kg',
      occurredAt: '2026-09-02T08:00:00+08:00',
    });

    const result = store.trend({
      subject: '爸爸',
      category: '體重',
    });
    assertEqual(result.count, 2, '持平趨勢 count 錯誤');
    assertEqual(result.change, 0, '持平趨勢 change 錯誤');
    assertEqual(result.direction, '持平', '持平趨勢方向錯誤');
  });

  console.log('');
  console.log('Memory 2.0 統計一致性與邊界測試完成');
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
