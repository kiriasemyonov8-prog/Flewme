// Демо-набор автора (SPEC, раздел 14). Все даты считаются от сегодняшнего дня.
import { addDays, addMonths, dateInMonth, dayOfMonth, monthOf, type ISODate } from './dates';
import { rub } from './money';
import type { Expense, FinanceData, Goal } from './types';

const SALARY_ID = 'salary';
const SALARY_FROM = 10;
const SALARY_TO = 20;

const DEMO_EXPENSES: [offset: number, note: string, categoryId: string, rubles: number][] = [
  [-1, 'Продукты', 'food', 2340],
  [-2, 'Кофе и обед', 'food', 780],
  [-3, 'Подписка на сервис', 'fun', 599],
  [-4, 'Аптека', 'health', 1120],
  [-5, 'Продукты', 'food', 1850],
  [-6, 'Кафе с друзьями', 'food', 2100],
  [-7, 'Такси', 'transport', 640],
  [-9, 'Одежда', 'shopping', 4500],
];

export const DEMO_GOAL: Goal = { id: 'goal', name: 'Цель', target: rub(1_000_000) };

export function demoData(today: ISODate, nowTs: number): FinanceData {
  // Зарплата текущего окна считается полученной и уже входит в остаток.
  // Если окно этого месяца ещё не началось, полученной считается прошлая.
  const salaryMonth = dayOfMonth(today) >= SALARY_FROM ? monthOf(today) : addMonths(monthOf(today), -1);
  const salaryLate = dateInMonth(salaryMonth, SALARY_TO);
  const received = salaryLate < today ? salaryLate : today;

  const expenses: Expense[] = DEMO_EXPENSES.map(([offset, note, categoryId, rubles], i) => ({
    id: `demo-exp-${i}`,
    amount: rub(rubles),
    accountId: 'main',
    categoryId,
    date: addDays(today, offset),
    createdAt: 0,
    note,
    demo: true,
  }));

  return {
    accounts: [
      { id: 'main', kind: 'main', name: 'Основной счёт', amount: rub(100_000), asOf: today, asOfTs: nowTs },
      { id: 'savings', kind: 'savings', name: 'Накопления', amount: rub(100_000), asOf: today, asOfTs: nowTs },
    ],
    regularIncomes: [
      {
        id: SALARY_ID,
        name: 'Зарплата',
        min: rub(120_000),
        max: rub(150_000),
        schedule: { type: 'window', fromDay: SALARY_FROM, toDay: SALARY_TO },
      },
    ],
    oneOffIncomes: [],
    receipts: [
      {
        id: `demo-receipt-${salaryMonth}`,
        occurrenceKey: `${SALARY_ID}:${salaryMonth}`,
        amount: rub(120_000),
        date: received,
        createdAt: 0,
      },
    ],
    payments: [
      { id: 'rent', name: 'Квартира', day: 10, amounts: [{ fromMonth: addMonths(monthOf(today), -2), amount: rub(40_000) }] },
    ],
    expenses,
    transfers: [],
    settings: {
      savePercent: 30,
      leftoverMode: 'otherDays',
      transportMonthly: rub(15_000),
      reminderEnabled: true,
      reminderTime: '21:00',
      staleBalanceDays: 3,
    },
    closures: [],
  };
}
