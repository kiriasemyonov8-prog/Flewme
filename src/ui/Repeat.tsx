// Повтор «каждую неделю» и «раз в две недели» для доходов и платежей (SPEC 3.26).
import { formatDayMonth } from '../core/format';
import type { WeeklyRepeat } from '../core/types';

const SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const ON_DAYS = ['по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам', 'по воскресеньям'];

export function repeatText(r: WeeklyRepeat): string {
  return r.type === 'weekly' ? `каждую неделю, ${ON_DAYS[r.weekday]}` : `раз в две недели, с ${formatDayMonth(r.from)}`;
}

export function WeekdayGrid({ value, onChange }: { value: number | null; onChange: (weekday: number) => void }) {
  return (
    <div className="day-grid week-grid" role="radiogroup" aria-label="День недели">
      {SHORT.map((name, i) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === i}
          className={value === i ? 'is-on' : ''}
          onClick={() => onChange(i)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** Выбор одного варианта из нескольких фишками (когда вариантов больше, чем влезает в переключатель). */
export function ChoiceChips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`chip${o.value === value ? ' is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
