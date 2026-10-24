import { describe, expect, it } from 'vitest';
import { computeLimit } from './limit';
import { rub } from './money';
import { buildFromAnswers, emptyAnswers } from './onboarding';

const T = '2026-10-21';

describe('анкета первого входа → данные (SPEC 3.27)', () => {
  it('ответы как в демо дают тот же лимит, что контрольный расчёт без откладывания', () => {
    const d = buildFromAnswers(
      {
        ...emptyAnswers(),
        balance: rub(100_000),
        incomes: [{ id: 'salary', name: 'Зарплата', min: rub(120_000), max: rub(150_000), schedule: { type: 'window', fromDay: 10, toDay: 20 } }],
        payments: [{ id: 'rent', name: 'Квартира', amount: rub(40_000), day: 10 }],
        transportMonthly: rub(15_000),
        savings: rub(100_000),
        goal: { name: 'Цель', target: rub(1_000_000) },
      },
      T,
      1000,
    );
    expect(d.isDemo).toBe(false);
    expect(d.goals[0].name).toBe('Цель');
    expect(d.accounts.find((a) => a.id === d.goals[0].accountId)?.amount).toBe(rub(100_000));
    const r = computeLimit(d, T);
    // Дохода в периоде ещё не было (старт посреди месяца) — откладывать не из чего: 45 000 / 30 = 1 500
    expect(r.status === 'ok' && r.dailyLimit).toBe(rub(1_500));
  });

  it('пропущено всё, кроме остатка, — лимит считается на 30 дней вперёд', () => {
    const d = buildFromAnswers({ ...emptyAnswers(), balance: rub(30_000) }, T, 1000);
    const r = computeLimit(d, T);
    expect(r.status === 'ok' && r.dailyLimit).toBe(rub(1_000));
    expect(d.goals).toHaveLength(0);
    expect(d.accounts).toHaveLength(1);
  });

  it('без регулярного дохода — своя дата «Дотянуть до»', () => {
    const d = buildFromAnswers({ ...emptyAnswers(), balance: rub(10_000), stretchUntil: '2026-10-31' }, T, 1000);
    const r = computeLimit(d, T);
    expect(r.status === 'ok' && r.horizon).toBe('2026-10-31');
  });

  it('накопления без цели — на общий накопительный счёт; анкета «не экономить» сохраняется', () => {
    const d = buildFromAnswers({ ...emptyAnswers(), balance: rub(1), savings: rub(5_000), protectedCategoryIds: ['health'] }, T, 1000);
    expect(d.accounts.find((a) => a.kind === 'savings')?.amount).toBe(rub(5_000));
    expect(d.questionnaire.protectedCategoryIds).toEqual(['health']);
  });
});
