import { describe, expect, it } from 'vitest';
import { demoData } from './demo';
import { allocateSetAside, goalBehind, goalsByPriority, takeFromSavings } from './goals';
import { computeLimit, type LimitOk } from './limit';
import { createGoal } from './money-moves';
import { rub } from './money';
import { addAccount } from './profile';
import { evaluatePurchase } from './purchase';
import type { FinanceData, Goal } from './types';

const T = '2026-10-21';

/** Демо + две цели со своими счетами: отпуск к маю (≈ 7 мес.), ноутбук к декабрю (≈ 2 мес.). */
function withGoals(): FinanceData {
  let d = demoData(T, 1000);
  d = addAccount(d, 'savings', rub(10_000), T, 1000, 'acc-trip', 'Отпуск');
  d = addAccount(d, 'savings', rub(0), T, 1000, 'acc-laptop', 'Ноутбук');
  const trip: Goal = { id: 'trip', name: 'Отпуск', target: rub(80_000), deadline: '2027-05-01', accountId: 'acc-trip' };
  const laptop: Goal = { id: 'laptop', name: 'Ноутбук', target: rub(9_000), deadline: '2026-12-15', accountId: 'acc-laptop' };
  return { ...d, goals: [...d.goals, trip, laptop] };
}

describe('очередь целей', () => {
  it('по сроку от ближнего к дальнему, без срока — в конце', () => {
    expect(goalsByPriority(withGoals().goals).map((g) => g.id)).toEqual(['laptop', 'trip', 'goal']);
  });
});

describe('распределение откладывания по целям', () => {
  it('ближний срок получает нужное, потом следующая; цели без срока — не меньше 20 % (3.26)', () => {
    const d = withGoals();
    const shares = allocateSetAside(d, rub(13_500), T);
    // 20 % = 2 700 — целям без срока; остальные 10 800: ноутбук 9 000 за 2 мес. → 4 500,
    // отпуск 70 000 за 7 мес. → нужно 10 000, достаётся 6 300
    expect(shares.map((s) => [s.goal.id, s.amount])).toEqual([
      ['laptop', rub(4_500)],
      ['trip', rub(6_300)],
      ['goal', rub(2_700)],
    ]);
  });

  it('цель со сроком, которая не успевает, видна сразу', () => {
    const d = withGoals();
    const trip = d.goals.find((g) => g.id === 'trip')!;
    expect(goalBehind(d, trip, rub(8_000), T)).toEqual({ need: rub(10_000), saving: rub(8_000) });
    expect(goalBehind(d, trip, rub(12_000), T)).toBeNull();
  });

  it('если на все цели хватает, остаток уходит цели без срока', () => {
    const d = withGoals();
    const shares = allocateSetAside(d, rub(20_000), T);
    expect(shares.map((s) => s.amount)).toEqual([rub(4_500), rub(10_000), rub(5_500)]);
  });
});

describe('новая цель', () => {
  it('создаётся вместе со своим накопительным счётом', () => {
    const d = createGoal(demoData(T, 1000), { id: 'car', name: 'Машина', target: rub(500_000) }, rub(20_000), T, 2000);
    const goal = d.goals.at(-1)!;
    expect(goal.accountId).toBe('acc-car');
    expect(d.accounts.find((a) => a.id === 'acc-car')).toMatchObject({ kind: 'savings', name: 'Машина', amount: rub(20_000) });
  });
});

describe('покупка с накоплений', () => {
  it('сначала берётся с последних по очереди целей', () => {
    const d = withGoals();
    expect(takeFromSavings(d, rub(105_000), T).map((t) => [t.accountId, t.take])).toEqual([
      ['savings', rub(100_000)],
      ['acc-trip', rub(5_000)],
    ]);
  });

  it('вердикт видит все накопительные счета', () => {
    const d = withGoals();
    const limit = computeLimit(d, T) as LimitOk;
    const r = evaluatePurchase(d, limit, rub(50_000), { kind: 'savings' }, T);
    expect(r.available).toBe(rub(110_000));
    expect(r.goalAfter?.goal.id).toBe('goal');
  });
});
