import { mainAccount } from '../../core/balance';
import type { ISODate } from '../../core/dates';
import { spentOnDayMain } from '../../core/days';
import { formatDayMonth, formatRub } from '../../core/format';
import type { FinanceData } from '../../core/types';
import { Sheet } from '../../ui/Sheet';

export function CloseDaySheet({
  data,
  date,
  today,
  onAddExpense,
  onConfirm,
  onClose,
}: {
  data: FinanceData;
  date: ISODate;
  today: ISODate;
  onAddExpense: () => void;
  /** unsure — трат не записано, и человек не помнит, тратил ли (3.25). */
  onConfirm: (unsure: boolean) => void;
  onClose: () => void;
}) {
  const main = mainAccount(data);
  const spent = spentOnDayMain(data, date);
  const items = data.expenses.filter((x) => x.date === date && x.accountId === main?.id);
  const dayName = date === today ? 'сегодня' : formatDayMonth(date);

  // Пустой день: «ничего не тратили» и «забыли записать» — не одно и то же (3.25).
  if (items.length === 0) {
    return (
      <Sheet title="Закрыть день" onClose={onClose}>
        <p className="close-question">
          {date === today ? 'Сегодня' : formatDayMonth(date)} трат не записано. Ничего не тратили?
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={onAddExpense}>
            Добавить трату
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(false)}>
            Да, ничего
          </button>
        </div>
        <button type="button" className="link-btn" onClick={() => onConfirm(true)}>
          Не помню
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Закрыть день" onClose={onClose}>
      <p className="close-question">
        За {dayName} потрачено <b className="num">{formatRub(spent)}</b>, верно?
      </p>
      {items.length > 0 && (
        <ul className="expense-list">
          {items.map((x) => (
            <li key={x.id}>
              <span>{data.categories.find((c) => c.id === x.categoryId)?.name ?? 'Другое'}</span>
              <span className="num">{formatRub(x.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onAddExpense}>
          Добавить трату
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(false)}>
          Верно
        </button>
      </div>
    </Sheet>
  );
}
