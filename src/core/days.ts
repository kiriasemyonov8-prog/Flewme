// Закрытие дня, серия закрытых дней, устаревший остаток (SPEC, разделы 7, 9, 12).
import { mainAccount, spentTodayMain } from './balance';
import { CONFIG } from './config';
import { addDays, diffDays, type ISODate } from './dates';
import { ZERO, max, sub, sum, type Kopecks } from './money';
import type { DayClosure, FinanceData, LeftoverMode } from './types';

export function spentOnDayMain(data: FinanceData, date: ISODate): Kopecks {
  const main = mainAccount(data);
  if (!main) return ZERO;
  return sum(data.expenses.filter((x) => x.accountId === main.id && x.date === date).map((x) => x.amount));
}

/**
 * unsure — трат не записано, и человек не помнит, тратил ли (3.25): в «сэкономлено» ничего не идёт.
 * Транспорт в пределах месячной суммы «сэкономлено» не увеличивает и не уменьшает.
 */
export function closeDay(
  data: FinanceData,
  date: ISODate,
  limit: Kopecks,
  mode: LeftoverMode,
  unsure = false,
): DayClosure {
  const spent = spentOnDayMain(data, date);
  const fromLimit = spentTodayMain(data, date);
  return {
    date,
    spent,
    limit,
    saved: mode === 'account' && !unsure ? max(ZERO, sub(limit, fromLimit)) : ZERO,
    ...(unsure ? { unsure: true } : {}),
  };
}

export function isClosed(data: FinanceData, date: ISODate): boolean {
  return data.closures.some((c) => c.date === date);
}

/**
 * Незакрытые прошедшие дни начиная с firstDay (день начала пользования) до вчера.
 * Не больше limit дней, самые свежие.
 */
export function unclosedDays(data: FinanceData, firstDay: ISODate, today: ISODate, limit = 7): ISODate[] {
  const out: ISODate[] = [];
  for (let d = addDays(today, -1); d >= firstDay && out.length < limit; d = addDays(d, -1)) {
    if (!isClosed(data, d)) out.push(d);
  }
  return out;
}

/** Серия: подряд закрытые дни, заканчивая сегодня (если закрыт) или вчера. */
export function closedStreak(data: FinanceData, today: ISODate): number {
  let d = isClosed(data, today) ? today : addDays(today, -1);
  let streak = 0;
  while (isClosed(data, d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export function isBalanceStale(data: FinanceData, today: ISODate): boolean {
  const main = mainAccount(data);
  if (!main) return false;
  return diffDays(main.asOf, today) >= CONFIG.staleBalanceDays;
}
