// Несколько целей (SPEC 3.17): у каждой свой накопительный счёт. Общий процент откладывания
// задаётся в профиле, а Флюми сам делит отложенное между целями по срокам:
// чем ближе срок, тем раньше цель получает свою долю; цели без срока — в конце очереди.
import { currentBalance } from './balance';
import { CONFIG } from './config';
import { diffDays, type ISODate } from './dates';
import { goalProgressPermille } from './goal';
import { ZERO, add, kop, max, min, percentOf, sub, type Kopecks } from './money';
import type { FinanceData, Goal } from './types';

const MONTH_DAYS = 30;

export function goalBalance(data: FinanceData, goal: Goal, today: ISODate): Kopecks {
  const acc = data.accounts.find((a) => a.id === goal.accountId);
  return acc ? max(ZERO, currentBalance(acc, data, today)) : ZERO;
}

export function goalProgress(data: FinanceData, goal: Goal, today: ISODate): number {
  return goalProgressPermille(goalBalance(data, goal, today), goal.target);
}

/** Очередь целей: по сроку от ближнего к дальнему, цели без срока — в конце в порядке добавления. */
export function goalsByPriority(goals: Goal[]): Goal[] {
  return goals
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      if (a.g.deadline && b.g.deadline) return a.g.deadline.localeCompare(b.g.deadline) || a.i - b.i;
      if (a.g.deadline) return -1;
      if (b.g.deadline) return 1;
      return a.i - b.i;
    })
    .map((x) => x.g);
}

export interface GoalShare {
  goal: Goal;
  amount: Kopecks;
}

/** Сколько цели со сроком нужно откладывать в месяц, чтобы успеть (вверх до рубля). */
export function monthlyNeed(data: FinanceData, goal: Goal, today: ISODate): Kopecks {
  const left = max(ZERO, sub(goal.target, goalBalance(data, goal, today)));
  if (!goal.deadline) return left;
  const months = Math.max(1, Math.ceil(diffDays(today, goal.deadline) / MONTH_DAYS));
  // Округляем вверх до рубля, чтобы переводить было удобно.
  return kop(Math.ceil(left / months / 100) * 100);
}

/**
 * Делит сумму откладывания между целями. Цель со сроком получает столько, сколько ей нужно
 * в этот период, чтобы успеть к сроку; что осталось — следующей по очереди. Цели без срока
 * забирают остаток по очереди и всегда получают не меньше своей доли (3.26, п. 16), чтобы
 * далёкая цель со сроком не забирала всё. Если все цели закрыты, остаток достаётся первой цели.
 */
export function allocateSetAside(data: FinanceData, total: Kopecks, today: ISODate): GoalShare[] {
  const queue = goalsByPriority(data.goals);
  const shares = queue.map((goal) => ({ goal, amount: ZERO }));
  const mixed = queue.some((g) => g.deadline) && queue.some((g) => !g.deadline);
  const reserve = mixed ? percentOf(total, CONFIG.goalsNoDeadlinePercent) : ZERO;
  let rest = sub(total, reserve);
  let reserveAdded = false;
  for (const share of shares) {
    // Доля целей без срока добавляется один раз — перед первой из них (они в конце очереди).
    if (!share.goal.deadline && !reserveAdded) {
      rest = add(rest, reserve);
      reserveAdded = true;
    }
    if (rest <= 0) continue;
    const give = min(rest, monthlyNeed(data, share.goal, today));
    share.amount = give;
    rest = sub(rest, give);
  }
  if (rest > 0 && shares.length > 0) shares[0].amount = kop(shares[0].amount + rest);
  return shares;
}

/** Цель со сроком не успевает даже со всем отложенным (3.26, п. 16): сколько нужно и сколько есть. */
export function goalBehind(
  data: FinanceData,
  goal: Goal,
  monthlySaving: Kopecks,
  today: ISODate,
): { need: Kopecks; saving: Kopecks } | null {
  if (!goal.deadline) return null;
  const need = monthlyNeed(data, goal, today);
  return need > monthlySaving ? { need, saving: monthlySaving } : null;
}

/** Сколько в месяц откладывается на эту цель (по сумме откладывания за период). */
export function monthlyForGoal(data: FinanceData, planAmount: Kopecks, goal: Goal, today: ISODate): Kopecks {
  return allocateSetAside(data, planAmount, today).find((s) => s.goal.id === goal.id)?.amount ?? ZERO;
}

export interface SavingsTake {
  accountId: string;
  goal?: Goal;
  take: Kopecks;
}

/**
 * Откуда брать деньги из накоплений на покупку: сначала со счетов без цели,
 * затем с целей в обратном порядке очереди (последние по важности — первыми).
 */
export function takeFromSavings(data: FinanceData, amount: Kopecks, today: ISODate): SavingsTake[] {
  const goalAccounts = new Set(data.goals.map((g) => g.accountId));
  const free = data.accounts.filter((a) => a.kind === 'savings' && !goalAccounts.has(a.id));
  const order: { accountId: string; goal?: Goal; balance: Kopecks }[] = [
    ...free.map((a) => ({ accountId: a.id, balance: max(ZERO, currentBalance(a, data, today)) })),
    ...goalsByPriority(data.goals)
      .reverse()
      .map((g) => ({ accountId: g.accountId, goal: g, balance: goalBalance(data, g, today) })),
  ];
  let rest = amount;
  const out: SavingsTake[] = [];
  for (const o of order) {
    if (rest <= 0) break;
    const take = min(rest, o.balance);
    if (take > 0) out.push({ accountId: o.accountId, goal: o.goal, take });
    rest = sub(rest, take);
  }
  return out;
}
