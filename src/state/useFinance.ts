// Состояние приложения. Пока живёт в памяти: сохранение в браузере — шаг 7.
import { useEffect, useMemo, useState } from 'react';
import * as actions from '../core/actions';
import { todayLocal, type ISODate } from '../core/dates';
import { demoData } from '../core/demo';
import { computeLimit, type LimitResult } from '../core/limit';
import type { Kopecks } from '../core/money';
import type { FinanceData } from '../core/types';

function newId(): string {
  return crypto.randomUUID();
}

export interface FinanceStore {
  data: FinanceData;
  today: ISODate;
  limit: LimitResult;
  addExpense: (e: actions.ExpenseInput) => void;
  confirmIncome: (occurrenceKey: string, amount: Kopecks, date: ISODate) => void;
  addReceivedOneOff: (name: string, amount: Kopecks, date: ISODate) => void;
  closeDay: (date: ISODate) => void;
  /** Применить чистое действие из core (профиль, настройки и т. п.). */
  update: (action: (d: FinanceData) => FinanceData) => void;
  /** Заменить все данные (сброс к демо, свои данные, восстановление из файла). */
  replace: (data: FinanceData) => void;
}

export { newId };

export function useFinance(): FinanceStore {
  const today = todayLocal();
  const [data, setData] = useState<FinanceData>(() => demoData(today, Date.now()));
  const limit = useMemo(() => computeLimit(data, today), [data, today]);

  // Откладывание и лимит «на счёт» фиксируются на период: сохраняем, когда ядро их создало заново.
  // Сравниваем по содержимому: в день расчёта ядро каждый раз отдаёт новый объект.
  useEffect(() => {
    if (limit.status !== 'ok') return;
    const planChanged = JSON.stringify(data.savePlan) !== JSON.stringify(limit.savePlan);
    const fixedChanged = limit.fixedLimit && data.fixedLimit?.limit !== limit.fixedLimit.limit;
    if (planChanged || fixedChanged) {
      setData((d) => ({ ...d, savePlan: limit.savePlan, fixedLimit: limit.fixedLimit ?? d.fixedLimit }));
    }
  }, [limit, data.savePlan, data.fixedLimit]);

  return {
    data,
    today,
    limit,
    addExpense: (e) => setData((d) => actions.addExpense(d, e, newId(), Date.now())),
    confirmIncome: (key, amount, date) =>
      setData((d) => actions.confirmIncome(d, key, amount, date, newId(), Date.now())),
    addReceivedOneOff: (name, amount, date) =>
      setData((d) => actions.addReceivedOneOff(d, name, amount, date, newId(), Date.now())),
    closeDay: (date) => setData((d) => actions.closeDayAction(d, date)),
    update: (action) => setData(action),
    replace: (next) => setData(next),
  };
}
