import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dateInMonth, diffDays } from './dates';
import { closeDay, closedStreak, isBalanceStale, unclosedDays } from './days';
import { DEMO_GOAL, demoData } from './demo';
import {
  formatPermille,
  formatRub,
  formatRubWhole,
  formatRubWholeUp,
  parseRubInput,
  pluralDays,
  toRubInput,
} from './format';
import { goalProgressPermille } from './goal';
import { computeLimit, type LimitOk } from './limit';
import { kop, percentOf, rub } from './money';
import { robotMood } from './mood';
import { evaluatePurchase, previewWithdrawal, savingsTotal } from './purchase';

const T = '2026-10-21';

function demoLimit() {
  const data = demoData(T, 1000);
  const limit = computeLimit(data, T) as LimitOk;
  return { data, limit };
}

describe('деньги', () => {
  it('только целые копейки', () => {
    expect(() => kop(1.5)).toThrow();
    expect(rub(1_050)).toBe(105_000);
  });

  it('процент округляется вниз', () => {
    expect(percentOf(kop(101), 30)).toBe(30);
  });
});

describe('даты', () => {
  it('арифметика без часовых поясов', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(diffDays('2026-10-21', '2026-11-20')).toBe(30);
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(dateInMonth('2028-02', 31)).toBe('2028-02-29');
  });
});

describe('настроение робота (лимит 1 050 ₽)', () => {
  const L = rub(1_050);
  it.each([
    [0, 'calm'],
    [rub(1_050), 'joy'],
    [rub(1_050) + 1, 'sad'],
    [rub(5_000), 'sad'],
  ] as const)('потрачено %i коп. → %s', (spent, mood) => {
    expect(robotMood(kop(spent), L)).toBe(mood);
  });
});

describe('прогресс цели', () => {
  it('100 000 из 1 000 000 — 10%', () => {
    expect(formatPermille(goalProgressPermille(rub(100_000), rub(1_000_000)))).toBe('10%');
  });
});

describe('закрытие дня и привычка', () => {
  it('закрытие считает траты только с основного счёта', () => {
    const { data } = demoLimit();
    const c = closeDay(data, '2026-10-20', rub(1_050), 'otherDays');
    expect(c.spent).toBe(rub(2_340));
    expect(c.saved).toBe(0);
  });

  it('серия и незакрытые дни', () => {
    const { data } = demoLimit();
    data.closures = ['2026-10-18', '2026-10-19', '2026-10-20'].map((date) => ({
      date, spent: rub(0), limit: rub(0), saved: rub(0),
    }));
    expect(closedStreak(data, T)).toBe(3);
    expect(unclosedDays(data, '2026-10-15', T)).toEqual(['2026-10-17', '2026-10-16', '2026-10-15']);
  });

  it('остаток устарел через 3 дня', () => {
    const { data } = demoLimit();
    data.accounts[0].asOf = '2026-10-19';
    expect(isBalanceStale(data, T)).toBe(false);
    data.accounts[0].asOf = '2026-10-18';
    expect(isBalanceStale(data, T)).toBe(true);
  });
});

describe('покупка: примеры демо (SPEC, раздел 10)', () => {
  it('90 000 с основного счёта — не хватает сейчас', () => {
    const { data, limit } = demoLimit();
    const r = evaluatePurchase(data, limit, rub(90_000), { kind: 'main' }, T, DEMO_GOAL);
    expect(r.available).toBe(rub(31_500));
    expect(r.shortfall).toBe(rub(58_500));
    expect(['wait', 'no']).toContain(r.verdict);
    expect(r.recommendations.map((x) => x.type)).toContain('fromSavings');
  });

  it('90 000 с накоплений — «с компромиссом», цель с 10% до 1%', () => {
    const { data, limit } = demoLimit();
    const r = evaluatePurchase(data, limit, rub(90_000), { kind: 'savings' }, T, DEMO_GOAL);
    expect(r.verdict).toBe('compromise');
    expect(r.sharePercent).toBe(90);
    expect(r.goalAfter?.from).toBe(100);
    expect(r.goalAfter?.to).toBe(10);
  });

  it('90 000 со всех счетов — «с компромиссом», около 68%', () => {
    const { data, limit } = demoLimit();
    const r = evaluatePurchase(data, limit, rub(90_000), { kind: 'all' }, T, DEMO_GOAL);
    expect(r.available).toBe(rub(131_500));
    expect(r.verdict).toBe('compromise');
    expect(r.sharePercent).toBe(68);
    expect(r.split).toEqual({ free: rub(31_500), other: 0, savings: rub(58_500) });
    expect(r.limitAfter?.to).toBe(0);
  });

  it('небольшая покупка — «Можно»', () => {
    const { data, limit } = demoLimit();
    const r = evaluatePurchase(data, limit, rub(10_000), { kind: 'main' }, T, DEMO_GOAL);
    expect(r.verdict).toBe('yes');
    // (31 500 − 10 000) / 30 = 716,66 → 716,66 ₽
    expect(r.limitAfter).toEqual({ from: rub(1_050), to: rub(716) + 66 });
  });

  it('ровно половина доступного — ещё «Можно»', () => {
    const { data, limit } = demoLimit();
    expect(evaluatePurchase(data, limit, rub(15_750), { kind: 'main' }, T).verdict).toBe('yes');
    expect(evaluatePurchase(data, limit, kop(rub(15_750) + 1),{ kind: 'main' }, T).verdict).toBe('compromise');
  });

  it('без откладывания срок накопления оценить нельзя', () => {
    const data = demoData(T, 1000);
    data.settings.savePercent = 0;
    const limit = computeLimit(data, T) as LimitOk;
    const r = evaluatePurchase(data, limit, rub(500_000), { kind: 'main' }, T);
    expect(r.verdict).toBe('unknown');
  });
});

describe('«Взять из накоплений»', () => {
  it('10 500 ₽: лимит с 1 050 до 1 400, цель отодвинется примерно на 3 недели', () => {
    const { data, limit } = demoLimit();
    const p = previewWithdrawal(limit, rub(10_500), savingsTotal(data, T), DEMO_GOAL);
    expect(p.limitFrom).toBe(rub(1_050));
    expect(p.limitTo).toBe(rub(1_400));
    expect(p.goalDelayDays).toBe(24);
  });
});

describe('форматирование', () => {
  it('суммы и дни', () => {
    expect(formatRub(rub(1_050))).toBe('1 050 ₽');
    expect(formatRub(kop(105_001))).toBe('1 050,01 ₽');
    expect(formatRubWhole(kop(109_827))).toBe('1 098 ₽');
    expect(formatRubWhole(kop(-150))).toBe('−2 ₽');
    expect(formatRubWholeUp(kop(10_173))).toBe('102 ₽');
    expect(parseRubInput('1050')).toBe(105_000);
    expect(parseRubInput('1050,5')).toBe(105_050);
    expect(parseRubInput('0,07')).toBe(7);
    expect(parseRubInput('')).toBeNull();
    for (const v of [105_000, 105_050, 105_005, 7]) expect(parseRubInput(toRubInput(kop(v)))).toBe(v);
    expect(parseRubInput('1,234')).toBeNull();
    expect(pluralDays(21)).toBe('день');
    expect(pluralDays(22)).toBe('дня');
    expect(pluralDays(11)).toBe('дней');
  });
});
