// Действия пользователя: чистые функции «данные → новые данные».
import { CONFIG } from './config';
import { closeDay } from './days';
import { addDays, diffDays, type ISODate } from './dates';
import { computeLimit } from './limit';
import type { Kopecks } from './money';
import { oneOffOccurrence, openIncomes, type IncomeOccurrence } from './schedule';
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

/** Удалить ошибочно записанную трату. */
export function removeExpense(data: FinanceData, id: string): FinanceData {
  return { ...data, expenses: data.expenses.filter((x) => x.id !== id) };
}

/**
 * Ожидаемые доходы, которые можно подтвердить кнопкой «Пришла»: от месяца назад до месяца вперёд.
 * Выплаты до начала пользования и пропущенные выплаты старше последней подтверждённой не предлагаются.
 */
export function incomesToConfirm(data: FinanceData, today: ISODate): IncomeOccurrence[] {
  const from = addDays(today, -31);
  const to = addDays(today, 31);
  return openIncomes(data, today)
    .filter((o) => o.late >= from && o.early <= to)
    .sort((a, b) => a.early.localeCompare(b.early));
}

/**
 * «Пришла»: фактическая сумма и дата ожидаемого дохода. Начинает новый период.
 * inBalance — деньги уже вошли в записанный остаток и второй раз не прибавляются (3.25).
 */
export function confirmIncome(
  data: FinanceData,
  occurrenceKey: string,
  amount: Kopecks,
  date: ISODate,
  id: string,
  now: number,
  inBalance = false,
): FinanceData {
  return {
    ...data,
    receipts: [
      ...data.receipts,
      { id, occurrenceKey, amount, date, createdAt: now, ...(inBalance ? { inBalance: true } : {}) },
    ],
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
  inBalance = false,
): FinanceData {
  const income = { id, name, amount, date };
  return confirmIncome(
    { ...data, oneOffIncomes: [...data.oneOffIncomes, income] },
    oneOffOccurrence(income).key,
    amount,
    date,
    `receipt-${id}`,
    now,
    inBalance,
  );
}

/** Подтверждение дохода с этой датой спросит «уже в остатке?»: остаток записан в тот же день (3.25). */
export function mayBeInBalance(data: FinanceData, date: ISODate): boolean {
  return data.accounts.some((a) => a.kind === 'main' && a.asOf === date);
}

/** Ожидаемый разовый доход в пределах 14 дней от даты: возможно, пришёл именно он (3.25). */
export function matchingOneOff(data: FinanceData, date: ISODate, today: ISODate): IncomeOccurrence | null {
  return (
    incomesToConfirm(data, today)
      .filter((o) => o.key.startsWith('oneoff:') && Math.abs(diffDays(o.late, date)) <= CONFIG.oneOffMatchDays)
      .sort((a, b) => Math.abs(diffDays(a.late, date)) - Math.abs(diffDays(b.late, date)))[0] ?? null
  );
}

/** Вопрос о доходе на главной (3.25): сегодня ждём или ожидаемый доход просрочен. */
export interface IncomePrompt {
  kind: 'today' | 'overdue';
  income: IncomeOccurrence;
  oneOff: boolean;
}

export function incomePrompt(data: FinanceData, today: ISODate): IncomePrompt | null {
  const open = incomesToConfirm(data, today);
  const overdue = open.find((o) => o.late < today);
  if (overdue) return { kind: 'overdue', income: overdue, oneOff: overdue.key.startsWith('oneoff:') };
  const due = open.find((o) => o.early <= today && today <= o.late);
  return due ? { kind: 'today', income: due, oneOff: due.key.startsWith('oneoff:') } : null;
}

/** «Задерживается»: регулярный доход ждём к новой дате; разовый — просто переносим. */
export function delayIncome(data: FinanceData, occurrenceKey: string, until: ISODate): FinanceData {
  if (occurrenceKey.startsWith('oneoff:')) {
    const id = occurrenceKey.slice('oneoff:'.length);
    return { ...data, oneOffIncomes: data.oneOffIncomes.map((i) => (i.id === id ? { ...i, date: until } : i)) };
  }
  const rest = (data.incomeDelays ?? []).filter((d) => d.occurrenceKey !== occurrenceKey);
  return { ...data, incomeDelays: [...rest, { occurrenceKey, until }] };
}

/** «Не придёт»: ожидаемый разовый доход удаляется. */
export function dropOneOff(data: FinanceData, occurrenceKey: string): FinanceData {
  const id = occurrenceKey.slice('oneoff:'.length);
  return { ...data, oneOffIncomes: data.oneOffIncomes.filter((i) => i.id !== id) };
}

/**
 * Закрыть день: лимит берётся тот, что действовал в этот день.
 * unsure — трат не записано и человек не помнит, тратил ли (3.25).
 */
export function closeDayAction(data: FinanceData, date: ISODate, unsure = false): FinanceData {
  if (data.closures.some((c) => c.date === date)) return data;
  const limit = computeLimit(data, date);
  const dayLimit = limit.status === 'ok' ? limit.dailyLimit : (0 as Kopecks);
  const closure = closeDay(data, date, dayLimit, data.settings.leftoverMode, unsure);
  return { ...data, closures: [...data.closures, closure] };
}
