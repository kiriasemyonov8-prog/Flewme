// Действия раздела «Профиль»: счета, доходы и платежи, настройки, категории, анкета.
// Чистые функции «данные → новые данные», без интерфейса.
import { CATEGORY_COLORS, DEFAULT_CATEGORIES, FOOD_ID, MAX_CATEGORIES, OTHER_ID } from './categories';
import type { ISODate, ISOMonth } from './dates';
import type { Kopecks } from './money';
import { rub } from './money';
import type {
  Account,
  AccountKind,
  FinanceData,
  FixedPayment,
  LeftoverMode,
  OneOffIncome,
  RegularIncome,
} from './types';

export const DEFAULT_SETTINGS = {
  savePercent: 30,
  leftoverMode: 'otherDays' as LeftoverMode,
  transportMonthly: rub(0),
  reminderEnabled: true,
  reminderTime: '21:00',
  staleBalanceDays: 3,
};

/** Чистый лист для своих данных: ничего не придумываем, лимит попросит недостающее. */
export function emptyData(today: ISODate): FinanceData {
  return {
    startedOn: today,
    isDemo: false,
    categories: DEFAULT_CATEGORIES,
    questionnaire: { protectedCategoryIds: [] },
    accounts: [],
    regularIncomes: [],
    oneOffIncomes: [],
    receipts: [],
    payments: [],
    expenses: [],
    transfers: [],
    settings: { ...DEFAULT_SETTINGS },
    closures: [],
  };
}

// ——— Счета ———

const ACCOUNT_NAMES: Record<Exclude<AccountKind, 'other'>, string> = {
  main: 'Основной счёт',
  savings: 'Накопления',
};

/**
 * Записать остаток счёта на дату. Момент записи нужен, чтобы понять, какие траты дня
 * уже вошли в сумму. paidOnAsOf — платежи этого дня, которые уже списаны.
 */
export function setAccountBalance(
  data: FinanceData,
  accountId: string,
  amount: Kopecks,
  asOf: ISODate,
  now: number,
  paidOnAsOf: string[] = [],
): FinanceData {
  return {
    ...data,
    accounts: data.accounts.map((a) =>
      a.id === accountId ? { ...a, amount, asOf, asOfTs: now, paidOnAsOf } : a,
    ),
  };
}

/** Создать основной или накопительный счёт (если его ещё нет) или другой счёт. */
export function addAccount(
  data: FinanceData,
  kind: AccountKind,
  amount: Kopecks,
  asOf: ISODate,
  now: number,
  id: string,
  name?: string,
  paidOnAsOf: string[] = [],
): FinanceData {
  if (kind !== 'other' && data.accounts.some((a) => a.kind === kind)) return data;
  const account: Account = {
    id: kind === 'other' ? id : kind,
    kind,
    name: kind === 'other' ? name?.trim() || 'Другой счёт' : ACCOUNT_NAMES[kind],
    amount,
    asOf,
    asOfTs: now,
    paidOnAsOf,
  };
  return { ...data, accounts: [...data.accounts, account] };
}

export function renameAccount(data: FinanceData, accountId: string, name: string): FinanceData {
  const trimmed = name.trim();
  if (!trimmed) return data;
  return {
    ...data,
    accounts: data.accounts.map((a) => (a.id === accountId && a.kind === 'other' ? { ...a, name: trimmed } : a)),
  };
}

/** Удалить можно только «другой» счёт; его траты остаются в истории. */
export function removeAccount(data: FinanceData, accountId: string): FinanceData {
  return { ...data, accounts: data.accounts.filter((a) => !(a.id === accountId && a.kind === 'other')) };
}

// ——— Доходы и платежи ———

export function upsertRegularIncome(data: FinanceData, income: RegularIncome): FinanceData {
  const exists = data.regularIncomes.some((i) => i.id === income.id);
  return {
    ...data,
    regularIncomes: exists
      ? data.regularIncomes.map((i) => (i.id === income.id ? income : i))
      : [...data.regularIncomes, income],
  };
}

export function removeRegularIncome(data: FinanceData, id: string): FinanceData {
  return { ...data, regularIncomes: data.regularIncomes.filter((i) => i.id !== id) };
}

export function addOneOffIncome(data: FinanceData, income: OneOffIncome): FinanceData {
  return { ...data, oneOffIncomes: [...data.oneOffIncomes, income] };
}

/** Удаляется только ещё не подтверждённый разовый доход. */
export function removeOneOffIncome(data: FinanceData, id: string): FinanceData {
  if (data.receipts.some((r) => r.occurrenceKey === `oneoff:${id}`)) return data;
  return { ...data, oneOffIncomes: data.oneOffIncomes.filter((i) => i.id !== id) };
}

export function addPayment(
  data: FinanceData,
  id: string,
  name: string,
  day: number,
  amount: Kopecks,
  fromMonth: ISOMonth,
): FinanceData {
  const payment: FixedPayment = { id, name: name.trim() || 'Платёж', day, amounts: [{ fromMonth, amount }] };
  return { ...data, payments: [...data.payments, payment] };
}

/** Новая сумма действует с выбранного месяца вперёд; прошлые месяцы не переписываются. */
export function changePaymentAmount(
  data: FinanceData,
  id: string,
  amount: Kopecks,
  fromMonth: ISOMonth,
): FinanceData {
  return {
    ...data,
    payments: data.payments.map((p) =>
      p.id === id
        ? { ...p, amounts: [...p.amounts.filter((a) => a.fromMonth !== fromMonth), { fromMonth, amount }] }
        : p,
    ),
  };
}

export function updatePaymentInfo(data: FinanceData, id: string, name: string, day: number): FinanceData {
  return {
    ...data,
    payments: data.payments.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, day } : p)),
  };
}

export function removePayment(data: FinanceData, id: string): FinanceData {
  return { ...data, payments: data.payments.filter((p) => p.id !== id) };
}

// ——— Настройки ———

export function updateSettings(data: FinanceData, patch: Partial<FinanceData['settings']>): FinanceData {
  const settings = { ...data.settings, ...patch };
  // Режим «на счёт» фиксирует лимит на период: при смене режима начинаем заново.
  const fixedLimit = patch.leftoverMode && patch.leftoverMode !== data.settings.leftoverMode ? undefined : data.fixedLimit;
  return { ...data, settings, fixedLimit };
}

// ——— Категории ———

export type CategoryError = 'limit' | 'empty' | 'duplicate' | 'locked';

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru');
}

export function addCategory(
  data: FinanceData,
  id: string,
  name: string,
  color: string = CATEGORY_COLORS[data.categories.length % CATEGORY_COLORS.length],
): FinanceData | CategoryError {
  if (data.categories.length >= MAX_CATEGORIES) return 'limit';
  if (!name.trim()) return 'empty';
  if (data.categories.some((c) => sameName(c.name, name))) return 'duplicate';
  return { ...data, categories: [...data.categories, { id, name: name.trim(), color }] };
}

export function renameCategory(data: FinanceData, id: string, name: string): FinanceData | CategoryError {
  const cat = data.categories.find((c) => c.id === id);
  if (!cat || cat.locked) return 'locked';
  if (!name.trim()) return 'empty';
  if (data.categories.some((c) => c.id !== id && sameName(c.name, name))) return 'duplicate';
  return { ...data, categories: data.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) };
}

export function setCategoryColor(data: FinanceData, id: string, color: string): FinanceData {
  return { ...data, categories: data.categories.map((c) => (c.id === id ? { ...c, color } : c)) };
}

/** Удалённая категория: её траты переходят в «Другое». «Еда» и «Другое» не удаляются. */
export function removeCategory(data: FinanceData, id: string): FinanceData | CategoryError {
  if (id === FOOD_ID || id === OTHER_ID) return 'locked';
  return {
    ...data,
    categories: data.categories.filter((c) => c.id !== id),
    expenses: data.expenses.map((x) => (x.categoryId === id ? { ...x, categoryId: OTHER_ID } : x)),
    lastCategoryId: data.lastCategoryId === id ? undefined : data.lastCategoryId,
    questionnaire: {
      protectedCategoryIds: data.questionnaire.protectedCategoryIds.filter((c) => c !== id),
    },
  };
}

export function setProtectedCategories(data: FinanceData, ids: string[]): FinanceData {
  return { ...data, questionnaire: { protectedCategoryIds: ids } };
}
