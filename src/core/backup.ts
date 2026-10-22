// Копия данных в файл и восстановление из файла (SPEC, раздел 13).
// Формат версионируется: при изменении модели данных добавляется миграция.
import type { FinanceData } from './types';

export const SCHEMA_VERSION = 1;

interface BackupFile {
  app: 'flyumi';
  schemaVersion: number;
  exportedAt: string;
  data: FinanceData;
}

export function exportBackup(data: FinanceData, now: Date): string {
  const file: BackupFile = { app: 'flyumi', schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), data };
  return JSON.stringify(file, null, 2);
}

export type ImportError = 'notJson' | 'notFlyumi' | 'newerVersion' | 'broken';

const ARRAYS: (keyof FinanceData)[] = [
  'categories',
  'goals',
  'accounts',
  'regularIncomes',
  'oneOffIncomes',
  'receipts',
  'payments',
  'expenses',
  'transfers',
  'closures',
];

/** Проверяем форму данных; суммы должны быть целыми копейками. */
function looksValid(d: unknown): d is FinanceData {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  if (typeof x.startedOn !== 'string' || typeof x.isDemo !== 'boolean') return false;
  if (!x.settings || typeof x.settings !== 'object') return false;
  if (!x.questionnaire || typeof x.questionnaire !== 'object') return false;
  if (!ARRAYS.every((k) => Array.isArray(x[k]))) return false;
  const amounts = [
    ...(x.accounts as { amount: unknown }[]).map((a) => a.amount),
    ...(x.expenses as { amount: unknown }[]).map((e) => e.amount),
    ...(x.receipts as { amount: unknown }[]).map((r) => r.amount),
  ];
  return amounts.every((a) => Number.isSafeInteger(a));
}

export function importBackup(text: string): FinanceData | ImportError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'notJson';
  }
  const file = parsed as Partial<BackupFile>;
  if (!file || file.app !== 'flyumi') return 'notFlyumi';
  if (typeof file.schemaVersion !== 'number' || file.schemaVersion > SCHEMA_VERSION) return 'newerVersion';
  if (!looksValid(file.data)) return 'broken';
  return file.data;
}
