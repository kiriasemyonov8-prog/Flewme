import { describe, expect, it } from 'vitest';
import { demoData } from './demo';
import { computeLimit, type LimitOk } from './limit';
import { addTransfer } from './money-moves';
import { rub } from './money';
import { monthExpenses, upcomingIncomes } from './overview';
import { evaluatePurchase, savingsTotal } from './purchase';
import type { FinanceData } from './types';

const T = '2026-10-21';
const demo = () => demoData(T, 1000);
const limit = (d: FinanceData, day = T) => computeLimit(d, day) as LimitOk;

describe('переводы', () => {
  it('«Взять из накоплений» 10 500 ₽: лимит 1 050 → 1 400, накопления 89 500', () => {
    const d = addTransfer(demo(), 'savings', 'main', rub(10_500), 'withdraw', T, 'w', 2000);
    expect(limit(d).dailyLimit).toBe(rub(1_400));
    expect(limit(d).setAside).toBe(rub(13_500));
    expect(savingsTotal(d, T)).toBe(rub(89_500));
  });

  it('перевод отложенного в накопления: лимит не меняется, отложить больше не нужно', () => {
    const d = addTransfer(demo(), 'main', 'savings', rub(13_500), 'setAside', T, 's', 2000);
    expect(limit(d).dailyLimit).toBe(rub(1_050));
    expect(limit(d).setAside).toBe(rub(0));
    expect(savingsTotal(d, T)).toBe(rub(113_500));
  });

  it('после «Взять из накоплений» зафиксированный лимит режима «на счёт» сбрасывается', () => {
    const d0 = { ...demo(), fixedLimit: { periodKey: 'x', limit: rub(1) } };
    expect(addTransfer(d0, 'savings', 'main', rub(1), 'withdraw', T, 'w', 2000).fixedLimit).toBeUndefined();
  });
});

describe('способ накопления в окне «Покупка»', () => {
  it('из отложенного: 58 500 ₽ при 13 500 ₽ в месяц — 130 дней, «Не стоит»', () => {
    const d = demo();
    const r = evaluatePurchase(d, limit(d), rub(90_000), { kind: 'main' }, T, d.goals[0], 'setAside');
    expect(r.verdict).toBe('no');
    expect(r.readyDate).toBe('2027-02-28');
  });

  it('урезать лимит: 20% от 1 050 = 210 ₽ в день, 6 300 ₽ в месяц', () => {
    const d = demo();
    const r = evaluatePurchase(d, limit(d), rub(20_000), { kind: 'main' }, T, d.goals[0], 'cutLimit');
    // недостаёт 20 000 − 31 500 → хватает; проверим недостаток на 40 000
    expect(r.verdict).toBe('compromise');
    const r2 = evaluatePurchase(d, limit(d), rub(40_000), { kind: 'main' }, T, d.goals[0], 'cutLimit');
    // недостаёт 8 500 ₽ → ceil(8 500 × 30 / 6 300) = 41 день → «Лучше подождать»
    expect(r2.verdict).toBe('wait');
    expect(r2.recommendations.find((x) => x.type === 'saveDaily')).toMatchObject({ perDay: rub(210), method: 'cutLimit' });
  });
});

describe('обзор', () => {
  it('траты за октябрь по категориям', () => {
    const m = monthExpenses(demo(), '2026-10');
    expect(m.total).toBe(rub(13_929));
    expect(m.byCategory[0]).toEqual({ categoryId: 'food', total: rub(7_070) });
  });

  it('ожидаемая зарплата видна в будущих доходах', () => {
    expect(upcomingIncomes(demo(), T).map((o) => o.key)).toEqual(['salary:2026-11', 'salary:2026-12']);
  });
});
