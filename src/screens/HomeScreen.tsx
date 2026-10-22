import { CalendarDays, Wallet } from 'lucide-react';
import type { ISODate } from '../core/dates';
import { formatDayMonth, formatRubWhole, pluralDays } from '../core/format';
import { computeLimit } from '../core/limit';
import type { FinanceData } from '../core/types';
import { DemoBadge } from '../ui/DemoBadge';

// Шаг 2: только верхние числа из расчётного ядра. Робот, кнопки и чат — шаг 3.
export function HomeScreen({ data, today }: { data: FinanceData; today: ISODate }) {
  const limit = computeLimit(data, today);

  return (
    <>
      <DemoBadge />
      {limit.status === 'noData' ? (
        <div className="card stub">
          <p>Чтобы посчитать лимит, нужны остаток основного счёта и хотя бы один ожидаемый доход.</p>
        </div>
      ) : (
        <div className="top-cards">
          <section className="card stat">
            <div className="stat-head">
              <CalendarDays size={18} aria-hidden />
              <span>До зарплаты</span>
            </div>
            <div className="stat-value num">
              {limit.daysRange.min === limit.daysRange.max
                ? limit.daysRange.max
                : `${limit.daysRange.min}–${limit.daysRange.max}`}
              <span className="stat-unit"> {pluralDays(limit.daysRange.max)}</span>
            </div>
            <div className="stat-note">лимит до {formatDayMonth(limit.horizon)}</div>
          </section>
          <section className="card stat stat-accent">
            <div className="stat-head">
              <Wallet size={18} aria-hidden />
              <span>На сегодня</span>
            </div>
            <div className="stat-value num">{formatRubWhole(limit.dailyLimit)}</div>
            <div className="stat-note">
              {limit.noFreeMoney ? 'по вашим данным свободных денег до дохода нет' : 'можно потратить'}
            </div>
          </section>
        </div>
      )}
      <div className="card stub">
        <p>Флюми, кнопки «Записать доход» и «Записать трату» и чат появятся на шаге 3.</p>
      </div>
    </>
  );
}
