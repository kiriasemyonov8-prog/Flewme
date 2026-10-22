// Действия пользователя: чистые функции «данные → новые данные».
import { closeDay } from './days';
import { addDays, type ISODate } from './dates';
import { computeLimit } from './limit';
import type { Kopecks } from './money';
import { expectedIncomes, oneOffOccurrence, type IncomeOccurrence } from './schedule';
import type { FinanceData } from './types';

export interface ExpenseInput {
  amount: Kopecks;
  accountId: string;
  categoryId: string;
  date: ISODate;
}

export function addExpense(data: FinanceData, e: ExpenseInput, id: string, now: number): FinanceData {
  return {
    ...data,
    lastCategoryId: e.categoryId,
    expenses: [...data.expenses, { id, ...e, createdAt: now }],
  };
}

/**
 * Ожидаемые доходы, которые можно подтвердить кнопкой «Пришла»: от месяца назад до месяца вперёд.
 * Пропущенные выплаты старше последней подтверждённой того же дохода не предлагаются.
 */
export function incomesToConfirm(data: FinanceData, today: ISODate): IncomeOccurrence[] {
  const from = addDays(today, -31);
  const to = addDays(today, 31);
  const lastReceived = new Map<string, ISODate>();
  for (const r of data.receipts) {
    const incomeId = r.occurrenceKey.split(':')[0];
    const prev = lastReceived.get(incomeId);
    if (!prev || r.date > prev) lastReceived.set(incomeId, r.date);
  }
  return expectedIncomes(data.regularIncomes, data.oneOffIncomes, data.receipts, today)
    .filter((o) => o.late >= from && o.early <= to)
    .filter((o) => {
      const last = lastReceived.get(o.key.split(':')[0]);
      return !last || o.late > last;
    })
    .sort((a, b) => a.early.localeCompare(b.early));
}

/** «Пришла»: фактическая сумма и дата ожидаемого дохода. Начинает новый период. */
export function confirmIncome(
  data: FinanceData,
  occurrenceKey: string,
  amount: Kopecks,
  date: ISODate,
  id: string,
  now: number,
): FinanceData {
  return {
    ...data,
    receipts: [...data.receipts, { id, occurrenceKey, amount, date, createdAt: now }],
  };
}

/** Разовый доход, который уже пришёл: записывается и сразу подтверждается. */
export function addReceivedOneOff(
  data: FinanceData,
  name: string,
  amount: Kopecks,
  date: ISODate,
  id: string,
  now: number,
): FinanceData {
  const income = { id, name, amount, date };
  return confirmIncome(
    { ...data, oneOffIncomes: [...data.oneOffIncomes, income] },
    oneOffOccurrence(income).key,
    amount,
    date,
    `receipt-${id}`,
    now,
  );
}

/** Закрыть день: лимит берётся тот, что действовал в этот день. */
export function closeDayAction(data: FinanceData, date: ISODate): FinanceData {
  if (data.closures.some((c) => c.date === date)) return data;
  const limit = computeLimit(data, date);
  const dayLimit = limit.status === 'ok' ? limit.dailyLimit : (0 as Kopecks);
  const closure = closeDay(data, date, dayLimit, data.settings.leftoverMode);
  return { ...data, closures: [...data.closures, closure] };
}
