import { describe, expect, it } from 'vitest';
import { addExpense } from './actions';
import { demoData } from './demo';
import { explainAvailable, explainLimit, explainMainAccount, type ExplainLine } from './explain';
import { computeLimit, type LimitOk } from './limit';
import { rub } from './money';
import { evaluatePurchase } from './purchase';

const T = '2026-10-21';

/** Строки складываются: начало + плюсы − минусы = итог. */
function adds(lines: ExplainLine[]): boolean {
  let acc = 0;
  for (const l of lines) {
    if (l.kind === 'total') {
      if (acc !== l.amount) return false;
      continue;
    }
    acc += l.kind === 'minus' ? -l.amount : l.amount;
  }
  return true;
}

describe('объяснение лимита (контрольный расчёт демо)', () => {
  const d = demoData(T, 1000);
  const limit = computeLimit(d, T) as LimitOk;
  const e = explainLimit(d, limit);

  it('100 000 − квартира − транспорт − откладывание = 31 500, это 1 050 в день', () => {
    expect(e.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['start', rub(100_000)],
      ['minus', rub(40_000)],
      ['minus', rub(15_000)],
      ['minus', rub(13_500)],
      ['total', rub(31_500)],
    ]);
    expect(e.days).toBe(30);
    expect(e.dailyLimit).toBe(rub(1_050));
    expect(adds(e.lines)).toBe(true);
  });

  it('с тратами за сегодня видно, сколько осталось свободно', () => {
    const d2 = addExpense(d, { amount: rub(500), accountId: 'main', categoryId: 'food', date: T }, 'x', 2000);
    const lines = explainMainAccount(d2, computeLimit(d2, T) as LimitOk, T);
    expect(lines.at(-1)).toMatchObject({ label: 'Осталось свободно', amount: rub(31_000) });
    expect(adds(lines)).toBe(true);
  });
});

describe('объяснение «Доступно» в покупке', () => {
  it('все счета: 31 500 свободно на основном + 100 000 накоплений = 131 500; на 200 000 не хватает 68 500', () => {
    const d = demoData(T, 1000);
    const limit = computeLimit(d, T) as LimitOk;
    const r = evaluatePurchase(d, limit, rub(200_000), { kind: 'all' }, T);
    const lines = explainAvailable(d, limit, { kind: 'all' }, r, T);
    expect(lines.map((l) => [l.label, l.amount])).toEqual([
      ['Свободно на основном счёте', rub(31_500)],
      ['Накопления', rub(100_000)],
      ['Доступно', rub(131_500)],
      ['Не хватает', rub(68_500)],
    ]);
    expect(r.available).toBe(rub(131_500));
  });
});
