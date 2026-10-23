// Дневной лимит (SPEC, раздел 8) и распределение остатка (раздел 9).
import { startOfDayBalance } from './balance';
import { CONFIG } from './config';
import { addDays, diffDays, type ISODate } from './dates';
import { ZERO, add, divFloor, max, min, mulInt, percentOf, sub, sum, type Kopecks } from './money';
import { majorIncomeIds } from './month';
import { dataPayments, openIncomes, type IncomeOccurrence, type PaymentOccurrence } from './schedule';
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
  /** День ожидания дохода: доход наступил, но «Пришла» ещё не нажата (3.25). */
  waiting: boolean;
  /** Обновлённые записи, которые нужно сохранить. */
  savePlan: SavePlan;
  fixedLimit?: FixedLimit;
  lastLimit?: { date: ISODate; limit: Kopecks };
}

export interface LimitNoData {
  status: 'noData';
  missing: MissingData[];
}

export type LimitResult = LimitOk | LimitNoData;

/** Ключ «дохода» для режима без регулярного дохода: деньги тянутся до выбранной даты (3.26). */
export const STRETCH_KEY = 'stretch';

/** Доход начинает новый период, если это основной регулярный доход (3.26, п. 9). */
function startsPeriod(data: FinanceData, occurrenceKey: string, major: Set<string>): boolean {
  if (data.regularIncomes.length === 0) return true; // без регулярного дохода период начинает любой доход
  if (occurrenceKey.startsWith('oneoff:')) return false;
  return major.has(occurrenceKey.split(':')[0]);
}

/** Период начинается с последнего подтверждённого основного дохода. */
export function currentPeriod(data: FinanceData, fallbackStart: ISODate, today: ISODate): { key: string; start: ISODate } {
  const major = majorIncomeIds(data, today);
  const latest = data.receipts
    .filter((r) => startsPeriod(data, r.occurrenceKey, major))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .at(-1);
  return latest ? { key: latest.id, start: latest.date } : { key: 'start', start: fallbackStart };
}

/**
 * Горизонт — ближайший ожидаемый основной регулярный доход (вариант А, SPEC 3.11, 3.26).
 * Разовый и дополнительный доход не сокращают число дней: их деньги добавляются, когда они
 * подтверждены «Пришла». Без регулярного дохода — дата «Дотянуть до» или 30 дней вперёд.
 * Не пришедший в срок доход ещё неделю остаётся горизонтом (3.25): Флюми спрашивает о нём.
 */
export function findHorizon(data: FinanceData, today: ISODate): IncomeOccurrence | null {
  if (data.regularIncomes.length === 0) {
    const until = data.settings.stretchUntil;
    const date = until && until > today ? until : addDays(today, CONFIG.stretchDays);
    return { key: STRETCH_KEY, name: 'Дотянуть до', early: date, late: date, min: ZERO, max: ZERO };
  }
  const major = majorIncomeIds(data, today);
  const overdueFrom = addDays(today, -CONFIG.overdueIncomeDays);
  return (
    openIncomes(data, today)
      .filter((o) => o.late >= overdueFrom && !o.key.startsWith('oneoff:') && major.has(o.key.split(':')[0]))
      .sort((a, b) => a.late.localeCompare(b.late))[0] ?? null
  );
}

/** Ближайший основной доход после ожидаемого: до него должны дотянуть деньги, если ожидаемый уже в остатке. */
function incomeAfter(data: FinanceData, income: IncomeOccurrence, today: ISODate): IncomeOccurrence | null {
  const major = majorIncomeIds(data, today);
  return (
    openIncomes(data, today)
      .filter((o) => o.late > income.late && o.key !== income.key && !o.key.startsWith('oneoff:') && major.has(o.key.split(':')[0]))
      .sort((a, b) => a.late.localeCompare(b.late))[0] ?? null
  );
}

function transferredSince(
  data: FinanceData,
  purpose: 'setAside' | 'saved',
  since: ISODate,
  today: ISODate,
): Kopecks {
  return sum(
    data.transfers
      .filter((t) => t.purpose === purpose && t.date >= since && t.date <= today)
      .map((t) => t.amount),
  );
}

/**
 * Сколько отложенного прошлого периода переносится в новый (3.25): то, что накануне нового
 * дохода ещё лежало отложенным на основном счёте. Если деньги к тому дню кончились,
 * отложенное фактически потрачено и не переносится.
 */
function carryOver(data: FinanceData, periodStart: ISODate): Kopecks {
  const before = addDays(periodStart, -1);
  const old = computeLimit({ ...data, receipts: data.receipts.filter((r) => r.date < periodStart) }, before);
  return old.status === 'ok' ? old.setAside : ZERO;
}

/**
 * «Сэкономлено» в режиме «на счёт» по порядку дат: закрытые дни добавляют, переводы в накопления
 * и расхождения при обновлении остатка (3.25) убавляют. Потраченное не предлагается перевести.
 */
function savedLeft(data: FinanceData, since: ISODate, today: ISODate): Kopecks {
  // В один день: сначала расхождение (оно про прошлые дни), потом перевод, потом закрытие дня.
  const events: [ISODate, number, Kopecks][] = [
    ...(data.balanceGaps ?? [])
      .filter((g) => g.date >= since && g.date <= today)
      .map((g): [ISODate, number, Kopecks] => [g.date, 0, -g.amount as Kopecks]),
    ...data.transfers
      .filter((t) => t.purpose === 'saved' && t.date >= since && t.date <= today)
      .map((t): [ISODate, number, Kopecks] => [t.date, 1, -t.amount as Kopecks]),
    ...data.closures
      .filter((c) => c.date >= since && c.date < today)
      .map((c): [ISODate, number, Kopecks] => [c.date, 2, c.saved]),
  ];
  events.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  let left = ZERO;
  for (const [, , delta] of events) left = max(ZERO, add(left, delta));
  return left;
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
  const reservedPayments = dataPayments(data, today, horizon).filter(
    (p) => !(p.date === today && paidToday.has(p.key)),
  );
  const transportReserve = mulInt(divFloor(data.settings.transportMonthly, CONFIG.transportBaseDays), days);
  const base = sub(sub(startBalance, sum(reservedPayments.map((p) => p.amount))), transportReserve);

  // Откладывание фиксируется в начале периода (вариант А). Считается заново, только если
  // начался новый период, изменился процент или доходы/платежи/транспорт, либо в день расчёта
  // (пока человек вводит и исправляет данные). Обычные траты и обновления остатка его не меняют.
  const period = currentPeriod(data, main.asOf, today);
  const percent = data.settings.savePercent;
  const basis = JSON.stringify([data.regularIncomes, data.oneOffIncomes, data.payments, data.settings.transportMonthly]);
  const kept = data.savePlan;
  // Переводы между своими счетами не меняют, сколько откладывать: «Взять из накоплений»
  // целиком идёт в лимит, а перевод в накопления не уменьшает план.
  const planStart = kept?.periodKey === period.key ? kept.periodStart : period.start;
  let netIntoMain = 0;
  for (const t of data.transfers) {
    if (t.date < planStart || t.date > today) continue;
    if (t.toAccountId === main.id) netIntoMain += t.amount;
    if (t.fromAccountId === main.id) netIntoMain -= t.amount;
  }
  const planBase = sub(base, netIntoMain as Kopecks);
  const samePeriod = kept?.periodKey === period.key;
  // Непереведённое откладывание прошлого периода переносится целиком (3.25); при проценте 0 — нет.
  const carried = percent === 0 ? ZERO : samePeriod ? (kept!.carried ?? ZERO) : kept ? carryOver(data, period.start) : ZERO;
  // Откладывается процент от пришедшего в периоде дохода, но не больше процента от Базы (3.26, п. 12):
  // нет дохода в периоде (старт посреди месяца) — откладывать не из чего.
  const periodIncome = sum(data.receipts.filter((r) => r.date >= planStart && r.date <= today).map((r) => r.amount));
  const fromIncome = (room: Kopecks) => (room > 0 && periodIncome > 0 ? percentOf(min(room, periodIncome), percent) : ZERO);
  let plan: SavePlan =
    kept && samePeriod && kept.percent === percent && kept.basis === basis && kept.createdOn !== today
      ? kept
      : {
          periodKey: period.key,
          periodStart: planStart,
          percent,
          amount: add(carried, fromIncome(sub(planBase, carried))),
          createdOn: samePeriod && kept!.basis === basis && kept!.percent === percent ? kept!.createdOn : today,
          basis,
          income: periodIncome,
          ...(carried > 0 ? { carried } : {}),
        };
  // Доход, пришедший внутри периода (разовый, дополнительный), добавляет процент от своей суммы.
  if (plan === kept && periodIncome > (kept.income ?? periodIncome)) {
    plan = { ...kept, amount: add(kept.amount, percentOf(sub(periodIncome, kept.income!), percent)), income: periodIncome };
  } else if (plan === kept && kept.income === undefined) {
    plan = { ...kept, income: periodIncome };
  }
  const setAsideLeft = max(ZERO, sub(plan.amount, transferredSince(data, 'setAside', plan.periodStart, today)));
  // Откладывание не опускает лимит дня ниже порога (3.26, п. 12): отложенным считается
  // не больше, чем База − порог × Дни.
  const setAside = min(setAsideLeft, max(ZERO, sub(base, mulInt(CONFIG.minDailyForSaving as Kopecks, days))));
  const free = sub(base, setAside);

  const saved = savedLeft(data, plan.periodStart, today);

  // День ожидания дохода (3.25): доход наступил, но не подтверждён. Деньги могли уже прийти
  // и войти в остаток, поэтому лимит остаётся последним обычным (не больше свободного).
  const waiting = income.early <= today;
  const waitingLimit = (available: Kopecks): Kopecks => {
    const last = data.lastLimit;
    if (last && last.date <= today && diffDays(last.date, today) <= CONFIG.lastLimitMaxAgeDays) {
      return min(last.limit, max(ZERO, available));
    }
    const next = incomeAfter(data, income, today);
    const spread = next ? Math.max(1, diffDays(today, next.late)) : days;
    return available > 0 ? divFloor(available, spread) : ZERO;
  };

  let dailyLimit: Kopecks;
  let fixedLimit: FixedLimit | undefined;
  if (data.settings.leftoverMode === 'otherDays') {
    dailyLimit = waiting ? waitingLimit(free) : free > 0 ? divFloor(free, days) : ZERO;
  } else {
    // «На счёт»: лимит фиксирован на период и может только снижаться.
    // После «Взять из накоплений» приложение сбрасывает fixedLimit, чтобы деньги распределились по дням.
    const available = sub(free, saved);
    const candidate = waiting ? waitingLimit(available) : available > 0 ? divFloor(available, days) : ZERO;
    // Доход внутри периода (разовый, дополнительный) тоже даёт лимиту вырасти: ключ учитывает его.
    const fixedKey = `${period.key}+${data.receipts.filter((r) => r.date >= period.start && r.date <= today).length}`;
    const prev = data.fixedLimit?.periodKey === fixedKey ? data.fixedLimit.limit : null;
    dailyLimit = prev === null ? candidate : min(prev, candidate);
    fixedLimit = { periodKey: fixedKey, limit: dailyLimit };
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
    waiting,
    savePlan: plan,
    fixedLimit,
    lastLimit: waiting ? data.lastLimit : { date: today, limit: dailyLimit },
  };
}
