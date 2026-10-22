import { useState } from 'react';
import { incomesToConfirm } from '../../core/actions';
import { dayOfMonth, monthOf, type ISODate } from '../../core/dates';
import { formatDayMonth, formatRub, parseRubInput } from '../../core/format';
import type { Kopecks } from '../../core/money';
import type { IncomeOccurrence } from '../../core/schedule';
import type { FinanceData } from '../../core/types';
import { AmountDisplay, Keypad } from '../../ui/Keypad';
import { DateField } from '../../ui/Calendar';
import { Sheet } from '../../ui/Sheet';

type Mode = { kind: 'list' } | { kind: 'confirm'; income: IncomeOccurrence } | { kind: 'oneOff' };

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
  onConfirm,
  onOneOff,
  onClose,
}: {
  data: FinanceData;
  today: ISODate;
  onConfirm: (occurrenceKey: string, amount: Kopecks, date: ISODate) => void;
  onOneOff: (name: string, amount: Kopecks, date: ISODate) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState(false);
  const expected = incomesToConfirm(data, today);

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

  function save() {
    const amount = parseRubInput(text);
    if (!amount) return setError(true);
    if (mode.kind === 'confirm') onConfirm(mode.income.key, amount, date);
    else onOneOff(name.trim() || 'Разовый доход', amount, date);
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
        <button type="button" className="btn btn-secondary" onClick={() => setMode({ kind: 'list' })}>
          Назад
        </button>
        <button type="button" className="btn btn-primary" onClick={save}>
          Подтвердить
        </button>
      </div>
    </Sheet>
  );
}
