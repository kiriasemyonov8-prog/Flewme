// Копия данных в файл (SPEC, раздел 13): общий для профиля и напоминания на главной.
import { exportBackup } from '../core/backup';
import type { ISODate } from '../core/dates';
import type { FinanceStore } from './useFinance';

export function saveBackupFile(store: FinanceStore, today: ISODate): void {
  const blob = new Blob([exportBackup(store.data, new Date())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flyumi-kopiya-${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
  // Отсчёт до следующего напоминания о копии начинается заново (3.29).
  store.setMeta({ lastBackupOn: today, backupNudgeOn: undefined });
}
