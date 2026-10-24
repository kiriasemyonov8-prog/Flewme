// Анкета первого входа (SPEC 3.27): ответы → данные приложения. Только из ответов человека,
// ничего не придумываем: что пропущено, то остаётся пустым и добавляется потом в профиле.
import { monthOf, type ISODate } from './dates';
import type { Kopecks } from './money';
import { createGoal } from './money-moves';
import { addAccount, addPayment, emptyData, setProtectedCategories, updateSettings, upsertRegularIncome } from './profile';
import type { FinanceData, RegularIncome, WeeklyRepeat } from './types';

export interface PaymentAnswer {
  id: string;
  name: string;
  amount: Kopecks;
  /** День месяца для платежа раз в месяц. */
  day: number;
  repeat?: WeeklyRepeat;
}

export interface OnboardingAnswers {
  /** Остаток основного счёта. null — не указан (тогда лимита пока нет). */
  balance: Kopecks | null;
  /** Регулярные доходы; пусто — дохода нет или вопрос пропущен. */
  incomes: RegularIncome[];
  /** Без регулярного дохода: до какой даты должны хватить деньги. */
  stretchUntil?: ISODate;
  payments: PaymentAnswer[];
  transportMonthly: Kopecks;
  /** Сколько уже накоплено. */
  savings: Kopecks;
  goal?: { name: string; target: Kopecks; deadline?: ISODate };
  savePercent: number;
  protectedCategoryIds: string[];
}

export function emptyAnswers(): OnboardingAnswers {
  return {
    balance: null,
    incomes: [],
    payments: [],
    transportMonthly: 0 as Kopecks,
    savings: 0 as Kopecks,
    savePercent: 30,
    protectedCategoryIds: [],
  };
}

/** Готовые варианты обязательных платежей: одно нажатие — и остаётся указать сумму и день. */
export const PAYMENT_PRESETS = ['Квартира', 'Ипотека', 'Кредит', 'Коммуналка', 'Связь', 'Детский сад', 'Подписки'];

export function buildFromAnswers(a: OnboardingAnswers, today: ISODate, now: number): FinanceData {
  let d = emptyData(today);
  if (a.balance !== null) d = addAccount(d, 'main', a.balance, today, now, 'main');
  for (const income of a.incomes) d = upsertRegularIncome(d, income);
  if (a.incomes.length === 0 && a.stretchUntil) d = updateSettings(d, { stretchUntil: a.stretchUntil });
  for (const p of a.payments) d = addPayment(d, p.id, p.name, p.day, p.amount, monthOf(today), p.repeat);
  d = updateSettings(d, { transportMonthly: a.transportMonthly, savePercent: a.savePercent });
  // Накопления кладутся на счёт цели; без цели — на общий накопительный счёт.
  if (a.goal) {
    d = createGoal(d, { id: 'goal', name: a.goal.name, target: a.goal.target, deadline: a.goal.deadline }, a.savings, today, now);
  } else if (a.savings > 0) {
    d = addAccount(d, 'savings', a.savings, today, now, 'savings');
  }
  return setProtectedCategories(d, a.protectedCategoryIds);
}
