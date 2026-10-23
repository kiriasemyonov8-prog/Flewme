// Разворачивает регулярные доходы и платежи в конкретные даты.
import { addDays, addMonths, dateInMonth, diffDays, monthOf, weekdayMon0, type ISODate, type ISOMonth } from './dates';
import type { Kopecks } from './money';
import type {
  FinanceData,
  FixedPayment,
  IncomeDelay,
  IncomeReceipt,
  OneOffIncome,
  PaymentDelay,
  RegularIncome,
  WeeklyRepeat,
} from './types';

export interface IncomeOccurrence {
  key: string;
  name: string;
  /** Самая ранняя возможная дата (для фиксированной даты равна late). */
  early: ISODate;
  /** Самая поздняя возможная дата: по ней считается горизонт. */
  late: ISODate;
  min: Kopecks;
  max: Kopecks;
}

export interface PaymentOccurrence {
  key: string;
  paymentId: string;
  name: string;
  date: ISODate;
  amount: Kopecks;
}

function monthsBetween(from: ISOMonth, to: ISOMonth): ISOMonth[] {
  const out: ISOMonth[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Даты месяца для повтора «каждую неделю» или «раз в две недели» (3.26). */
export function weeklyDates(r: WeeklyRepeat, month: ISOMonth): ISODate[] {
  const out: ISODate[] = [];
  for (let d = dateInMonth(month, 1); monthOf(d) === month; d = addDays(d, 1)) {
    if (r.type === 'weekly' ? weekdayMon0(d) === r.weekday : diffDays(r.from, d) % 14 === 0 && d >= r.from) out.push(d);
  }
  return out;
}

export function regularIncomeOccurrences(
  income: RegularIncome,
  fromMonth: ISOMonth,
  toMonth: ISOMonth,
): IncomeOccurrence[] {
  const out: IncomeOccurrence[] = [];
  for (const month of monthsBetween(fromMonth, toMonth)) {
    const s = income.schedule;
    if (s.type === 'window') {
      out.push({
        key: `${income.id}:${month}`,
        name: income.name,
        early: dateInMonth(month, s.fromDay),
        late: dateInMonth(month, s.toDay),
        min: income.min,
        max: income.max,
      });
    } else if (s.type === 'weekly' || s.type === 'biweekly') {
      for (const date of weeklyDates(s, month)) {
        out.push({ key: `${income.id}:${date}`, name: income.name, early: date, late: date, min: income.min, max: income.max });
      }
    } else {
      for (const day of [...s.days].sort((a, b) => a - b)) {
        const date = dateInMonth(month, day);
        out.push({
          key: `${income.id}:${month}:${day}`,
          name: income.name,
          early: date,
          late: date,
          min: income.min,
          max: income.max,
        });
      }
    }
  }
  return out;
}

export function oneOffOccurrence(income: OneOffIncome): IncomeOccurrence {
  return {
    key: `oneoff:${income.id}`,
    name: income.name,
    early: income.date,
    late: income.date,
    min: income.amount,
    max: income.amount,
  };
}

/**
 * Ожидаемые (ещё не подтверждённые) доходы вокруг даты today.
 * «Задерживается» сдвигает позднюю дату выплаты (3.25).
 */
export function expectedIncomes(
  regular: RegularIncome[],
  oneOff: OneOffIncome[],
  receipts: IncomeReceipt[],
  today: ISODate,
  delays: IncomeDelay[] = [],
): IncomeOccurrence[] {
  const received = new Set(receipts.map((r) => r.occurrenceKey));
  const fromMonth = addMonths(monthOf(today), -1);
  const toMonth = addMonths(monthOf(today), 2);
  const all = [
    ...regular.flatMap((i) => regularIncomeOccurrences(i, fromMonth, toMonth)),
    ...oneOff.map(oneOffOccurrence),
  ];
  return all
    .filter((o) => !received.has(o.key))
    .map((o) => {
      const until = delays.find((d) => d.occurrenceKey === o.key)?.until;
      return until && until > o.late ? { ...o, late: until } : o;
    });
}

/**
 * Ожидаемые доходы, которые ещё могут прийти: без выплат до начала пользования (они уже
 * в остатке, 3.25) и без пропущенных выплат старше последней подтверждённой того же дохода.
 */
export function openIncomes(data: FinanceData, today: ISODate): IncomeOccurrence[] {
  const lastReceived = new Map<string, ISODate>();
  for (const r of data.receipts) {
    if (r.occurrenceKey.startsWith('oneoff:')) continue;
    const incomeId = r.occurrenceKey.split(':')[0];
    const prev = lastReceived.get(incomeId);
    if (!prev || r.date > prev) lastReceived.set(incomeId, r.date);
  }
  return expectedIncomes(data.regularIncomes, data.oneOffIncomes, data.receipts, today, data.incomeDelays)
    .filter((o) => o.late >= data.startedOn)
    .filter((o) => {
      if (o.key.startsWith('oneoff:')) return true;
      const last = lastReceived.get(o.key.split(':')[0]);
      return !last || o.late > last;
    });
}

export function paymentAmountFor(payment: FixedPayment, month: ISOMonth): Kopecks | null {
  let current: Kopecks | null = null;
  for (const a of [...payment.amounts].sort((x, y) => x.fromMonth.localeCompare(y.fromMonth))) {
    if (a.fromMonth <= month) current = a.amount;
  }
  return current;
}

/**
 * Все платежи с датой в промежутке [from, to] включительно.
 * Непрошедший платёж (3.26) переносится на новую дату, ключ остаётся прежним.
 */
export function paymentOccurrences(
  payments: FixedPayment[],
  from: ISODate,
  to: ISODate,
  delays: PaymentDelay[] = [],
): PaymentOccurrence[] {
  if (to < from) return [];
  const out: PaymentOccurrence[] = [];
  // Перенесённый платёж мог быть назначен раньше from — смотрим на два месяца назад.
  const firstMonth = delays.length ? addMonths(monthOf(from), -2) : monthOf(from);
  for (const p of payments) {
    for (const month of monthsBetween(firstMonth, monthOf(to))) {
      const amount = paymentAmountFor(p, month);
      if (amount === null) continue;
      const dates: [string, ISODate][] = p.repeat
        ? weeklyDates(p.repeat, month).map((d) => [`${p.id}:${d}`, d])
        : [[`${p.id}:${month}`, dateInMonth(month, p.day)]];
      for (const [key, planned] of dates) {
        const until = delays.find((x) => x.occurrenceKey === key)?.until;
        const date = until && until > planned ? until : planned;
        if (date < from || date > to) continue;
        out.push({ key, paymentId: p.id, name: p.name, date, amount });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Платежи пользователя с учётом переносов. */
export function dataPayments(data: FinanceData, from: ISODate, to: ISODate): PaymentOccurrence[] {
  return paymentOccurrences(data.payments, from, to, data.paymentDelays);
}
