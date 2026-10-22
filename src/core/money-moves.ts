// Переводы между счетами и цели (SPEC, раздел 7). Приложение не подключено к банку:
// перевод записывается только после того, как человек сделал его по-настоящему.
import type { ISODate } from './dates';
import type { Kopecks } from './money';
import type { FinanceData, Goal, TransferPurpose } from './types';

export function addTransfer(
  data: FinanceData,
  fromAccountId: string,
  toAccountId: string,
  amount: Kopecks,
  purpose: TransferPurpose,
  date: ISODate,
  id: string,
  now: number,
): FinanceData {
  const next = {
    ...data,
    transfers: [...data.transfers, { id, fromAccountId, toAccountId, amount, purpose, date, createdAt: now }],
  };
  // «Взять из накоплений»: деньги распределяются по дням до дохода, поэтому
  // зафиксированный лимит режима «на счёт» сбрасывается и считается заново.
  return purpose === 'withdraw' ? { ...next, fixedLimit: undefined } : next;
}

export function upsertGoal(data: FinanceData, goal: Goal): FinanceData {
  const exists = data.goals.some((g) => g.id === goal.id);
  return { ...data, goals: exists ? data.goals.map((g) => (g.id === goal.id ? goal : g)) : [...data.goals, goal] };
}

export function removeGoal(data: FinanceData, id: string): FinanceData {
  return { ...data, goals: data.goals.filter((g) => g.id !== id) };
}
