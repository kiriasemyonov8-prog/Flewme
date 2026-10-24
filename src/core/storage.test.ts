import { describe, expect, it } from 'vitest';
import { exportBackup } from './backup';
import { demoData } from './demo';
import { emptyData } from './profile';
import { backupDue, decodeState, encodeState } from './storage';

const T = '2026-10-24';

describe('сохранение на устройстве (SPEC 3.29)', () => {
  it('сохранённое читается обратно без изменений', () => {
    const data = demoData(T, 1000);
    const meta = { onboarded: true, lastBackupOn: '2026-10-20' };
    const r = decodeState(encodeState(data, meta, new Date('2026-10-24T10:00:00Z')));
    expect(r).toEqual({ kind: 'ok', data, meta });
  });

  it('пусто — первый запуск', () => {
    expect(decodeState(null)).toEqual({ kind: 'empty' });
  });

  it('повреждённая запись не роняет приложение', () => {
    expect(decodeState('{не json')).toEqual({ kind: 'broken', reason: 'damaged' });
    expect(decodeState(JSON.stringify({ app: 'flyumi', schemaVersion: 1, data: { foo: 1 } }))).toEqual({
      kind: 'broken',
      reason: 'damaged',
    });
  });

  it('запись от более новой версии приложения не перезаписывается молча', () => {
    const text = encodeState(demoData(T, 1), { onboarded: true }, new Date()).replace('"schemaVersion":1', '"schemaVersion":99');
    expect(decodeState(text)).toEqual({ kind: 'broken', reason: 'newer' });
  });

  it('копия в файл — это другой формат, но данные те же', () => {
    const data = demoData(T, 1);
    expect(JSON.parse(exportBackup(data, new Date())).data).toEqual(data);
  });
});

describe('напоминание о копии в файл раз в 2 недели', () => {
  const data = { ...emptyData('2026-10-01'), isDemo: false };

  it('2 недели с начала пользования — пора', () => {
    expect(backupDue(data, { onboarded: true }, '2026-10-14')).toBe(false);
    expect(backupDue(data, { onboarded: true }, '2026-10-15')).toBe(true);
  });

  it('после копии отсчёт заново; «Позже» — тишина 3 дня', () => {
    expect(backupDue(data, { onboarded: true, lastBackupOn: '2026-10-10' }, '2026-10-20')).toBe(false);
    expect(backupDue(data, { onboarded: true, backupNudgeOn: '2026-10-15' }, '2026-10-17')).toBe(false);
    expect(backupDue(data, { onboarded: true, backupNudgeOn: '2026-10-15' }, '2026-10-18')).toBe(true);
  });

  it('на демо-данных не напоминаем', () => {
    expect(backupDue(demoData('2026-10-01', 1), { onboarded: true }, '2026-11-01')).toBe(false);
  });
});
