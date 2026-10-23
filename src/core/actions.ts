// Действия пользователя: чистые функции «данные → новые данные».
import { currentBalance, mainAccount } from './balance';
import { CONFIG } from './config';
import { closeDay } from './days';
import { addDays, diffDays, type ISODate } from './dates';
import { allocateSetAside } from './goals';
import { computeLimit, type LimitOk } from './limit';
import type { Kopecks } from './money';
import { addTransfer } from './money-moves';
import { dataPayments, oneOffOccurrence, openIncomes, type IncomeOccurrence, type PaymentOccurrence } from './schedule';
import type { Expense, FinanceData } from './types';

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

/** Та же трата уже записана только что (3.26, п. 19): двое с одного телефона, двойное нажатие. */
export function recentDuplicate(data: FinanceData, e: ExpenseInput, now: number): Expense | null {
  const window = CONFIG.duplicateMinutes * 60_000;
  return (
    data.expenses.find(
      (x) =>
        x.amount === e.amount &&
        x.categoryId === e.categoryId &&
        x.accountId === e.accountId &&
        x.date === e.date &&
        now - x.createdAt >= 0 &&
        now - x.createdAt <= window,
    ) ?? null
  );
}

/**
 * Платёж под вопросом (3.26, п. 20): по данным Флюми денег на него в его день не хватало.
 * Спрашиваем только про платежи после записи остатка за последнюю неделю.
 */
export function paymentQuestion(data: FinanceData, today: ISODate): PaymentOccurrence | null {
  const main = mainAccount(data);
  if (!main) return null;
  const from = [addDays(today, -7), data.startedOn, addDays(main.asOf, 1)].sort().at(-1)!;
  const asked = new Set(data.paymentChecks ?? []);
  for (const p of dataPayments(data, from, today)) {
    if (asked.has(p.key)) continue;
    if (currentBalance(main, data, addDays(p.date, -1)) < p.amount) return p;
  }
  return null;
}

/** «Да, прошёл». */
export function confirmPaymentPaid(data: FinanceData, key: string): FinanceData {
  return { ...data, paymentChecks: [...(data.paymentChecks ?? []), key] };
}

/** «Нет»: платёж переносится на выбранную дату и остаётся в резерве. */
export function delayPayment(data: FinanceData, key: string, until: ISODate): FinanceData {
  const rest = (data.paymentDelays ?? []).filter((d) => d.occurrenceKey !== key);
  return { ...data, paymentDelays: [...rest, { occurrenceKey: key, until }] };
}

/** Куда переводить отложенное: по целям согласно очереди или на первый накопительный счёт. */
export function setAsideTransfers(
  data: FinanceData,
  limit: LimitOk,
  today: ISODate,
): { title: string; amount: Kopecks; toAccountId?: string }[] {
  if (limit.setAside <= 0) return [];
  const firstSavings = data.accounts.find((a) => a.kind === 'savings');
  return data.goals.length > 0
    ? allocateSetAside(data, limit.setAside, today)
        .filter((s) => s.amount > 0)
        .map((s) => ({ title: `Отложить на «${s.goal.name}»`, amount: s.amount, toAccountId: s.goal.accountId }))
    : [{ title: 'Отложить в накопления', amount: limit.setAside, toAccountId: firstSavings?.id }];
}

/** Напоминание перевести отложенное (3.26, п. 21): период идёт уже несколько дней, а оно не переведено. */
export function setAsideReminderDue(data: FinanceData, limit: LimitOk, today: ISODate): boolean {
  return (
    limit.setAside > 0 &&
    diffDays(limit.savePlan.periodStart, today) >= CONFIG.setAsideReminderDays &&
    setAsideTransfers(data, limit, today).every((r) => r.toAccountId)
  );
}

/** «Перевёл(а)»: все строки отложенного переведены. */
export function transferSetAside(data: FinanceData, limit: LimitOk, today: ISODate, now: number, newId: () => string): FinanceData {
  const main = mainAccount(data);
  if (!main) return data;
  return setAsideTransfers(data, limit, today).reduce(
    (d, row) => (row.toAccountId ? addTransfer(d, main.id, row.toAccountId, row.amount, 'setAside', today, newId(), now) : d),
    data,
  );
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
