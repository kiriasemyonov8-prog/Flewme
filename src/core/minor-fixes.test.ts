// Мелкие ошибки 21–23 из симуляции (docs/simulation/report.md).
import { describe, expect, it } from 'vitest';
import { demoAssistant, reservedText } from '../ai/assistant';
import { currentBalance } from './balance';
import { demoData } from './demo';
import { computeLimit, type LimitOk } from './limit';
import { rub } from './money';
import { balanceGap, emptyData, addAccount, upsertRegularIncome } from './profile';
import type { FinanceData } from './types';

const T = '2026-10-21';

function demo(today = T): FinanceData {
  const d = demoData(today, 1000);
  return { ...d, expenses: [], receipts: d.receipts.map((r) => ({ ...r, date: `${r.occurrenceKey.split(':')[1]}-10` })) };
}

describe('21. чат называет то, что учтено у человека', () => {
  it('в демо: квартира, транспорт и отложенное', () => {
    const l = computeLimit(demo(), T) as LimitOk;
    expect(reservedText(l)).toBe(' Заранее учтено: квартира, транспорт и отложенное в накопления.');
  });

  it('без платежей и транспорта про квартиру ни слова', () => {
    let d = addAccount(emptyData(T), 'main', rub(20_000), T, 1000, 'main');
    d = upsertRegularIncome(d, { id: 'p', name: 'Пенсия', min: rub(21_800), max: rub(21_800), schedule: { type: 'days', days: [5] } });
    const l = computeLimit(d, T) as LimitOk;
    expect(reservedText(l)).toBe('');
    const reply = demoAssistant.reply('Почему у меня такой лимит?', { data: d, today: T, limit: l });
    expect(reply.text).not.toMatch(/Квартир|транспорт/i);
  });
});

describe('22. при нехватке данных чат просит только недостающее', () => {
  it('нет остатка — просит только остаток', () => {
    const d = emptyData(T);
    const reply = demoAssistant.reply('Сколько мне можно потратить сегодня?', { data: d, today: T, limit: computeLimit(d, T) });
    expect(reply.text).toContain('остаток основного счёта');
    expect(reply.text).not.toContain('доход');
  });
});

describe('23. в день платежа сумма на счёте уже без него', () => {
  it('остаток записан раньше — квартира 10-го вычитается в сам день', () => {
    const d = demo('2026-11-08');
    d.accounts[0] = { ...d.accounts[0], amount: rub(100_000), asOf: '2026-11-08', asOfTs: 1 };
    // транспорт за 2 дня — 1 000 ₽
    expect(currentBalance(d.accounts[0], d, '2026-11-10')).toBe(rub(59_000));
    // а лимит этого дня по-прежнему резервирует платёж отдельно — не вдвойне
    const l = computeLimit(d, '2026-11-10') as LimitOk;
    expect(l.startBalance).toBe(rub(99_000));
  });

  it('остаток записан в день платежа без отметки «уже списан» — платёж ещё впереди', () => {
    const d = demo('2026-11-10');
    d.accounts[0] = { ...d.accounts[0], amount: rub(100_000), asOf: '2026-11-10', asOfTs: 1 };
    expect(currentBalance(d.accounts[0], d, '2026-11-10')).toBe(rub(100_000));
  });

  it('обновление остатка в день платежа не считает его расхождением', () => {
    const d = demo('2026-11-08');
    d.accounts[0] = { ...d.accounts[0], amount: rub(100_000), asOf: '2026-11-08', asOfTs: 1 };
    // в банке 59 000: квартира списана, человек отметил это
    expect(balanceGap(d, 'main', rub(59_000), '2026-11-10', ['rent:2026-11'])).toBeNull();
    // в банке 99 000: квартира ещё не списана, отметки нет
    expect(balanceGap(d, 'main', rub(99_000), '2026-11-10', [])).toBeNull();
  });
});
