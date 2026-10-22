// Сводки для раздела «Финансы и цели»: траты по категориям, фактические и ожидаемые доходы.
import { addMonths, dateInMonth, monthOf, type ISODate, type ISOMonth } from './dates';
import { sum, type Kopecks } from './money';
import { expectedIncomes, type IncomeOccurrence } from './schedule';
import type { Expense, FinanceData, IncomeReceipt } from './types';

export interface CategoryTotal {
  categoryId: string;
  total: Kopecks;
}

/** Траты за календарный месяц (все счета), по категориям, от больших к меньшим. */
export function monthExpenses(data: FinanceData, month: ISOMonth): { total: Kopecks; byCategory: CategoryTotal[]; items: Expense[] } {
  const from = dateInMonth(month, 1);
  const to = dateInMonth(addMonths(month, 1), 1);
  const items = data.expenses
    .filter((x) => x.date >= from && x.date < to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const map = new Map<string, number>();
  for (const x of items) map.set(x.categoryId, (map.get(x.categoryId) ?? 0) + x.amount);
  const byCategory = [...map.entries()]
    .map(([categoryId, total]) => ({ categoryId, total: total as Kopecks }))
    .sort((a, b) => b.total - a.total);
  return { total: sum(items.map((x) => x.amount)), byCategory, items };
}

/** Подтверждённые поступления, новые сверху. */
export function receivedIncomes(data: FinanceData): IncomeReceipt[] {
  return [...data.receipts].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** Ожидаемые доходы на ближайшие два месяца (ещё не подтверждённые). */
export function upcomingIncomes(data: FinanceData, today: ISODate): IncomeOccurrence[] {
  const until = dateInMonth(addMonths(monthOf(today), 3), 1);
  return expectedIncomes(data.regularIncomes, data.oneOffIncomes, data.receipts, today)
    .filter((o) => o.late >= today && o.early < until)
    .sort((a, b) => a.late.localeCompare(b.late));
}

/** Имя дохода по ключу поступления. */
export function incomeName(data: FinanceData, occurrenceKey: string): string {
  if (occurrenceKey.startsWith('oneoff:')) {
    return data.oneOffIncomes.find((i) => `oneoff:${i.id}` === occurrenceKey)?.name ?? 'Разовый доход';
  }
  const id = occurrenceKey.split(':')[0];
  return data.regularIncomes.find((i) => i.id === id)?.name ?? 'Доход';
}
