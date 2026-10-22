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
  confirmIncome: (occurrenceKey: string, amount: Kopecks) => void;
  addReceivedOneOff: (name: string, amount: Kopecks) => void;
  closeDay: (date: ISODate) => void;
}

export function useFinance(): FinanceStore {
  const today = todayLocal();
  const [data, setData] = useState<FinanceData>(() => demoData(today, Date.now()));
  const limit = useMemo(() => computeLimit(data, today), [data, today]);

  // Откладывание и лимит «на счёт» фиксируются на период: сохраняем, когда ядро их создало заново.
  useEffect(() => {
    if (limit.status !== 'ok') return;
    if (data.savePlan !== limit.savePlan || (limit.fixedLimit && data.fixedLimit?.limit !== limit.fixedLimit.limit)) {
      setData((d) => ({ ...d, savePlan: limit.savePlan, fixedLimit: limit.fixedLimit ?? d.fixedLimit }));
    }
  }, [limit, data.savePlan, data.fixedLimit]);

  return {
    data,
    today,
    limit,
    addExpense: (e) => setData((d) => actions.addExpense(d, e, newId(), Date.now())),
    confirmIncome: (key, amount) =>
      setData((d) => actions.confirmIncome(d, key, amount, today, newId(), Date.now())),
    addReceivedOneOff: (name, amount) =>
      setData((d) => actions.addReceivedOneOff(d, name, amount, today, newId(), Date.now())),
    closeDay: (date) => setData((d) => actions.closeDayAction(d, date)),
  };
}
