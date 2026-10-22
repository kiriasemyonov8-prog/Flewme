// Окно «Покупка»: вердикт и рекомендации (SPEC, раздел 10). Всё считает код, не ИИ.
// Срок накопления недостающего считается выбранным пользователем способом (SPEC 3.9):
// «из отложенного» — тем, что откладывается в накопления за период (SavePlan.amount ≈ месяц);
// «урезать лимит» — долей дневного лимита (CONFIG.purchase.cutLimitPercent) каждый день.
import { currentBalance } from './balance';
import { CONFIG } from './config';
import { addDays, type ISODate } from './dates';
import { goalProgressPermille } from './goal';
import { goalBalance, monthlyForGoal, takeFromSavings } from './goals';
import type { LimitOk } from './limit';
import { ZERO, divFloor, max, min, mulInt, percentOf, sub, sum, type Kopecks } from './money';
import { paymentOccurrences } from './schedule';
import type { FinanceData, Goal } from './types';

export type PurchaseSource =
  | { kind: 'main' }
  | { kind: 'savings' }
  | { kind: 'all' }
  | { kind: 'other'; accountId: string };

export type SavingMethod = 'setAside' | 'cutLimit';

export type Verdict = 'yes' | 'compromise' | 'wait' | 'no' | 'unknown';

export type VerdictReason =
  | 'fits' // хватает, забирает не больше половины
  | 'takesMuch' // хватает, но забирает больше половины
  | 'canSaveSoon' // не хватает, но можно собрать за разумный срок
  | 'tooLongToSave' // не хватит и за разумный срок
  | 'breaksGoal' // сильно отодвигает цель
  | 'cannotEstimate'; // нечем копить или нет данных

export type Recommendation =
  | { type: 'waitIncome'; date: ISODate }
  | { type: 'saveDaily'; method: SavingMethod; perDay: Kopecks; readyDate: ISODate }
  | { type: 'fromSavings'; amount: Kopecks; impact?: GoalImpact }
  | { type: 'cheaper'; upTo: Kopecks };

export interface PurchaseResult {
  verdict: Verdict;
  reason: VerdictReason;
  price: Kopecks;
  available: Kopecks;
  /** Доля доступной суммы, которую забирает покупка, целые проценты (вниз). */
  sharePercent: number | null;
  /** Откуда списывается (порядок для «все счета»: свободно → другие счета → накопления). */
  split: { free: Kopecks; other: Kopecks; savings: Kopecks };
  /** Цена покупки для основного счёта: лимит до дохода. */
  limitAfter?: { from: Kopecks; to: Kopecks };
  /** Цена покупки для накоплений: первая затронутая цель — прогресс и сдвиг. */
  goalAfter?: GoalImpact;
  shortfall: Kopecks;
  readyDate: ISODate | null;
  recommendations: Recommendation[];
}

function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

/** Сколько дней копить сумму, если откладывать monthly за месяц. null — копить нечем. */
export function daysToSave(amount: Kopecks, monthly: Kopecks): number | null {
  if (amount <= 0) return 0;
  if (monthly <= 0) return null;
  return ceilDiv(amount * CONFIG.purchase.monthDays, monthly);
}

function otherAccountsTotal(data: FinanceData, today: ISODate): Kopecks {
  return sum(data.accounts.filter((a) => a.kind === 'other').map((a) => max(ZERO, currentBalance(a, data, today))));
}

/** Все накопления: сумма всех накопительных счетов (общих и счетов целей). */
export function savingsTotal(data: FinanceData, today: ISODate): Kopecks {
  return sum(data.accounts.filter((a) => a.kind === 'savings').map((a) => max(ZERO, currentBalance(a, data, today))));
}

export interface GoalImpact {
  goal: Goal;
  /** Прогресс в десятых процента до и после. */
  from: number;
  to: number;
  /** На сколько дней отодвинется цель при её доле откладывания; null — на неё сейчас ничего не откладывается. */
  delayDays: number | null;
}

/** Что будет с целями, если взять из накоплений эту сумму (сначала с последних по очереди). */
export function savingsImpact(data: FinanceData, limit: LimitOk, amount: Kopecks, today: ISODate): GoalImpact[] {
  return takeFromSavings(data, amount, today)
    .filter((t) => t.goal)
    .map((t) => {
      const goal = t.goal!;
      const balance = goalBalance(data, goal, today);
      return {
        goal,
        from: goalProgressPermille(balance, goal.target),
        to: goalProgressPermille(sub(balance, t.take), goal.target),
        delayDays: daysToSave(t.take, monthlyForGoal(data, limit.savePlan.amount, goal, today)),
      };
    });
}

/** Сколько можно накопить за месяц выбранным способом. */
export function savingCapacity(limit: LimitOk, method: SavingMethod): Kopecks {
  if (method === 'setAside') return limit.savePlan.amount;
  return mulInt(percentOf(limit.dailyLimit, CONFIG.purchase.cutLimitPercent), CONFIG.purchase.monthDays);
}

function takeInOrder(price: Kopecks, buckets: Kopecks[]): Kopecks[] {
  let rest = price;
  return buckets.map((b) => {
    const take = min(rest, max(ZERO, b));
    rest = sub(rest, take);
    return take;
  });
}

export function evaluatePurchase(
  data: FinanceData,
  limit: LimitOk,
  price: Kopecks,
  source: PurchaseSource,
  today: ISODate,
  method: SavingMethod = 'setAside',
): PurchaseResult {
  const cfg = CONFIG.purchase;
  const free = max(ZERO, limit.free);
  const savings = savingsTotal(data, today);
  const others = otherAccountsTotal(data, today);
  // Скорость накопления недостающего на покупку — выбранным способом.
  const capacity = savingCapacity(limit, method);

  let available: Kopecks;
  let buckets: { free: Kopecks; other: Kopecks; savings: Kopecks };
  switch (source.kind) {
    case 'main':
      available = free;
      buckets = { free, other: ZERO, savings: ZERO };
      break;
    case 'savings':
      available = savings;
      buckets = { free: ZERO, other: ZERO, savings };
      break;
    case 'all':
      available = sum([free, others, savings]);
      buckets = { free, other: others, savings };
      break;
    case 'other': {
      const acc = data.accounts.find((a) => a.id === source.accountId);
      available = acc ? max(ZERO, currentBalance(acc, data, today)) : ZERO;
      buckets = { free: ZERO, other: available, savings: ZERO };
      break;
    }
  }

  const [takeFree, takeOther, takeSavings] = takeInOrder(price, [buckets.free, buckets.other, buckets.savings]);
  const split = { free: takeFree, other: takeOther, savings: takeSavings };
  const shortfall = max(ZERO, sub(price, available));
  const sharePercent = available > 0 ? Math.floor((price * 100) / available) : null;

  const limitAfter =
    takeFree > 0
      ? { from: limit.dailyLimit, to: divFloor(max(ZERO, sub(limit.free, takeFree)), limit.days) }
      : undefined;
  const impacts = takeSavings > 0 ? savingsImpact(data, limit, takeSavings, today) : [];
  const goalAfter = impacts[0];

  let verdict: Verdict;
  let reason: VerdictReason;
  let readyDate: ISODate | null = null;

  if (shortfall === 0) {
    const breaksGoal = impacts.some(
      (i) => i.delayDays !== null && i.delayDays > cfg.goalBreakMonths * cfg.monthDays,
    );
    if (breaksGoal) {
      verdict = 'no';
      reason = 'breaksGoal';
    } else if (price * 100 <= available * cfg.comfortableSharePercent) {
      verdict = 'yes';
      reason = 'fits';
    } else {
      verdict = 'compromise';
      reason = 'takesMuch';
    }
  } else {
    const days = daysToSave(shortfall, capacity);
    if (days === null) {
      verdict = 'unknown';
      reason = 'cannotEstimate';
    } else {
      readyDate = addDays(today, days);
      if (days <= cfg.waitMonths * cfg.monthDays) {
        verdict = 'wait';
        reason = 'canSaveSoon';
      } else {
        verdict = 'no';
        reason = 'tooLongToSave';
      }
    }
  }

  const recommendations: Recommendation[] = [];

  // 1. Дождаться дохода: оценка свободных денег следующего периода по нижней границе дохода.
  if (source.kind === 'main' && verdict !== 'yes') {
    const nextPayments = sum(
      paymentOccurrences(data.payments, addDays(limit.horizon, 1), addDays(limit.horizon, cfg.monthDays)).map(
        (p) => p.amount,
      ),
    );
    const nextBase = sub(sub(limit.horizonIncome.min, nextPayments), data.settings.transportMonthly);
    const nextFree = sub(nextBase, nextBase > 0 ? percentOf(nextBase, data.settings.savePercent) : ZERO);
    if (nextFree > 0 && price * 100 <= nextFree * cfg.comfortableSharePercent) {
      recommendations.push({ type: 'waitIncome', date: limit.horizon });
    }
  }

  // 2. Откладывать X ₽ в день выбранным способом — покупка станет возможной к дате.
  if (shortfall > 0 && readyDate) {
    recommendations.push({
      type: 'saveDaily',
      method,
      perDay: divFloor(capacity, cfg.monthDays),
      readyDate,
    });
  }

  // 3. Взять недостающее из накоплений ценой сдвига цели.
  if ((source.kind === 'main' || source.kind === 'other') && shortfall > 0 && savings >= shortfall) {
    recommendations.push({
      type: 'fromSavings',
      amount: shortfall,
      impact: savingsImpact(data, limit, shortfall, today)[0],
    });
  }

  // 4. Покупка, которая укладывается сейчас без компромисса.
  if (verdict !== 'yes') {
    const upTo = percentOf(available, cfg.comfortableSharePercent);
    if (upTo > 0) recommendations.push({ type: 'cheaper', upTo });
  }

  return {
    verdict,
    reason,
    price,
    available,
    sharePercent,
    split,
    limitAfter,
    goalAfter,
    shortfall,
    readyDate,
    recommendations,
  };
}

/** «Взять из накоплений» со счёта цели: что будет с лимитом и с этой целью (SPEC, раздел 7). */
export function previewWithdrawal(
  data: FinanceData,
  limit: LimitOk,
  goal: Goal,
  amount: Kopecks,
  today: ISODate,
): { limitFrom: Kopecks; limitTo: Kopecks; goalDelayDays: number | null; progressFrom: number; progressTo: number } {
  const balance = goalBalance(data, goal, today);
  const take = min(amount, balance);
  return {
    limitFrom: limit.dailyLimit,
    limitTo: divFloor(max(ZERO, sum([limit.free, take])), limit.days),
    goalDelayDays: daysToSave(take, monthlyForGoal(data, limit.savePlan.amount, goal, today)),
    progressFrom: goalProgressPermille(balance, goal.target),
    progressTo: goalProgressPermille(sub(balance, take), goal.target),
  };
}
