// Общие элементы ввода: строки разделов, переключатели, выбор дней месяца, сумма с клавиатурой.
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { AmountDisplay, Keypad } from './Keypad';

/** Строка раздела, по нажатию открывает редактирование. */
export function RowButton({ title, sub, value, onClick }: { title: string; sub?: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" className="row-btn" onClick={onClick}>
      <span className="row-main">
        <span className="row-title">{title}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {value && <span className="row-value num">{value}</span>}
      <ChevronRight size={18} className="row-chevron" aria-hidden />
    </button>
  );
}

/**
 * Раскрывающийся раздел настроек: заголовок с кратким итогом; по нажатию содержимое
 * плавно раскрывается (высота анимируется через grid-template-rows).
 */
export function Collapsible({
  title,
  summary,
  open,
  onToggle,
  children,
  note,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  note?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  // Раскрытый раздел плавно прокручивается в поле зрения.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <section ref={ref} className={`card collapsible${open ? ' is-open' : ''}`}>
      <button type="button" className="collapsible-head" aria-expanded={open} onClick={onToggle}>
        <span className="row-main">
          <span className="collapsible-title">{title}</span>
          <span className="row-sub">{summary}</span>
        </span>
        <ChevronDown size={20} className="collapsible-chevron" aria-hidden />
      </button>
      <div className="collapsible-body" inert={!open}>
        <div className="collapsible-inner">
          {children}
          {note && <p className="hint section-note">{note}</p>}
        </div>
      </div>
    </section>
  );
}

export function Segmented<T extends string>({
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
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="toggle-row" onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className={`toggle${checked ? ' is-on' : ''}`} aria-hidden>
        <span />
      </span>
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-label">
      <span className="field-label">{label}</span>
      <input
        className="text-field"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        // клавиатура телефона выезжает не сразу — потом показываем поле над ней
        onFocus={(e) => {
          const el = e.currentTarget;
          setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
        }}
      />
    </label>
  );
}

/** Сетка дней месяца 1–31: выбор одного или нескольких дней. */
export function DayGrid({ selected, onToggle, label }: { selected: number[]; onToggle: (day: number) => void; label: string }) {
  return (
    <div className="day-grid" role="group" aria-label={label}>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={selected.includes(d)}
          className={selected.includes(d) ? 'is-on' : ''}
          onClick={() => onToggle(d)}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

/**
 * Одна или несколько сумм с общей экранной клавиатурой: нажатие на сумму делает её активной.
 */
export function AmountPad({
  fields,
  active,
  onActivate,
  onChange,
}: {
  fields: { label: string; text: string }[];
  active: number;
  onActivate: (i: number) => void;
  onChange: (i: number, update: (prev: string) => string) => void;
}) {
  return (
    <div className="amount-pad">
      <div className={`amount-fields${fields.length > 1 ? ' is-multi' : ''}`}>
        {fields.map((f, i) => (
          <button
            key={f.label}
            type="button"
            className={`amount-field${i === active && fields.length > 1 ? ' is-active' : ''}`}
            onClick={() => onActivate(i)}
          >
            {fields.length > 1 && <span className="field-label">{f.label}</span>}
            <AmountDisplay value={f.text} />
          </button>
        ))}
      </div>
      <Keypad onChange={(update) => onChange(active, update)} />
    </div>
  );
}
