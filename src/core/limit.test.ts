import { describe, expect, it } from 'vitest';
import { closeDay } from './days';
import { demoData } from './demo';
import { computeLimit, type LimitOk } from './limit';
import { rub, type Kopecks } from './money';
import type { Expense, FinanceData, Transfer } from './types';

const T = '2026-10-21';
const SNAP = 1000; // момент записи остатка

/**
 * Демо без примерных трат, а полученная зарплата сдвинута на начало окна (10-е):
 * так тесты могут сдвигать дату остатка, не задевая эти события.
 */
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

function expense(amount: Kopecks, date: string, createdAt: number, accountId = 'main'): Expense {
  return { id: `e${createdAt}${date}`, amount, accountId, categoryId: 'food', date, createdAt };
}

function transfer(t: Partial<Transfer> & Pick<Transfer, 'amount' | 'purpose'>): Transfer {
  return { id: `t${Math.random()}`, fromAccountId: 'main', toAccountId: 'savings', date: T, createdAt: 5000, ...t };
}

describe('контрольный расчёт демо (SPEC, раздел 14)', () => {
  const r = ok(demo());

  it('горизонт — 20 ноября, расчёт по 30 дням, на экране 20–30 дней', () => {
    expect(r.horizon).toBe('2026-11-20');
    expect(r.days).toBe(30);
    expect(r.daysRange).toEqual({ min: 20, max: 30 });
  });

  it('резервы: квартира 40 000 и транспорт 15 000', () => {
    expect(r.startBalance).toBe(rub(100_000));
    expect(r.reservedPayments.map((p) => [p.date, p.amount])).toEqual([['2026-11-10', rub(40_000)]]);
    expect(r.transportReserve).toBe(rub(15_000));
  });

  it('база 45 000, откладывание 13 500, свободно 31 500, лимит 1 050', () => {
    expect(r.base).toBe(rub(45_000));
    expect(r.setAside).toBe(rub(13_500));
    expect(r.free).toBe(rub(31_500));
    expect(r.dailyLimit).toBe(rub(1_050));
    expect(r.noFreeMoney).toBe(false);
  });
});

describe('нет данных — лимит не выдаётся', () => {
  it('нет основного счёта', () => {
    const d = demo();
    d.accounts = d.accounts.filter((a) => a.kind !== 'main');
    expect(computeLimit(d, T)).toEqual({ status: 'noData', missing: ['mainBalance'] });
  });

  it('нет ни одного ожидаемого дохода', () => {
    const d = demo();
    d.regularIncomes = [];
    expect(computeLimit(d, T)).toEqual({ status: 'noData', missing: ['income'] });
  });
});

describe('траты за сегодня не входят в остаток на начало дня', () => {
  it('лимит не дрожит при записи сегодняшней траты', () => {
    const d = demo();
    d.expenses.push(expense(rub(5_000), T, SNAP + 1));
    expect(ok(d).dailyLimit).toBe(rub(1_050));
  });

  it('остаток записан сегодня после трат — траты «возвращаются» в начало дня', () => {
    const d = demo();
    d.accounts[0].amount = rub(95_000);
    d.expenses.push(expense(rub(5_000), T, SNAP - 1));
    const r = ok(d);
    expect(r.startBalance).toBe(rub(100_000));
    expect(r.dailyLimit).toBe(rub(1_050));
  });

  it('траты с другого счёта на лимит не влияют', () => {
    const d = demo();
    d.expenses.push(expense(rub(5_000), '2026-10-20', SNAP + 1, 'savings'));
    d.accounts[0].asOf = '2026-10-19';
    // 100 000 − транспорт за 2 прошедших дня (2 × 500)
    expect(ok(d).startBalance).toBe(rub(99_000));
  });
});

describe('события между датой остатка и сегодня', () => {
  it('траты после записи остатка вычитаются, до записи — уже в остатке', () => {
    const d = demo();
    d.accounts[0].asOf = '2026-10-19';
    d.expenses.push(expense(rub(1_000), '2026-10-19', SNAP - 1)); // уже в остатке
    d.expenses.push(expense(rub(2_000), '2026-10-19', SNAP + 1)); // записана позже
    d.expenses.push(expense(rub(3_000), '2026-10-20', 1)); // после даты остатка
    // 100 000 − 2 000 − 3 000 − транспорт за 2 дня
    expect(ok(d).startBalance).toBe(rub(94_000));
  });

  it('транспорт за прошедшие дни считается израсходованным', () => {
    const d = demo();
    d.accounts[0].asOf = '2026-10-18';
    expect(ok(d).startBalance).toBe(rub(98_500));
  });

  it('платёж в день остатка: без отметки консервативно вычитается, с отметкой — нет', () => {
    const d = demo();
    d.accounts[0].asOf = '2026-10-10';
    const unknown = ok(d).startBalance;
    d.accounts[0].paidOnAsOf = ['rent:2026-10'];
    const paid = ok(d).startBalance;
    // транспорт за 11 дней: 5 500
    expect(unknown).toBe(rub(54_500));
    expect(paid).toBe(rub(94_500));
  });

  it('подтверждённый доход после даты остатка добавляется', () => {
    const d = demo('2026-11-09');
    d.accounts[0].asOf = '2026-11-14';
    d.receipts.push({ id: 'r-nov', occurrenceKey: 'salary:2026-11', amount: rub(130_000), date: '2026-11-15', createdAt: 9999 });
    const r = ok(d, '2026-11-15');
    expect(r.startBalance).toBe(rub(229_500));
    expect(r.horizon).toBe('2026-12-20');
  });
});

describe('обязательные платежи', () => {
  it('платёж сегодня резервируется; если остаток записан сегодня с отметкой «оплачен» — нет', () => {
    const d = demo('2026-11-10');
    const dates = () => ok(d, '2026-11-10').reservedPayments.map((p) => p.date);
    expect(dates()).toEqual(['2026-11-10', '2026-12-10']);
    d.accounts[0].paidOnAsOf = ['rent:2026-11'];
    expect(dates()).toEqual(['2026-12-10']);
  });

  it('платёж в день дохода резервируется (консервативно)', () => {
    const d = demo();
    d.payments.push({ id: 'net', name: 'Интернет', day: 20, amounts: [{ fromMonth: '2026-01', amount: rub(700) }] });
    expect(ok(d).reservedPayments.map((p) => p.date)).toContain('2026-11-20');
  });

  it('платёж на 31-е в коротком месяце — в последний день месяца', () => {
    const d = demo('2027-02-21');
    d.payments = [{ id: 'x', name: 'Кредит', day: 31, amounts: [{ fromMonth: '2026-01', amount: rub(1_000) }] }];
    expect(ok(d, '2027-02-21').reservedPayments.map((p) => p.date)).toEqual(['2027-02-28']);
  });

  it('изменение суммы действует с выбранного месяца вперёд', () => {
    const d = demo();
    d.payments[0].amounts.push({ fromMonth: '2026-11', amount: rub(45_000) });
    expect(ok(d).reservedPayments[0].amount).toBe(rub(45_000));
    d.payments[0].amounts = [{ fromMonth: '2026-01', amount: rub(40_000) }, { fromMonth: '2026-12', amount: rub(45_000) }];
    expect(ok(d).reservedPayments[0].amount).toBe(rub(40_000));
  });
});

describe('горизонт', () => {
  it('ожидаемый разовый доход не сокращает дни до зарплаты и не меняет лимит', () => {
    for (const date of [T, '2026-10-23', '2026-11-01']) {
      const d = demo();
      d.oneOffIncomes.push({ id: 'p', name: 'Проект', amount: rub(25_000), date });
      const r = ok(d);
      expect(r.horizon).toBe('2026-11-20');
      expect(r.dailyLimit).toBe(rub(1_050));
    }
  });

  it('если регулярных доходов нет, горизонт — ближайший разовый', () => {
    const d = demo();
    d.regularIncomes = [];
    d.oneOffIncomes.push({ id: 'p', name: 'Проект', amount: rub(20_000), date: '2026-11-01' });
    const r = ok(d);
    expect(r.horizon).toBe('2026-11-01');
    expect(r.days).toBe(11);
    expect(r.reservedPayments).toHaveLength(0);
  });

  it('доход ожидается сегодня и не подтверждён — дней 1', () => {
    const d = demo();
    d.regularIncomes = [{ id: 'fix', name: 'Аванс', min: rub(50_000), max: rub(50_000), schedule: { type: 'days', days: [21] } }];
    const r = ok(d);
    expect(r.horizon).toBe(T);
    expect(r.days).toBe(1);
  });

  it('внутри окна зарплаты нижняя граница дней не меньше 0', () => {
    const d = demo('2026-11-09');
    const r = ok(d, '2026-11-15');
    expect(r.horizon).toBe('2026-11-20');
    expect(r.daysRange).toEqual({ min: 0, max: 5 });
  });

  it('несколько дней месяца (5-е и 20-е)', () => {
    const d = demo();
    d.regularIncomes = [{ id: 'two', name: 'Зарплата', min: rub(60_000), max: rub(60_000), schedule: { type: 'days', days: [20, 5] } }];
    expect(ok(d).horizon).toBe('2026-11-05');
  });
});

describe('откладывание фиксируется в начале периода (вариант А)', () => {
  it('на следующий день откладываемая часть не уменьшается', () => {
    const d = demo();
    const day1 = ok(d);
    d.savePlan = day1.savePlan;
    d.expenses.push(expense(rub(1_050), T, SNAP + 1));
    const day2 = ok(d, '2026-10-22');
    expect(day2.setAside).toBe(rub(13_500));
    expect(day2.free).toBe(rub(30_450));
    expect(day2.dailyLimit).toBe(rub(1_050));
  });

  it('перевод в накопления уменьшает непереведённую часть, свободно не меняется', () => {
    const d = demo();
    d.savePlan = ok(d).savePlan;
    d.transfers.push(transfer({ amount: rub(13_500), purpose: 'setAside' }));
    const r = ok(d);
    expect(r.setAside).toBe(rub(0));
    expect(r.free).toBe(rub(31_500));
  });

  it('новый доход начинает новый период — откладывание считается заново', () => {
    const d = demo();
    d.savePlan = ok(d).savePlan;
    d.receipts.push({ id: 'r-nov', occurrenceKey: 'salary:2026-11', amount: rub(120_000), date: '2026-11-15', createdAt: 9999 });
    const r = ok(d, '2026-11-15');
    expect(r.savePlan.periodKey).toBe('r-nov');
  });

  it('новый обязательный платёж на следующий день пересчитывает откладывание', () => {
    const d = demo();
    d.savePlan = ok(d).savePlan;
    d.payments.push({ id: 'loan', name: 'Кредит', day: 25, amounts: [{ fromMonth: '2026-01', amount: rub(10_000) }] });
    const r = ok(d, '2026-10-22');
    // транспорт за 21-е: 500; база = 99 500 − 40 000 − 10 000 − 14 500 = 35 000; 30% = 10 500
    expect(r.setAside).toBe(rub(10_500));
    expect(r.savePlan.createdOn).toBe('2026-10-22');
  });

  it('в день расчёта откладывание следует за исправлением остатка, на следующий день — нет', () => {
    const d = demo();
    d.savePlan = ok(d).savePlan;
    d.accounts[0].amount = rub(90_000);
    expect(ok(d).setAside).toBe(rub(10_500));
    d.savePlan = ok(d).savePlan;
    d.accounts[0].amount = rub(80_000);
    d.accounts[0].asOf = '2026-10-22';
    expect(ok(d, '2026-10-22').setAside).toBe(rub(10_500));
  });

  it('изменение процента пересчитывает откладывание', () => {
    const d = demo();
    d.savePlan = ok(d).savePlan;
    d.settings.savePercent = 0;
    const r = ok(d);
    expect(r.setAside).toBe(rub(0));
    expect(r.dailyLimit).toBe(rub(1_500));
  });

  it('свободных денег нет — лимит 0', () => {
    const d = demo();
    d.accounts[0].amount = rub(50_000);
    const r = ok(d);
    expect(r.free).toBeLessThanOrEqual(0);
    expect(r.dailyLimit).toBe(rub(0));
    expect(r.noFreeMoney).toBe(true);
  });
});

describe('режим «на счёт»', () => {
  function accountMode(): FinanceData {
    const d = demo();
    d.settings.leftoverMode = 'account';
    const r = ok(d);
    d.savePlan = r.savePlan;
    d.fixedLimit = r.fixedLimit;
    return d;
  }

  it('недотраченное откладывается как «сэкономлено», лимит не растёт', () => {
    const d = accountMode();
    d.expenses.push(expense(rub(650), T, SNAP + 1));
    d.closures.push(closeDay(d, T, rub(1_050), 'account'));
    expect(d.closures[0].saved).toBe(rub(400));
    const r = ok(d, '2026-10-22');
    expect(r.saved).toBe(rub(400));
    expect(r.dailyLimit).toBe(rub(1_050));
  });

  it('перерасход снижает лимит на оставшиеся дни', () => {
    const d = accountMode();
    d.expenses.push(expense(rub(3_000), T, SNAP + 1));
    d.closures.push(closeDay(d, T, rub(1_050), 'account'));
    const r = ok(d, '2026-10-22');
    // (31 500 − 3 000) / 29 = 982,75 → 982 ₽
    expect(r.dailyLimit).toBe(rub(982) + 75);
    expect(r.dailyLimit).toBeLessThan(rub(1_050));
  });

  it('в режиме «на другие дни» недотраченное растворяется в оставшихся днях', () => {
    const d = demo();
    d.savePlan = ok(d).savePlan;
    d.expenses.push(expense(rub(650), T, SNAP + 1));
    d.closures.push(closeDay(d, T, rub(1_050), 'otherDays'));
    const r = ok(d, '2026-10-22');
    // (31 500 − 650) / 29 = 1 063,79 → 1 063,79 ₽
    expect(r.dailyLimit).toBe(rub(1_063) + 79);
    expect(d.closures[0].saved).toBe(rub(0));
  });
});
