// «Обычный месяц» (3.26): сколько в среднем приходит и уходит за месяц по регулярным данным.
// Нужен, чтобы отличить основной доход от дополнительного, оценить сроки накопления
// и честно сказать, если расходы больше доходов.
import { mainAccount, transportCovered } from './balance';
import { CONFIG } from './config';
import { addDays, monthOf, type ISODate } from './dates';
import { ZERO, max, percentOf, sub, sum, type Kopecks } from './money';
import { paymentAmountFor } from './schedule';
import type { FinanceData, FixedPayment, IncomeSchedule, RegularIncome } from './types';

const MONTH = CONFIG.purchase.monthDays;

/** Промежуток между выплатами, дней. */
export function intervalDays(schedule: IncomeSchedule | NonNullable<FixedPayment['repeat']>): number {
  switch (schedule.type) {
    case 'days':
      return Math.max(1, Math.floor(MONTH / Math.max(1, schedule.days.length)));
    case 'window':
      return MONTH;
    case 'weekly':
      return 7;
    case 'biweekly':
      return 14;
  }
}

/** Регулярный доход за обычный месяц по нижней сумме. */
export function incomeMonthly(income: RegularIncome): Kopecks {
  return Math.floor((income.min * MONTH) / intervalDays(income.schedule)) as Kopecks;
}

export function paymentMonthly(p: FixedPayment, today: ISODate): Kopecks {
  const amount = paymentAmountFor(p, monthOf(today)) ?? p.amounts[0]?.amount ?? ZERO;
  return p.repeat ? (Math.floor((amount * MONTH) / intervalDays(p.repeat)) as Kopecks) : amount;
}

/** Обязательное за обычный месяц: платежи и транспорт. */
export function needMonthly(data: FinanceData, today: ISODate): Kopecks {
  return sum([...data.payments.map((p) => paymentMonthly(p, today)), data.settings.transportMonthly]);
}

/**
 * Основные доходы (3.26, п. 9): нижняя сумма покрывает обязательное за промежуток до следующей
 * такой выплаты. Только они служат горизонтом и начинают новый период. Если основных нет — все.
 */
export function majorIncomeIds(data: FinanceData, today: ISODate): Set<string> {
  const need = needMonthly(data, today);
  const major = data.regularIncomes.filter((i) => i.min * MONTH >= need * intervalDays(i.schedule));
  return new Set((major.length > 0 ? major : data.regularIncomes).map((i) => i.id));
}

export function regularIncomeMonthly(data: FinanceData): Kopecks {
  return sum(data.regularIncomes.map(incomeMonthly));
}

/** Сколько откладывается за обычный месяц: процент от того, что остаётся после обязательного. */
export function normalMonthlySaving(data: FinanceData, today: ISODate): Kopecks {
  const left = sub(regularIncomeMonthly(data), needMonthly(data, today));
  return left > 0 ? percentOf(left, data.settings.savePercent) : ZERO;
}

/** Траты с основного счёта за последние 30 дней (без покрытого резервом транспорта). */
export function spentLastMonth(data: FinanceData, today: ISODate): Kopecks {
  const main = mainAccount(data);
  if (!main) return ZERO;
  const covered = transportCovered(data);
  const from = addDays(today, -MONTH);
  return sum(
    data.expenses
      .filter((x) => x.accountId === main.id && x.date > from && x.date <= today)
      .map((x) => sub(x.amount, covered.get(x.id) ?? ZERO)),
  );
}

/**
 * На сколько в обычный месяц расходы больше доходов (3.26, п. 11): траты за 30 дней + платежи
 * + транспорт − регулярные доходы. null — регулярных доходов нет, сравнивать не с чем.
 */
export function monthlyDeficit(data: FinanceData, today: ISODate): Kopecks | null {
  if (data.regularIncomes.length === 0) return null;
  const out = sum([spentLastMonth(data, today), needMonthly(data, today)]);
  return max(ZERO, sub(out, regularIncomeMonthly(data)));
}
