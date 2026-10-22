// Дневной лимит (SPEC, раздел 8) и распределение остатка (раздел 9).
import { startOfDayBalance } from './balance';
import { CONFIG } from './config';
import { diffDays, type ISODate } from './dates';
import { ZERO, divFloor, max, min, mulInt, percentOf, sub, sum, type Kopecks } from './money';
import { expectedIncomes, paymentOccurrences, type IncomeOccurrence, type PaymentOccurrence } from './schedule';
import type { FinanceData, FixedLimit, SavePlan } from './types';

export type MissingData = 'mainBalance' | 'income';

export interface LimitOk {
  status: 'ok';
  today: ISODate;
  /** Дата ближайшего дохода, до которой считается лимит (поздняя дата окна). */
  horizon: ISODate;
  horizonIncome: IncomeOccurrence;
  /** Дни = max(1, H − T). */
  days: number;
  /** Для экрана: от ранней до поздней даты окна («20–30 дней»). */
  daysRange: { min: number; max: number };
  startBalance: Kopecks;
  reservedPayments: PaymentOccurrence[];
  transportReserve: Kopecks;
  base: Kopecks;
  /** Ещё не переведённая в накопления откладываемая часть. */
  setAside: Kopecks;
  /** Свободно до дохода R = База − откладываемая часть. */
  free: Kopecks;
  /** Сэкономлено в режиме «на счёт» и ещё не переведено. */
  saved: Kopecks;
  dailyLimit: Kopecks;
  /** R ≤ 0: свободных денег до дохода нет. */
  noFreeMoney: boolean;
  /** Обновлённые записи, которые нужно сохранить. */
  savePlan: SavePlan;
  fixedLimit?: FixedLimit;
}

export interface LimitNoData {
  status: 'noData';
  missing: MissingData[];
}

export type LimitResult = LimitOk | LimitNoData;

/** Период начинается с последнего подтверждённого дохода. */
export function currentPeriod(data: FinanceData, fallbackStart: ISODate): { key: string; start: ISODate } {
  const latest = [...data.receipts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  ).at(-1);
  return latest ? { key: latest.id, start: latest.date } : { key: 'start', start: fallbackStart };
}

/**
 * Горизонт — ближайший ожидаемый регулярный доход (вариант А, SPEC 3.11). Разовый доход
 * не сокращает число дней: его деньги добавляются, когда он подтверждён «Пришла».
 * Только если регулярных доходов нет совсем, горизонтом служит ближайший разовый.
 */
export function findHorizon(data: FinanceData, today: ISODate): IncomeOccurrence | null {
  const upcoming = expectedIncomes(data.regularIncomes, data.oneOffIncomes, data.receipts, today)
    .filter((o) => o.late >= today)
    .sort((a, b) => a.late.localeCompare(b.late));
  const regular = upcoming.filter((o) => !o.key.startsWith('oneoff:'));
  return (data.regularIncomes.length > 0 ? regular[0] : upcoming[0]) ?? null;
}

function transferredSince(data: FinanceData, purpose: 'setAside' | 'saved', since: ISODate, today: ISODate): Kopecks {
  return sum(
    data.transfers
      .filter((t) => t.purpose === purpose && t.date >= since && t.date <= today)
      .map((t) => t.amount),
  );
}

/**
 * Сколько ещё можно потратить сегодня: лимит дня минус траты за сегодня с основного счёта.
 * Сам лимит дня от трат не меняется (по нему считается настроение робота).
 */
export function remainingToday(dailyLimit: Kopecks, spentToday: Kopecks): { left: Kopecks; over: Kopecks } {
  const diff = sub(dailyLimit, spentToday);
  return diff >= 0 ? { left: diff, over: ZERO } : { left: ZERO, over: sub(spentToday, dailyLimit) };
}

export function computeLimit(data: FinanceData, today: ISODate): LimitResult {
  const missing: MissingData[] = [];
  const startBalance = startOfDayBalance(data, today);
  if (startBalance === null) missing.push('mainBalance');
  const income = findHorizon(data, today);
  if (!income) missing.push('income');
  if (startBalance === null || !income) return { status: 'noData', missing };

  const horizon = income.late;
  const days = Math.max(1, diffDays(today, horizon));
  const daysRange = {
    min: Math.max(0, diffDays(today, income.early)),
    max: Math.max(0, diffDays(today, income.late)),
  };

  // Обязательные платежи от сегодня до дня дохода включительно (консервативно).
  const main = data.accounts.find((a) => a.kind === 'main')!;
  const paidToday = new Set(main.asOf === today ? (main.paidOnAsOf ?? []) : []);
  const reservedPayments = paymentOccurrences(data.payments, today, horizon).filter(
    (p) => !(p.date === today && paidToday.has(p.key)),
  );
  const transportReserve = mulInt(divFloor(data.settings.transportMonthly, CONFIG.transportBaseDays), days);
  const base = sub(sub(startBalance, sum(reservedPayments.map((p) => p.amount))), transportReserve);

  // Откладывание фиксируется в начале периода (вариант А). Считается заново, только если
  // начался новый период, изменился процент или доходы/платежи/транспорт, либо в день расчёта
  // (пока человек вводит и исправляет данные). Обычные траты и обновления остатка его не меняют.
  const period = currentPeriod(data, main.asOf);
  const percent = data.settings.savePercent;
  const basis = JSON.stringify([data.regularIncomes, data.oneOffIncomes, data.payments, data.settings.transportMonthly]);
  const kept = data.savePlan;
  const plan: SavePlan =
    kept &&
    kept.periodKey === period.key &&
    kept.percent === percent &&
    kept.basis === basis &&
    kept.createdOn !== today
      ? kept
      : {
          periodKey: period.key,
          periodStart: kept?.periodKey === period.key ? kept.periodStart : period.start,
          percent,
          amount: base > 0 ? percentOf(base, percent) : ZERO,
          createdOn: kept?.periodKey === period.key && kept.basis === basis && kept.percent === percent ? kept.createdOn : today,
          basis,
        };
  const setAsideLeft = max(ZERO, sub(plan.amount, transferredSince(data, 'setAside', plan.periodStart, today)));
  const setAside = min(setAsideLeft, max(ZERO, base));
  const free = sub(base, setAside);

  const savedTotal = sum(
    data.closures.filter((c) => c.date >= plan.periodStart && c.date < today).map((c) => c.saved),
  );
  const saved = max(ZERO, sub(savedTotal, transferredSince(data, 'saved', plan.periodStart, today)));

  let dailyLimit: Kopecks;
  let fixedLimit: FixedLimit | undefined;
  if (data.settings.leftoverMode === 'otherDays') {
    dailyLimit = free > 0 ? divFloor(free, days) : ZERO;
  } else {
    // «На счёт»: лимит фиксирован на период и может только снижаться.
    // После «Взять из накоплений» приложение сбрасывает fixedLimit, чтобы деньги распределились по дням.
    const available = sub(free, saved);
    const candidate = available > 0 ? divFloor(available, days) : ZERO;
    const prev = data.fixedLimit?.periodKey === period.key ? data.fixedLimit.limit : null;
    dailyLimit = prev === null ? candidate : min(prev, candidate);
    fixedLimit = { periodKey: period.key, limit: dailyLimit };
  }

  return {
    status: 'ok',
    today,
    horizon,
    horizonIncome: income,
    days,
    daysRange,
    startBalance,
    reservedPayments,
    transportReserve,
    base,
    setAside,
    free,
    saved,
    dailyLimit,
    noFreeMoney: free <= 0,
    savePlan: plan,
    fixedLimit,
  };
}
