// Сохранение на устройстве (SPEC, раздел 13, 3.29): данные и служебные отметки в одной записи
// с номером версии формата. Чистые функции — сама запись в память браузера в src/state.
import { SCHEMA_VERSION, looksValid } from './backup';
import { diffDays, type ISODate } from './dates';
import type { FinanceData } from './types';

export const STORAGE_KEY = 'flyumi';
/** Сюда откладывается запись, которую не удалось прочитать, — чтобы не потерять её насовсем. */
export const BROKEN_KEY = 'flyumi-broken';

export interface AppMeta {
  /** Первый вход пройден: приветствие и анкета больше не показываются. */
  onboarded: boolean;
  /** Когда последний раз сохранялась копия в файл. */
  lastBackupOn?: ISODate;
  /** Когда человек ответил «Позже» на напоминание о копии. */
  backupNudgeOn?: ISODate;
}

interface StoredState {
  app: 'flyumi';
  schemaVersion: number;
  savedAt: string;
  meta: AppMeta;
  data: FinanceData;
}

export function encodeState(data: FinanceData, meta: AppMeta, now: Date): string {
  const s: StoredState = { app: 'flyumi', schemaVersion: SCHEMA_VERSION, savedAt: now.toISOString(), meta, data };
  return JSON.stringify(s);
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; data: FinanceData; meta: AppMeta }
  /** Запись есть, но прочитать её нельзя (повреждена или от более новой версии). */
  | { kind: 'broken'; reason: 'damaged' | 'newer' };

/**
 * Перевод старых данных в текущий формат. Каждое изменение модели данных
 * добавляет сюда шаг «версия N → N + 1». Пока формат один — версия 1.
 */
export function migrate(data: FinanceData, _fromVersion: number): FinanceData {
  // Пока формат один (версия 1), переводить нечего. Когда модель данных изменится,
  // здесь появятся шаги вида: if (_fromVersion < 2) data = toVersion2(data);
  return data;
}

export function decodeState(text: string | null): LoadResult {
  if (!text) return { kind: 'empty' };
  let parsed: Partial<StoredState>;
  try {
    parsed = JSON.parse(text) as Partial<StoredState>;
  } catch {
    return { kind: 'broken', reason: 'damaged' };
  }
  if (!parsed || parsed.app !== 'flyumi' || typeof parsed.schemaVersion !== 'number') {
    return { kind: 'broken', reason: 'damaged' };
  }
  if (parsed.schemaVersion > SCHEMA_VERSION) return { kind: 'broken', reason: 'newer' };
  if (!looksValid(parsed.data)) return { kind: 'broken', reason: 'damaged' };
  const meta: AppMeta = { onboarded: Boolean(parsed.meta?.onboarded), ...parsed.meta };
  return { kind: 'ok', data: migrate(parsed.data, parsed.schemaVersion), meta };
}

export const BACKUP_EVERY_DAYS = 14;
const NUDGE_SNOOZE_DAYS = 3;

/**
 * Пора напомнить о копии в файл (3.29): прошло 2 недели с последней копии (или с начала
 * пользования), и «Позже» нажимали не меньше 3 дней назад. На демо-данных не напоминаем.
 */
export function backupDue(data: FinanceData, meta: AppMeta, today: ISODate): boolean {
  if (data.isDemo || !meta.onboarded) return false;
  const since = meta.lastBackupOn ?? data.startedOn;
  if (diffDays(since, today) < BACKUP_EVERY_DAYS) return false;
  return !meta.backupNudgeOn || diffDays(meta.backupNudgeOn, today) >= NUDGE_SNOOZE_DAYS;
}
