// Остатки счетов и «остаток на начало дня» (SPEC, раздел 8, шаг 3).
import { CONFIG } from './config';
import { diffDays, type ISODate } from './dates';
import { ZERO, add, divFloor, mulInt, sub, sum, type Kopecks } from './money';
import { paymentOccurrences } from './schedule';
import type { Account, FinanceData } from './types';

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
    if (r.date <= today && isAfterSnapshot(main, r)) e = add(e, r.amount);
  }

  e = add(e, transfersNet(main, data, today));

  for (const x of data.expenses) {
    if (x.accountId !== main.id) continue;
    if (x.date < today && isAfterSnapshot(main, x)) e = sub(e, x.amount);
    // Сегодняшние траты, уже вошедшие в записанный сегодня остаток, возвращаем.
    if (x.date === today && main.asOf === today && !isAfterSnapshot(main, x)) e = add(e, x.amount);
  }

  e = sub(e, paymentsPaidSinceSnapshot(main, data, today));
  return sub(e, transportSpentSinceSnapshot(main, data, today));
}

/**
 * Транспорт — резервация без записи поездок: каждый прошедший день с даты остатка
 * считается израсходованным на транспорт, иначе резерв «освобождался» бы в лимит.
 */
function transportSpentSinceSnapshot(account: Account, data: FinanceData, today: ISODate): Kopecks {
  const days = Math.max(0, diffDays(account.asOf, today));
  return mulInt(divFloor(data.settings.transportMonthly, CONFIG.transportBaseDays), days);
}

/** Траты за сегодня с основного счёта (только они влияют на лимит и настроение). */
export function spentTodayMain(data: FinanceData, today: ISODate): Kopecks {
  const main = mainAccount(data);
  if (!main) return ZERO;
  return sum(data.expenses.filter((x) => x.accountId === main.id && x.date === today).map((x) => x.amount));
}

/** Текущая сумма на счёте с учётом всех записанных событий, включая сегодняшние траты. */
export function currentBalance(account: Account, data: FinanceData, today: ISODate): Kopecks {
  let b = add(account.amount, transfersNet(account, data, today));
  for (const x of data.expenses) {
    if (x.accountId === account.id && x.date <= today && isAfterSnapshot(account, x)) b = sub(b, x.amount);
  }
  if (account.kind === 'main') {
    for (const r of data.receipts) {
      if (r.date <= today && isAfterSnapshot(account, r)) b = add(b, r.amount);
    }
    b = sub(b, paymentsPaidSinceSnapshot(account, data, today));
    b = sub(b, transportSpentSinceSnapshot(account, data, today));
  }
  return b;
}
