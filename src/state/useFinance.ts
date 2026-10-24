// Состояние приложения. Сохраняется в памяти браузера после каждого изменения (SPEC 3.29).
import { useEffect, useMemo, useState } from 'react';
import * as actions from '../core/actions';
import { todayLocal, type ISODate } from '../core/dates';
import { demoData } from '../core/demo';
import { computeLimit, type LimitResult } from '../core/limit';
import type { Kopecks } from '../core/money';
import { BROKEN_KEY, decodeState, encodeState, STORAGE_KEY, type AppMeta } from '../core/storage';
import type { FinanceData } from '../core/types';

function newId(): string {
  return crypto.randomUUID();
}

export interface FinanceStore {
  data: FinanceData;
  today: ISODate;
  limit: LimitResult;
  addExpense: (e: actions.ExpenseInput) => void;
  confirmIncome: (occurrenceKey: string, amount: Kopecks, date: ISODate, inBalance?: boolean) => void;
  addReceivedOneOff: (name: string, amount: Kopecks, date: ISODate, inBalance?: boolean) => void;
  closeDay: (date: ISODate, unsure?: boolean) => void;
  /** Применить чистое действие из core (профиль, настройки и т. п.). */
  update: (action: (d: FinanceData) => FinanceData) => void;
  /** Заменить все данные (сброс к демо, свои данные, восстановление из файла). */
  replace: (data: FinanceData) => void;
  /** Служебные отметки: пройден ли первый вход, когда была копия в файл. */
  meta: AppMeta;
  setMeta: (patch: Partial<AppMeta>) => void;
  /** Сохранённое прочитать не удалось — ждём решения человека, ничего не перезаписываем. */
  broken: 'damaged' | 'newer' | null;
  /** Человек решил: восстановить из файла или начать заново. */
  resolveBroken: (data: FinanceData, meta: AppMeta) => void;
}

interface Loaded {
  data: FinanceData;
  meta: AppMeta;
  broken: 'damaged' | 'newer' | null;
}

/** Память браузера может быть недоступна (приватный режим и т. п.) — тогда просто работаем без неё. */
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Нет места или запрещено — данные останутся в памяти до закрытия.
  }
}

function load(today: ISODate): Loaded {
  const text = readStorage(STORAGE_KEY);
  const r = decodeState(text);
  if (r.kind === 'ok') return { data: r.data, meta: r.meta, broken: null };
  const fresh = { data: demoData(today, Date.now()), meta: { onboarded: false } };
  if (r.kind === 'empty') return { ...fresh, broken: null };
  // Нечитаемую запись откладываем отдельно, чтобы её не затёрло, и спрашиваем человека.
  if (text) writeStorage(BROKEN_KEY, text);
  return { ...fresh, broken: r.reason };
}

export { newId };

export function useFinance(): FinanceStore {
  const [today, setToday] = useState(todayLocal);
  const [initial] = useState(() => load(todayLocal()));
  const [data, setData] = useState<FinanceData>(initial.data);
  const [meta, setMetaState] = useState<AppMeta>(initial.meta);
  const [broken, setBroken] = useState(initial.broken);
  const limit = useMemo(() => computeLimit(data, today), [data, today]);

  // Сохраняем после каждого изменения. Пока сохранённое не прочитано и человек не решил,
  // что с ним делать, ничего не перезаписываем.
  useEffect(() => {
    if (broken) return;
    writeStorage(STORAGE_KEY, encodeState(data, meta, new Date()));
  }, [data, meta, broken]);

  // Просим браузер не стирать данные при нехватке места.
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  // Смена дня: приложение могло остаться открытым после полуночи.
  useEffect(() => {
    const check = () => setToday((t) => (todayLocal() !== t ? todayLocal() : t));
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  // Откладывание и лимит «на счёт» фиксируются на период: сохраняем, когда ядро их создало заново.
  // Сравниваем по содержимому: в день расчёта ядро каждый раз отдаёт новый объект.
  // Последний обычный лимит тоже запоминаем: он держится в день ожидания дохода (3.25).
  useEffect(() => {
    if (limit.status !== 'ok') return;
    const planChanged = JSON.stringify(data.savePlan) !== JSON.stringify(limit.savePlan);
    const fixedChanged = limit.fixedLimit && data.fixedLimit?.limit !== limit.fixedLimit.limit;
    const lastChanged = JSON.stringify(data.lastLimit) !== JSON.stringify(limit.lastLimit);
    if (planChanged || fixedChanged || lastChanged) {
      setData((d) => ({
        ...d,
        savePlan: limit.savePlan,
        fixedLimit: limit.fixedLimit ?? d.fixedLimit,
        lastLimit: limit.lastLimit,
      }));
    }
  }, [limit, data.savePlan, data.fixedLimit, data.lastLimit]);

  return {
    data,
    today,
    limit,
    addExpense: (e) => setData((d) => actions.addExpense(d, e, newId(), Date.now())),
    confirmIncome: (key, amount, date, inBalance) =>
      setData((d) => actions.confirmIncome(d, key, amount, date, newId(), Date.now(), inBalance)),
    addReceivedOneOff: (name, amount, date, inBalance) =>
      setData((d) => actions.addReceivedOneOff(d, name, amount, date, newId(), Date.now(), inBalance)),
    closeDay: (date, unsure) => setData((d) => actions.closeDayAction(d, date, unsure)),
    update: (action) => setData(action),
    replace: (next) => setData(next),
    meta,
    setMeta: (patch) => setMetaState((m) => ({ ...m, ...patch })),
    broken,
    resolveBroken: (next, nextMeta) => {
      setData(next);
      setMetaState(nextMeta);
      setBroken(null);
    },
  };
}
