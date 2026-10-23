import { useState } from 'react';
import { incomesToConfirm, matchingOneOff, mayBeInBalance } from '../../core/actions';
import { dayOfMonth, monthOf, type ISODate } from '../../core/dates';
import { formatDayMonth, formatRub, parseRubInput } from '../../core/format';
import type { Kopecks } from '../../core/money';
import type { IncomeOccurrence } from '../../core/schedule';
import type { FinanceData } from '../../core/types';
import { AmountDisplay, Keypad } from '../../ui/Keypad';
import { DateField } from '../../ui/Calendar';
import { Sheet } from '../../ui/Sheet';

/** Что записываем: подтверждение ожидаемого дохода или новый разовый. */
type Pending =
  | { kind: 'confirm'; income: IncomeOccurrence; amount: Kopecks; date: ISODate }
  | { kind: 'oneOff'; name: string; amount: Kopecks; date: ISODate };

type Mode =
  | { kind: 'list' }
  | { kind: 'confirm'; income: IncomeOccurrence }
  | { kind: 'oneOff' }
  /** Пришедший разовый похож на ожидаемый (3.25). */
  | { kind: 'match'; income: IncomeOccurrence; pending: Pending }
  /** Остаток записан в тот же день: деньги уже в нём? (3.25) */
  | { kind: 'inBalance'; pending: Pending };

function when(o: IncomeOccurrence): string {
  if (o.early === o.late) return formatDayMonth(o.early);
  if (monthOf(o.early) === monthOf(o.late)) return `${dayOfMonth(o.early)}–${formatDayMonth(o.late)}`;
  return `${formatDayMonth(o.early)} – ${formatDayMonth(o.late)}`;
}

function amountRange(o: IncomeOccurrence): string {
  return o.min === o.max ? formatRub(o.min) : `${formatRub(o.min)} – ${formatRub(o.max)}`;
}

/** Целые рубли суммы для начального значения клавиатуры. */
function toInput(value: Kopecks): string {
  return String(Math.floor(value / 100));
}

export function IncomeSheet({
  data,
  today,
  initial,
  onConfirm,
  onOneOff,
  onClose,
}: {
  data: FinanceData;
  today: ISODate;
  /** Открыть сразу подтверждение этого дохода (из подсказки на главной). */
  initial?: IncomeOccurrence;
  onConfirm: (occurrenceKey: string, amount: Kopecks, date: ISODate, inBalance: boolean) => void;
  onOneOff: (name: string, amount: Kopecks, date: ISODate, inBalance: boolean) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initial ? { kind: 'confirm', income: initial } : { kind: 'list' });
  const [text, setText] = useState(initial ? toInput(initial.min) : '');
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState(false);
  const expected = incomesToConfirm(data, today);

  function finish(p: Pending, inBalance: boolean) {
    if (p.kind === 'confirm') onConfirm(p.income.key, p.amount, p.date, inBalance);
    else onOneOff(p.name, p.amount, p.date, inBalance);
  }

  function next(p: Pending) {
    if (mayBeInBalance(data, p.date)) setMode({ kind: 'inBalance', pending: p });
    else finish(p, false);
  }

  if (mode.kind === 'list') {
    return (
      <Sheet title="Записать доход" onClose={onClose}>
        {expected.map((o) => (
          <div key={o.key} className="row-card">
            <div>
              <div className="row-title">{o.name}</div>
              <div className="row-sub">
                {when(o)} · {amountRange(o)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setText(toInput(o.min));
                setMode({ kind: 'confirm', income: o });
              }}
            >
              Пришла
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-wide"
          onClick={() => {
            setText('');
            setMode({ kind: 'oneOff' });
          }}
        >
          Разовый доход
        </button>
        <p className="hint">Деньги приходят на основной счёт. Дату и сумму укажете на следующем шаге.</p>
      </Sheet>
    );
  }

  if (mode.kind === 'match') {
    const p = mode.pending;
    return (
      <Sheet title="Разовый доход" onClose={onClose}>
        <p className="close-question">
          Это «{mode.income.name}» на {formatRub(mode.income.min)}, который вы ждали к {formatDayMonth(mode.income.late)}?
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => next(p)}>
            Нет, другой
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => next({ kind: 'confirm', income: mode.income, amount: p.amount, date: p.date })}
          >
            Да, он
          </button>
        </div>
      </Sheet>
    );
  }

  if (mode.kind === 'inBalance') {
    const p = mode.pending;
    const main = data.accounts.find((a) => a.kind === 'main');
    const day = p.date === today ? 'сегодня' : formatDayMonth(p.date);
    return (
      <Sheet title="Уже в остатке?" onClose={onClose}>
        <p className="close-question">
          Вы указали остаток основного счёта {day}
          {main ? ` — ${formatRub(main.amount)}` : ''}. Эти {formatRub(p.amount)} уже есть в той сумме?
        </p>
        <p className="hint">Если да, Флюми не прибавит их второй раз.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => finish(p, false)}>
            Нет, пришли позже
          </button>
          <button type="button" className="btn btn-primary" onClick={() => finish(p, true)}>
            Да, уже есть
          </button>
        </div>
      </Sheet>
    );
  }

  function save() {
    const amount = parseRubInput(text);
    if (!amount) return setError(true);
    if (mode.kind === 'confirm') return next({ kind: 'confirm', income: mode.income, amount, date });
    const p: Pending = { kind: 'oneOff', name: name.trim() || 'Разовый доход', amount, date };
    const match = matchingOneOff(data, date, today);
    if (match) setMode({ kind: 'match', income: match, pending: p });
    else next(p);
  }

  return (
    <Sheet title={mode.kind === 'confirm' ? `${mode.income.name}: сколько пришло?` : 'Разовый доход'} onClose={onClose}>
      {mode.kind === 'oneOff' && (
        <input
          className="text-field"
          placeholder="Откуда, например «Проект»"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <AmountDisplay value={text} />
      {error && <p className="field-error">Введите сумму</p>}
      <DateField label="Когда пришла" value={date} onChange={setDate} today={today} max={today} />
      <Keypad
        onChange={(update) => {
          setText(update);
          setError(false);
        }}
      />
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => (initial ? onClose() : setMode({ kind: 'list' }))}
        >
          Назад
        </button>
        <button type="button" className="btn btn-primary" onClick={save}>
          Подтвердить
        </button>
      </div>
    </Sheet>
  );
}
