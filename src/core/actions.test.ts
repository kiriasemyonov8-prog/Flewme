import { describe, expect, it } from 'vitest';
import { addExpense, addReceivedOneOff, closeDayAction, confirmIncome, incomesToConfirm } from './actions';
import { demoData } from './demo';
import { computeLimit, remainingToday, type LimitOk } from './limit';
import { rub } from './money';
import { robotMood } from './mood';
import { spentTodayMain } from './balance';

const T = '2026-10-21';
const demo = () => demoData(T, 1000);

describe('действия', () => {
  it('запись траты меняет настроение, но не лимит дня', () => {
    let d = demo();
    const before = (computeLimit(d, T) as LimitOk).dailyLimit;
    d = addExpense(d, { amount: rub(1_100), accountId: 'main', categoryId: 'fun', date: T }, 'x', 2000);
    const after = computeLimit(d, T) as LimitOk;
    expect(after.dailyLimit).toBe(before);
    expect(robotMood(spentTodayMain(d, T), after.dailyLimit)).toBe('thoughtful');
    expect(d.lastCategoryId).toBe('fun');
  });

  it('остаток на сегодня уменьшается с каждой тратой, перерасход показывается отдельно', () => {
    let d = demo();
    const L = (computeLimit(d, T) as LimitOk).dailyLimit;
    d = addExpense(d, { amount: rub(300), accountId: 'main', categoryId: 'food', date: T }, 'a', 2000);
    expect(remainingToday(L, spentTodayMain(d, T))).toEqual({ left: rub(750), over: 0 });
    d = addExpense(d, { amount: rub(900), accountId: 'main', categoryId: 'food', date: T }, 'b', 2001);
    expect(remainingToday(L, spentTodayMain(d, T))).toEqual({ left: 0, over: rub(150) });
    d = addExpense(d, { amount: rub(5_000), accountId: 'savings', categoryId: 'food', date: T }, 'c', 2002);
    expect(remainingToday(L, spentTodayMain(d, T)).over).toBe(rub(150));
  });

  it('к подтверждению предлагается ближайшая зарплата', () => {
    const list = incomesToConfirm(demo(), T);
    expect(list.map((o) => o.key)).toEqual(['salary:2026-11']);
  });

  it('«Пришла» добавляет деньги и начинает новый период', () => {
    let d = demo();
    d = confirmIncome(d, 'salary:2026-11', rub(130_000), T, 'r1', 2000);
    const r = computeLimit(d, T) as LimitOk;
    expect(r.startBalance).toBe(rub(230_000));
    expect(r.horizon).toBe('2026-12-20');
    expect(r.savePlan.periodKey).toBe('r1');
  });

  it('подтверждённый разовый доход 25 000 ₽ поднимает лимит до зарплаты', () => {
    let d = demo();
    d = { ...d, oneOffIncomes: [{ id: 'p', name: 'Проект', amount: rub(25_000), date: T }] };
    expect((computeLimit(d, T) as LimitOk).dailyLimit).toBe(rub(1_050));
    d = confirmIncome(d, 'oneoff:p', rub(25_000), T, 'r', 2000);
    const r = computeLimit(d, T) as LimitOk;
    // Поступление начинает новый период: база 70 000, откладывание 30% = 21 000, свободно 49 000 / 30 дней
    expect(r.horizon).toBe('2026-11-20');
    expect(r.dailyLimit).toBe(rub(1_633) + 33);
  });

  it('разовый доход сразу подтверждён и не становится горизонтом', () => {
    const d = addReceivedOneOff(demo(), 'Проект', rub(10_000), T, 'p1', 2000);
    const r = computeLimit(d, T) as LimitOk;
    expect(r.horizon).toBe('2026-11-20');
    expect(r.startBalance).toBe(rub(110_000));
  });

  it('закрытие дня записывается один раз', () => {
    let d = addExpense(demo(), { amount: rub(500), accountId: 'main', categoryId: 'food', date: T }, 'x', 2000);
    d = closeDayAction(d, T);
    d = closeDayAction(d, T);
    expect(d.closures).toEqual([{ date: T, spent: rub(500), limit: rub(1_050), saved: rub(0) }]);
  });
});
