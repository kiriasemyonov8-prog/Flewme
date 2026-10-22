// Модель данных (SPEC.md, раздел 13). Все суммы в копейках, все даты локальные 'YYYY-MM-DD'.
import type { ISODate, ISOMonth } from './dates';
import type { Kopecks } from './money';

export type AccountKind = 'main' | 'savings' | 'other';

export interface Account {
  id: string;
  kind: AccountKind;
  name: string;
  /** Сумма на счёте на дату asOf («на 21 октября»). */
  amount: Kopecks;
  asOf: ISODate;
  /**
   * Момент записи остатка (мс). Нужен, чтобы понять, какие траты и поступления
   * дня asOf уже вошли в сумму: записанные раньше — вошли, позже — нет.
   */
  asOfTs: number;
  /**
   * Ключи обязательных платежей дня asOf, которые уже оплачены и вошли в сумму.
   * Не указан — консервативно считаем, что платёж ещё не списан.
   */
  paidOnAsOf?: string[];
}

export type IncomeSchedule =
  | { type: 'days'; days: number[] } // один или несколько дней месяца
  | { type: 'window'; fromDay: number; toDay: number }; // плавающая дата

export interface RegularIncome {
  id: string;
  name: string;
  /** Фиксированная сумма: min === max. Диапазон: min < max. */
  min: Kopecks;
  max: Kopecks;
  schedule: IncomeSchedule;
}

export interface OneOffIncome {
  id: string;
  name: string;
  amount: Kopecks;
  date: ISODate;
}

/** Подтверждённое поступление (кнопка «Пришла»). Деньги приходят на основной счёт. */
export interface IncomeReceipt {
  id: string;
  /** Ключ ожидаемого дохода (см. schedule.ts), который подтверждён. */
  occurrenceKey: string;
  amount: Kopecks;
  date: ISODate;
  createdAt: number;
}

export interface PaymentAmount {
  fromMonth: ISOMonth;
  amount: Kopecks;
}

export interface FixedPayment {
  id: string;
  name: string;
  /** День месяца 1–31. */
  day: number;
  /** История сумм: изменение действует с выбранного месяца вперёд. */
  amounts: PaymentAmount[];
}

export interface Expense {
  id: string;
  amount: Kopecks;
  accountId: string;
  categoryId: string;
  date: ISODate;
  createdAt: number;
  note?: string;
  /** Примерная трата из демо-набора. */
  demo?: boolean;
}

export type TransferPurpose = 'setAside' | 'saved' | 'withdraw' | 'manual';

/** Перевод между счетами, подтверждённый пользователем после настоящего перевода. */
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: Kopecks;
  date: ISODate;
  createdAt: number;
  purpose: TransferPurpose;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  /** «Еда»: нельзя удалить и переименовать. */
  locked?: boolean;
}

export interface Goal {
  id: string;
  name: string;
  target: Kopecks;
  deadline?: ISODate;
}

export type LeftoverMode = 'otherDays' | 'account';

export interface Settings {
  /** Процент откладывания в накопления, 0 — выключено. */
  savePercent: number;
  leftoverMode: LeftoverMode;
  /** Транспорт: месячная сумма, резервируется по дням. */
  transportMonthly: Kopecks;
  reminderEnabled: boolean;
  reminderTime: string; // 'HH:MM'
  staleBalanceDays: number;
}

export interface Questionnaire {
  protectedCategoryIds: string[];
}

/** Закрытый день: сколько потрачено с основного счёта и какой был лимит. */
export interface DayClosure {
  date: ISODate;
  spent: Kopecks;
  limit: Kopecks;
  /** Сэкономлено в режиме «на счёт» (в режиме «на другие дни» 0). */
  saved: Kopecks;
}

/** Откладывание, зафиксированное в начале периода (вариант А, SPEC 3.1). */
export interface SavePlan {
  periodKey: string;
  periodStart: ISODate;
  percent: number;
  amount: Kopecks;
  /** День расчёта: в этот день сумма ещё следует за исправлениями данных. */
  createdOn: ISODate;
  /** Отпечаток доходов, платежей и транспорта: если они изменились, сумма считается заново. */
  basis: string;
}

/** Зафиксированный лимит периода в режиме «на счёт». */
export interface FixedLimit {
  periodKey: string;
  limit: Kopecks;
}

export interface FinanceData {
  /** День начала пользования: незакрытые дни раньше него не предлагаются. */
  startedOn: ISODate;
  /** Помеченные «Демо» данные. */
  isDemo: boolean;
  /** Категория по умолчанию при записи траты — последняя использованная. */
  lastCategoryId?: string;
  categories: Category[];
  /** Анкета «На чём не готов экономить». Влияет только на рекомендации, не на лимит. */
  questionnaire: Questionnaire;
  accounts: Account[];
  regularIncomes: RegularIncome[];
  oneOffIncomes: OneOffIncome[];
  receipts: IncomeReceipt[];
  payments: FixedPayment[];
  expenses: Expense[];
  transfers: Transfer[];
  settings: Settings;
  closures: DayClosure[];
  savePlan?: SavePlan;
  fixedLimit?: FixedLimit;
}
