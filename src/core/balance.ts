// Остатки счетов и «остаток на начало дня» (SPEC, раздел 8, шаг 3).
import { CONFIG } from './config';
import { diffDays, type ISODate } from './dates';
import { ZERO, add, divFloor, max, min, mulInt, sub, sum, type Kopecks } from './money';
import { paymentOccurrences } from './schedule';
import type { Account, Expense, FinanceData } from './types';

interface Dated {
  date: ISODate;
  createdAt: number;
}

/**
 * Событие случилось после записи остатка счёта и ещё не вошло в его сумму:
 * дата позже asOf, или тот же день, но записано позже остатка.
 */
export function isAfterSnapshot(account: Account, e: Dated): boolean {
  return e.date > account.asOf || (e.date === account.asOf && e.createdAt > account.asOfTs);
}

export function mainAccount(data: FinanceData): Account | undefined {
  return data.accounts.find((a) => a.kind === 'main');
}

export function savingsAccount(data: FinanceData): Account | undefined {
  return data.accounts.find((a) => a.kind === 'savings');
}

/** Платежи, уже наступившие после записи остатка и до сегодняшнего дня (не включая сегодня). */
function paymentsPaidSinceSnapshot(account: Account, data: FinanceData, today: ISODate): Kopecks {
  const paidOnAsOf = new Set(account.paidOnAsOf ?? []);
  const occ = paymentOccurrences(data.payments, account.asOf, today).filter(
    (p) => p.date < today && !(p.date === account.asOf && paidOnAsOf.has(p.key)),
  );
  return sum(occ.map((p) => p.amount));
}

function transfersNet(account: Account, data: FinanceData, today: ISODate): Kopecks {
  let net = ZERO;
  for (const t of data.transfers) {
    if (t.date > today || !isAfterSnapshot(account, t)) continue;
    if (t.toAccountId === account.id) net = add(net, t.amount);
    if (t.fromAccountId === account.id) net = sub(net, t.amount);
  }
  return net;
}

export const TRANSPORT_ID = 'transport';

/**
 * Сколько из каждой траты «Транспорт» с основного счёта покрыто месячной суммой транспорта (3.25).
 * Резерв уже вычитается по дням, поэтому покрытая часть второй раз не вычитается.
 * Считается по календарному месяцу в порядке записи; что сверх месячной суммы — обычная трата.
 */
export function transportCovered(data: FinanceData): Map<string, Kopecks> {
  const out = new Map<string, Kopecks>();
  const monthly = data.settings.transportMonthly;
  const main = mainAccount(data);
  if (monthly <= 0 || !main) return out;
  const used = new Map<string, Kopecks>();
  const trips = data.expenses
    .filter((x) => x.accountId === main.id && x.categoryId === TRANSPORT_ID)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const x of trips) {
    const month = x.date.slice(0, 7);
    const before = used.get(month) ?? ZERO;
    const covered = max(ZERO, min(x.amount, sub(monthly, before)));
    used.set(month, add(before, x.amount));
    out.set(x.id, covered);
  }
  return out;
}

/** Часть траты, которая уменьшает свободные деньги (без покрытого резервом транспорта). */
function limitPart(x: Expense, covered: Map<string, Kopecks>): Kopecks {
  return sub(x.amount, covered.get(x.id) ?? ZERO);
}

/** Сколько в этом месяце транспорт вышел дороже месячной суммы (по записанным тратам). */
export function transportOverMonth(data: FinanceData, today: ISODate): Kopecks {
  const covered = transportCovered(data);
  const month = today.slice(0, 7);
  return sum(
    data.expenses
      .filter((x) => covered.has(x.id) && x.date.slice(0, 7) === month && x.date <= today)
      .map((x) => limitPart(x, covered)),
  );
}

/**
 * Остаток основного счёта на начало дня today (E_start).
 * Траты за сегодня сюда не входят никогда: если остаток записан сегодня
 * уже после каких-то сегодняшних трат, они «возвращаются» в расчёт.
 */
export function startOfDayBalance(data: FinanceData, today: ISODate): Kopecks | null {
  const main = mainAccount(data);
  if (!main) return null;

  let e = main.amount;

  for (const r of data.receipts) {
    if (!r.inBalance && r.date <= today && isAfterSnapshot(main, r)) e = add(e, r.amount);
  }

  e = add(e, transfersNet(main, data, today));

  const covered = transportCovered(data);
  for (const x of data.expenses) {
    if (x.accountId !== main.id) continue;
    if (x.date < today && isAfterSnapshot(main, x)) e = sub(e, limitPart(x, covered));
    // Сегодняшние траты, уже вошедшие в записанный сегодня остаток, возвращаем.
    if (x.date === today && main.asOf === today && !isAfterSnapshot(main, x)) e = add(e, x.amount);
  }

  e = sub(e, paymentsPaidSinceSnapshot(main, data, today));
  return sub(e, transportSpentSinceSnapshot(main, data, today, covered, false));
}

/**
 * Транспорт — резервация без записи поездок: каждый прошедший день с даты остатка
 * считается израсходованным на транспорт, иначе резерв «освобождался» бы в лимит.
 * Если записанные поездки из резерва за это время дороже (заправка разом), вычитаются они (3.25):
 * деньги уже ушли, и остаток не должен выглядеть больше настоящего.
 */
function transportSpentSinceSnapshot(
  account: Account,
  data: FinanceData,
  today: ISODate,
  covered: Map<string, Kopecks>,
  withToday: boolean,
): Kopecks {
  const days = Math.max(0, diffDays(account.asOf, today));
  const reserved = mulInt(divFloor(data.settings.transportMonthly, CONFIG.transportBaseDays), days);
  const trips = sum(
    data.expenses
      .filter((x) => covered.has(x.id) && (withToday ? x.date <= today : x.date < today) && isAfterSnapshot(account, x))
      .map((x) => covered.get(x.id)!),
  );
  return max(reserved, trips);
}

/**
 * Траты дня с основного счёта, которые идут из лимита (влияют на лимит и настроение).
 * Транспорт в пределах месячной суммы идёт из резерва и сюда не входит.
 */
export function spentTodayMain(data: FinanceData, today: ISODate): Kopecks {
  const main = mainAccount(data);
  if (!main) return ZERO;
  const covered = transportCovered(data);
  return sum(
    data.expenses.filter((x) => x.accountId === main.id && x.date === today).map((x) => limitPart(x, covered)),
  );
}

/** Текущая сумма на счёте с учётом всех записанных событий, включая сегодняшние траты. */
export function currentBalance(account: Account, data: FinanceData, today: ISODate): Kopecks {
  let b = add(account.amount, transfersNet(account, data, today));
  const covered = account.kind === 'main' ? transportCovered(data) : new Map<string, Kopecks>();
  for (const x of data.expenses) {
    if (x.accountId === account.id && x.date <= today && isAfterSnapshot(account, x)) b = sub(b, limitPart(x, covered));
  }
  if (account.kind === 'main') {
    for (const r of data.receipts) {
      if (!r.inBalance && r.date <= today && isAfterSnapshot(account, r)) b = add(b, r.amount);
    }
    b = sub(b, paymentsPaidSinceSnapshot(account, data, today));
    b = sub(b, transportSpentSinceSnapshot(account, data, today, covered, true));
  }
  return b;
}
