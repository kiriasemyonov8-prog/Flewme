// Объяснение чисел (SPEC 3.14): из чего сложились лимит, «доступно» и нехватка.
// Одна разбивка для чата и экранов, поэтому числа везде совпадают. Только настоящие числа ядра.
import { currentBalance, spentTodayMain } from './balance';
import type { ISODate } from './dates';
import type { LimitOk } from './limit';
import { ZERO, max, sub, sum, type Kopecks } from './money';
import type { PurchaseResult, PurchaseSource } from './purchase';
import { savingsTotal } from './purchase';
import type { FinanceData } from './types';

export type LineKind = 'start' | 'minus' | 'plus' | 'total';

export interface ExplainLine {
  kind: LineKind;
  label: string;
  amount: Kopecks;
  /** Дата, к которой относится строка (платёж, остаток). */
  date?: ISODate;
}

/** Как из остатка основного счёта получился свободный остаток и лимит дня. */
export function explainLimit(data: FinanceData, limit: LimitOk): { lines: ExplainLine[]; days: number; dailyLimit: Kopecks } {
  const main = data.accounts.find((a) => a.kind === 'main')!;
  const lines: ExplainLine[] = [
    {
      kind: 'start',
      label: main.asOf === limit.today ? 'Основной счёт сейчас (без сегодняшних трат)' : 'Основной счёт на начало дня',
      amount: limit.startBalance,
      date: main.asOf,
    },
    ...limit.reservedPayments.map((p) => ({ kind: 'minus' as const, label: p.name, amount: p.amount, date: p.date })),
  ];
  if (limit.transportReserve > 0) {
    lines.push({ kind: 'minus', label: `Транспорт на ${limit.days} дн.`, amount: limit.transportReserve });
  }
  if (limit.setAside > 0) {
    lines.push({ kind: 'minus', label: `Отложить в накопления (${limit.savePlan.percent}%)`, amount: limit.setAside });
  }
  if (limit.saved > 0) {
    lines.push({ kind: 'minus', label: 'Сэкономлено, ещё не переведено', amount: limit.saved });
  }
  lines.push({
    kind: 'total',
    label: 'Свободно до дохода',
    amount: max(ZERO, sub(limit.free, limit.saved)),
    date: limit.horizon,
  });
  return { lines, days: limit.days, dailyLimit: limit.dailyLimit };
}

/** Из чего сложилась сумма «Доступно» в окне «Покупка». */
export function explainAvailable(
  data: FinanceData,
  limit: LimitOk,
  source: PurchaseSource,
  result: PurchaseResult,
  today: ISODate,
): ExplainLine[] {
  const lines: ExplainLine[] = [];
  const useMain = source.kind === 'main' || source.kind === 'all';
  const useSavings = source.kind === 'savings' || source.kind === 'all';
  if (useMain) lines.push({ kind: 'plus', label: 'Свободно на основном счёте', amount: max(ZERO, limit.free) });
  if (useSavings) lines.push({ kind: 'plus', label: 'Накопления', amount: savingsTotal(data, today) });
  for (const a of data.accounts) {
    if (a.kind !== 'other') continue;
    if (source.kind === 'all' || (source.kind === 'other' && source.accountId === a.id)) {
      lines.push({ kind: 'plus', label: a.name, amount: max(ZERO, currentBalance(a, data, today)) });
    }
  }
  lines.push({ kind: 'total', label: 'Доступно', amount: sum(lines.map((l) => l.amount)) });
  if (result.shortfall > 0) lines.push({ kind: 'minus', label: 'Не хватает', amount: result.shortfall });
  return lines;
}

/** Куда «делись» деньги основного счёта: что на нём занято, что потрачено сегодня, что свободно. */
export function explainMainAccount(data: FinanceData, limit: LimitOk, today: ISODate): ExplainLine[] {
  const lines = explainLimit(data, limit).lines;
  const spent = spentTodayMain(data, today);
  if (spent <= 0) return lines;
  const free = lines[lines.length - 1].amount;
  return [
    ...lines,
    { kind: 'minus', label: 'Потрачено сегодня', amount: spent },
    { kind: 'total', label: 'Осталось свободно', amount: max(ZERO, sub(free, spent)) },
  ];
}
