// Решения по дилеммам концепции из симуляции (SPEC 3.26, пункты 8–21).
import { describe, expect, it } from 'vitest';
import {
  addExpense,
  confirmPaymentPaid,
  delayPayment,
  paymentQuestion,
  recentDuplicate,
  setAsideReminderDue,
  transferSetAside,
} from './actions';
import { demoData } from './demo';
import { computeLimit, type LimitOk } from './limit';
import { robotMood } from './mood';
import { rub } from './money';
import { majorIncomeIds, monthlyDeficit, normalMonthlySaving } from './month';
import { balanceGap } from './profile';
import { paymentOccurrences } from './schedule';
import type { FinanceData } from './types';

const T = '2026-10-21';

function demo(today = T): FinanceData {
  const d = demoData(today, 1000);
  return {
    ...d,
    expenses: [],
    receipts: d.receipts.map((r) => ({ ...r, date: `${r.occurrenceKey.split(':')[1]}-10` })),
  };
}

function ok(data: FinanceData, today = T): LimitOk {
  const r = computeLimit(data, today);
  if (r.status !== 'ok') throw new Error('нет лимита');
  return r;
}

describe('9. основной и дополнительный доход', () => {
  it('стипендия, которой не хватает на обязательное, — дополнительный доход', () => {
    const d = demo();
    d.regularIncomes.push({ id: 'st', name: 'Стипендия', min: rub(4_500), max: rub(4_500), schedule: { type: 'days', days: [25] } });
    expect([...majorIncomeIds(d, T)]).toEqual(['salary']);
  });

  it('если основных нет, горизонтом служат все регулярные', () => {
    const d = demo();
    d.regularIncomes = [{ id: 'st', name: 'Стипендия', min: rub(4_500), max: rub(4_500), schedule: { type: 'days', days: [25] } }];
    expect(ok(d).horizon).toBe('2026-10-25');
  });
});

describe('11. денег не хватает', () => {
  it('робот спокоен, если свободных денег нет', () => {
    expect(robotMood(rub(300), rub(0), true)).toBe('calm');
    expect(robotMood(rub(300), rub(200), false)).toBe('sad');
  });

  it('в месяц расходы больше доходов: траты за 30 дней + платежи + транспорт − доходы', () => {
    let d = demo();
    d = addExpense(d, { amount: rub(70_000), accountId: 'main', categoryId: 'food', date: '2026-10-15' }, 'x', 1);
    // 70 000 + 40 000 + 15 000 − 120 000 = 5 000
    expect(monthlyDeficit(d, T)).toBe(rub(5_000));
  });
});

describe('12. откладывание от пришедшего дохода и не ниже 500 ₽ в день', () => {
  it('демо: 30 % от меньшего из Базы и дохода — 13 500 ₽ (контрольный расчёт не меняется)', () => {
    expect(ok(demo()).setAside).toBe(rub(13_500));
  });

  it('старт посреди месяца без дохода в периоде — откладывать не из чего', () => {
    const d = demo();
    d.receipts = [];
    expect(ok(d).setAside).toBe(0);
  });

  it('лимит дня из-за откладывания не опускается ниже 500 ₽', () => {
    const d = demo();
    d.accounts[0].amount = rub(65_000); // База 10 000 на 30 дней
    const r = ok(d);
    expect(r.setAside).toBe(0);
    expect(r.dailyLimit).toBe(rub(333) + 33);
  });

  it('разовый доход внутри периода добавляет процент от своей суммы', () => {
    const d = demo();
    d.savePlan = ok(d).savePlan;
    d.receipts.push({ id: 'p', occurrenceKey: 'oneoff:p', amount: rub(10_000), date: T, createdAt: 5000 });
    d.oneOffIncomes.push({ id: 'p', name: 'Проект', amount: rub(10_000), date: T });
    d.savePlan = { ...d.savePlan, basis: ok(d).savePlan.basis, createdOn: '2026-10-20' };
    expect(ok(d).savePlan.amount).toBe(rub(16_500));
  });
});

describe('13. заметное расхождение при обновлении остатка', () => {
  it('меньше на 12 000 ₽ — предложить разнести траты', () => {
    expect(balanceGap(demo(), 'main', rub(88_000), T)).toEqual({ gap: rub(12_000), notice: true });
    expect(balanceGap(demo(), 'main', rub(99_500), T)).toEqual({ gap: rub(500), notice: false });
    expect(balanceGap(demo(), 'main', rub(101_000), T)).toBeNull();
  });
});

describe('14. платёж каждую неделю', () => {
  it('аптека по средам', () => {
    const d = demo();
    d.payments.push({ id: 'ph', name: 'Аптека', day: 1, amounts: [{ fromMonth: '2026-01', amount: rub(1_500) }], repeat: { type: 'weekly', weekday: 2 } });
    expect(paymentOccurrences(d.payments, '2026-10-21', '2026-11-04').filter((p) => p.paymentId === 'ph').map((p) => p.date)).toEqual([
      '2026-10-21',
      '2026-10-28',
      '2026-11-04',
    ]);
  });
});

describe('15. сроки по обычному месяцу', () => {
  it('демо: 30 % × (120 000 − 40 000 − 15 000) = 19 500 ₽ в месяц', () => {
    expect(normalMonthlySaving(demo(), T)).toBe(rub(19_500));
  });
});

describe('19. защита от дублей', () => {
  it('та же сумма и категория за 10 минут — дубль', () => {
    const e = { amount: rub(500), accountId: 'main', categoryId: 'food', date: T };
    const d = addExpense(demo(), e, 'a', 1_000_000);
    expect(recentDuplicate(d, e, 1_000_000 + 5 * 60_000)?.id).toBe('a');
    expect(recentDuplicate(d, e, 1_000_000 + 11 * 60_000)).toBeNull();
    expect(recentDuplicate(d, { ...e, categoryId: 'fun' }, 1_000_100)).toBeNull();
  });
});

describe('20. платёж под вопросом', () => {
  it('денег на платёж не хватало — спросить; «нет» переносит, «да» снимает вопрос', () => {
    const d = demo('2026-11-08');
    d.accounts[0] = { ...d.accounts[0], amount: rub(30_000), asOf: '2026-11-08', asOfTs: 1 };
    const q = paymentQuestion(d, '2026-11-11');
    expect(q?.key).toBe('rent:2026-11');
    const delayed = delayPayment(d, q!.key, '2026-11-15');
    expect(paymentQuestion(delayed, '2026-11-11')).toBeNull();
    expect(ok(delayed, '2026-11-11').reservedPayments.map((p) => p.date)).toContain('2026-11-15');
    expect(paymentQuestion(confirmPaymentPaid(d, q!.key), '2026-11-11')).toBeNull();
  });
});

describe('21. напоминание перевести отложенное', () => {
  it('через 3 дня после начала периода; «Перевёл(а)» переводит всё', () => {
    const d = demo();
    const r = ok(d);
    expect(setAsideReminderDue(d, r, T)).toBe(true);
    let n = 0;
    const after = transferSetAside(d, r, T, 2000, () => `t${n++}`);
    expect(ok(after).setAside).toBe(0);
  });
});
