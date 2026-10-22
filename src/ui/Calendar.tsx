import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { addMonths, dateInMonth, daysInMonth, monthOf, weekdayMon0, type ISODate } from '../core/dates';
import { formatDayMonth } from '../core/format';

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Календарь для выбора даты (SPEC, раздел 4). Неделя с понедельника. */
export function Calendar({
  value,
  onChange,
  today,
  min,
  max,
}: {
  value: ISODate;
  onChange: (d: ISODate) => void;
  today: ISODate;
  min?: ISODate;
  max?: ISODate;
}) {
  const [month, setMonth] = useState(monthOf(value));
  const [y, m] = month.split('-').map(Number);
  const first = dateInMonth(month, 1);
  const blanks = weekdayMon0(first);
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => dateInMonth(month, i + 1));

  return (
    <div className="calendar">
      <div className="cal-head">
        <button type="button" className="icon-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={20} />
        </button>
        <span className="cal-title">
          {MONTHS[m - 1]} {y}
        </span>
        <button type="button" className="icon-btn" aria-label="Следующий месяц" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-wd">
            {w}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {days.map((d) => {
          const disabled = (min !== undefined && d < min) || (max !== undefined && d > max);
          return (
            <button
              key={d}
              type="button"
              className={`cal-day${d === value ? ' is-on' : ''}${d === today ? ' is-today' : ''}`}
              disabled={disabled}
              aria-label={formatDayMonth(d)}
              aria-pressed={d === value}
              onClick={() => onChange(d)}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Поле даты: показывает дату, по нажатию раскрывает календарь. */
export function DateField({
  label,
  value,
  onChange,
  today,
  min,
  max,
}: {
  label: string;
  value: ISODate;
  onChange: (d: ISODate) => void;
  today: ISODate;
  min?: ISODate;
  max?: ISODate;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="date-field">
      <button type="button" className="field-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="field-label">{label}</span>
        <span className="field-value">{value === today ? `сегодня, ${formatDayMonth(value)}` : formatDayMonth(value)}</span>
      </button>
      {open && (
        <Calendar
          value={value}
          today={today}
          min={min}
          max={max}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
