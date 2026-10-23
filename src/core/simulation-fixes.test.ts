// Исправления по итогам симуляции 10 человек × 45 дней (SPEC 3.25).
import { describe, expect, it } from 'vitest';
import {
  addExpense,
  closeDayAction,
  confirmIncome,
  delayIncome,
  incomePrompt,
  incomesToConfirm,
  matchingOneOff,
} from './actions';
import { currentBalance, spentTodayMain, transportOverMonth } from './balance';
import { demoData } from './demo';
import { computeLimit, type LimitOk } from './limit';
import { rub } from './money';
import { setAccountBalance } from './profile';
import type { FinanceData } from './types';

const T = '2026-10-21';
const SNAP = 1000;

function demo(today = T): FinanceData {
  const d = demoData(today, SNAP);
  return {
    ...d,
    expenses: [],
    receipts: d.receipts.map((r) => ({ ...r, date: `${r.occurrenceKey.split(':')[1]}-10` })),
  };
}

function ok(data: FinanceData, today = T): LimitOk {
  const r = computeLimit(data, today);
  if (r.status !== 'ok') throw new Error(`нет лимита: ${r.missing.join(', ')}`);
  return r;
}

/** Пенсия 20 000 ₽ 5-го числа, остаток 10 000 ₽ на 1 ноября, без платежей и транспорта. */
function pension(): FinanceData {
  const d = demo();
  d.regularIncomes = [{ id: 'p', name: 'Пенсия', min: rub(20_000), max: rub(20_000), schedule: { type: 'days', days: [5] } }];
  d.receipts = [];
  d.payments = [];
  d.settings.transportMonthly = rub(0);
  d.settings.savePercent = 0;
  d.startedOn = '2026-11-01';
  d.accounts[0] = { ...d.accounts[0], amount: rub(10_000), asOf: '2026-11-01', asOfTs: SNAP };
  return d;
}

describe('1. доход уже в остатке не прибавляется второй раз', () => {
  it('остаток обновлён с зарплатой, затем «Пришла» с отметкой «уже в остатке»', () => {
    const d = demo('2026-11-15');
    d.accounts[0] = { ...d.accounts[0], amount: rub(200_000), asOf: '2026-11-15', asOfTs: 5000 };
    const plain = confirmIncome(d, 'salary:2026-11', rub(130_000), '2026-11-15', 'r', 6000);
    const marked = confirmIncome(d, 'salary:2026-11', rub(130_000), '2026-11-15', 'r', 6000, true);
    expect(currentBalance(plain.accounts[0], plain, '2026-11-15')).toBe(rub(330_000));
    expect(currentBalance(marked.accounts[0], marked, '2026-11-15')).toBe(rub(200_000));
    // Новый период начался в обоих случаях.
    expect(ok(marked, '2026-11-15').horizon).toBe('2026-12-20');
  });
});

describe('2. день ожидания дохода', () => {
  it('в день пенсии до «Пришла» лимит остаётся вчерашним, даже если пенсия уже в остатке', () => {
    const d = pension();
    const day4 = ok(d, '2026-11-04');
    expect(day4.waiting).toBe(false);
    d.lastLimit = day4.lastLimit;
    // Утром 5-го человек обновил остаток: пенсия уже пришла.
    d.accounts[0] = { ...d.accounts[0], amount: rub(29_000), asOf: '2026-11-05', asOfTs: 9000 };
    const day5 = ok(d, '2026-11-05');
    expect(day5.waiting).toBe(true);
    expect(day5.dailyLimit).toBe(day4.dailyLimit);
  });

  it('без прошлого лимита свободное делится до следующего дохода', () => {
    const d = pension();
    const r = ok(d, '2026-11-05');
    // 10 000 ₽ до 5 декабря — 30 дней
    expect(r.dailyLimit).toBe(rub(333) + 33);
  });

  it('не пришедший доход неделю остаётся горизонтом, Флюми спрашивает о нём', () => {
    const d = pension();
    const r = ok(d, '2026-11-08');
    expect(r.horizon).toBe('2026-11-05');
    expect(r.waiting).toBe(true);
    expect(incomePrompt(d, '2026-11-08')).toMatchObject({ kind: 'overdue', oneOff: false });
  });

  it('«Задерживается» переносит позднюю дату', () => {
    const d = delayIncome(pension(), 'p:2026-11:5', '2026-11-12');
    expect(ok(d, '2026-11-08').horizon).toBe('2026-11-12');
    expect(incomePrompt(d, '2026-11-08')?.kind).toBe('today');
  });

  it('выплаты до начала пользования в «Пришла» не предлагаются', () => {
    const d = pension();
    d.startedOn = '2026-10-23';
    expect(incomesToConfirm(d, '2026-10-23').map((o) => o.key)).toEqual(['p:2026-11:5']);
  });
});

describe('3. разовый доход не дублируется', () => {
  it('пришедшие деньги сверяются с ожидаемым разовым в пределах 14 дней', () => {
    const d = demo();
    d.oneOffIncomes.push({ id: 'site', name: 'Оплата за сайт', amount: rub(95_000), date: '2026-11-03' });
    expect(matchingOneOff(d, '2026-11-05', '2026-11-05')?.key).toBe('oneoff:site');
    expect(matchingOneOff(d, '2026-11-25', '2026-11-25')).toBeNull();
  });

  it('просроченный разовый — вопрос на главной', () => {
    const d = demo();
    d.oneOffIncomes.push({ id: 'site', name: 'Оплата за сайт', amount: rub(95_000), date: '2026-10-25' });
    expect(incomePrompt(d, '2026-10-27')).toMatchObject({ kind: 'overdue', oneOff: true });
  });
});

describe('4. пустой день и расхождение остатка в режиме «на счёт»', () => {
  function accountMode(): FinanceData {
    const d = demo();
    d.settings.leftoverMode = 'account';
    const r = ok(d);
    return { ...d, savePlan: r.savePlan, fixedLimit: r.fixedLimit };
  }

  it('«Не помню» — в «сэкономлено» ничего не идёт', () => {
    const sure = closeDayAction(accountMode(), T);
    const unsure = closeDayAction(accountMode(), T, true);
    expect(sure.closures[0].saved).toBe(rub(1_050));
    expect(unsure.closures[0].saved).toBe(0);
  });

  it('денег меньше, чем думал Флюми, — разница сначала списывается со «сэкономлено»', () => {
    let d = closeDayAction(accountMode(), T);
    expect(ok(d, '2026-10-22').saved).toBe(rub(1_050));
    // На деле в тот день потрачено 1 500 ₽, не записано. Транспорт за день — 500 ₽.
    d = setAccountBalance(d, 'main', rub(98_000), '2026-10-22', 7000);
    const r = ok(d, '2026-10-22');
    expect(r.saved).toBe(0);
    expect(r.dailyLimit).toBeLessThanOrEqual(rub(1_050));
  });
});

describe('5. непереведённое откладывание переносится в новый период', () => {
  it('новое откладывание = перенесённое + процент от остальной базы', () => {
    const d = demo();
    d.savePlan = ok(d).savePlan; // 13 500 ₽, не переведено
    d.receipts.push({ id: 'r-nov', occurrenceKey: 'salary:2026-11', amount: rub(120_000), date: '2026-11-15', createdAt: 9999 });
    const r = ok(d, '2026-11-15');
    expect(r.savePlan.carried).toBe(rub(13_500));
    // база 15.11: 100 000 + 120 000 − транспорт 25 дней 12 500 − квартира 10.11 и 10.12 (80 000) − транспорт 35 дней 17 500
    const base = rub(100_000 + 120_000 - 12_500 - 80_000 - 17_500);
    expect(r.base).toBe(base);
    expect(r.savePlan.amount).toBe(rub(13_500) + Math.floor(((base - rub(13_500)) * 30) / 100));
  });
});

describe('6. траты «Транспорт» — из резерва', () => {
  it('такси в пределах месячной суммы не уменьшает лимит и не грустит робота', () => {
    const d = addExpense(demo(), { amount: rub(400), accountId: 'main', categoryId: 'transport', date: T }, 'taxi', SNAP + 1);
    expect(spentTodayMain(d, T)).toBe(0);
    const next = ok(d, '2026-10-22');
    const without = ok(demo(), '2026-10-22');
    expect(next.startBalance).toBe(without.startBalance);
  });

  it('заправка разом дороже резерва прошедших дней — вычитается она, а не резерв', () => {
    const d = addExpense(demo(), { amount: rub(3_000), accountId: 'main', categoryId: 'transport', date: T }, 'fuel', SNAP + 1);
    expect(spentTodayMain(d, T)).toBe(0);
    // резерв за 1 день — 500 ₽, заправка — 3 000 ₽
    expect(ok(d, '2026-10-22').startBalance).toBe(rub(97_000));
  });

  it('сверх месячной суммы — обычная трата из лимита', () => {
    let d = demo();
    d = addExpense(d, { amount: rub(14_000), accountId: 'main', categoryId: 'transport', date: '2026-10-05' }, 'a', SNAP + 1);
    d = addExpense(d, { amount: rub(3_000), accountId: 'main', categoryId: 'transport', date: T }, 'b', SNAP + 2);
    expect(spentTodayMain(d, T)).toBe(rub(2_000));
    expect(transportOverMonth(d, T)).toBe(rub(2_000));
  });
});
