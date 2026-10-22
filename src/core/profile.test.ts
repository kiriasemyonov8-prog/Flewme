import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from './backup';
import { MAX_CATEGORIES } from './categories';
import { demoData } from './demo';
import { computeLimit, type LimitOk } from './limit';
import { rub } from './money';
import {
  addAccount,
  addCategory,
  addPayment,
  changePaymentAmount,
  emptyData,
  removeCategory,
  renameAccount,
  renameCategory,
  setAccountBalance,
  updateSettings,
  upsertRegularIncome,
} from './profile';
import type { FinanceData } from './types';

const T = '2026-10-21';

function ok(d: FinanceData): FinanceData {
  if (typeof d === 'string') throw new Error(d);
  return d;
}

describe('свои данные с чистого листа', () => {
  it('без остатка и дохода лимит не выдаётся', () => {
    expect(computeLimit(emptyData(T), T)).toEqual({ status: 'noData', missing: ['mainBalance', 'income'] });
  });

  it('после ввода счёта, зарплаты и платежей лимит считается как в демо', () => {
    let d = emptyData(T);
    d = addAccount(d, 'main', rub(100_000), T, 1000, 'x');
    d = upsertRegularIncome(d, {
      id: 'sal',
      name: 'Зарплата',
      min: rub(120_000),
      max: rub(150_000),
      schedule: { type: 'window', fromDay: 10, toDay: 20 },
    });
    d = addPayment(d, 'rent', 'Квартира', 10, rub(40_000), '2026-10');
    d = updateSettings(d, { transportMonthly: rub(15_000) });
    // Зарплата октября уже пришла и входит в остаток.
    d = { ...d, receipts: [{ id: 'r', occurrenceKey: 'sal:2026-10', amount: rub(120_000), date: '2026-10-15', createdAt: 0 }] };
    expect((computeLimit(d, T) as LimitOk).dailyLimit).toBe(rub(1_050));
  });

  it('накопления и другие счета можно переименовать, основной — нет', () => {
    let d = renameAccount(demoData(T, 1), 'savings', 'Вклад');
    expect(d.accounts[1]).toMatchObject({ name: 'Вклад', kind: 'savings' });
    d = renameAccount(d, 'main', 'Тинькофф');
    expect(d.accounts[0].name).toBe('Основной счёт');
  });

  it('основной счёт создаётся только один', () => {
    let d = addAccount(emptyData(T), 'main', rub(1), T, 1, 'a');
    d = addAccount(d, 'main', rub(2), T, 1, 'b');
    expect(d.accounts).toHaveLength(1);
  });
});

describe('остаток счёта', () => {
  it('новый остаток с отметкой об оплаченном платеже', () => {
    const d = setAccountBalance(demoData(T, 1), 'main', rub(60_000), '2026-11-10', 5, ['rent:2026-11']);
    expect(d.accounts[0]).toMatchObject({ amount: rub(60_000), asOf: '2026-11-10', asOfTs: 5, paidOnAsOf: ['rent:2026-11'] });
  });
});

describe('платежи', () => {
  it('изменение суммы с выбранного месяца не трогает прошлые', () => {
    const d = changePaymentAmount(demoData(T, 1), 'rent', rub(45_000), '2026-12');
    expect(d.payments[0].amounts.map((a) => a.amount)).toEqual([rub(40_000), rub(45_000)]);
  });
});

describe('категории', () => {
  it('«Еда» нельзя переименовать и удалить, «Другое» нельзя удалить', () => {
    const d = demoData(T, 1);
    expect(renameCategory(d, 'food', 'Продукты')).toBe('locked');
    expect(removeCategory(d, 'food')).toBe('locked');
    expect(removeCategory(d, 'other')).toBe('locked');
  });

  it('при удалении траты переходят в «Другое»', () => {
    const d = ok(removeCategory(demoData(T, 1), 'shopping') as FinanceData);
    expect(d.categories.some((c) => c.id === 'shopping')).toBe(false);
    expect(d.expenses.find((x) => x.note === 'Одежда')?.categoryId).toBe('other');
  });

  it('не больше 12 категорий и без повторов', () => {
    let d = demoData(T, 1);
    expect(addCategory(d, 'x', ' еда ')).toBe('duplicate');
    for (let i = d.categories.length; i < MAX_CATEGORIES; i++) d = ok(addCategory(d, `c${i}`, `Своя ${i}`) as FinanceData);
    expect(addCategory(d, 'z', 'Ещё одна')).toBe('limit');
  });
});

describe('копия в файл', () => {
  it('сохраняется и восстанавливается без потерь', () => {
    const d = demoData(T, 1);
    expect(importBackup(exportBackup(d, new Date(0)))).toEqual(d);
  });

  it('чужой или повреждённый файл не принимается', () => {
    expect(importBackup('не json')).toBe('notJson');
    expect(importBackup('{"app":"other"}')).toBe('notFlyumi');
    expect(importBackup('{"app":"flyumi","schemaVersion":99,"data":{}}')).toBe('newerVersion');
    expect(importBackup('{"app":"flyumi","schemaVersion":1,"data":{}}')).toBe('broken');
  });
});
