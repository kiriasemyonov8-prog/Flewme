import { useState } from 'react';
import { CATEGORY_COLORS } from '../../core/categories';
import { addDays, type ISODate } from '../../core/dates';
import { parseRubInput, toRubInput } from '../../core/format';
import type { Kopecks } from '../../core/money';
import type { Category } from '../../core/types';
import { DateField } from '../../ui/Calendar';
import { AmountPad, TextField } from '../../ui/Form';
import { Sheet } from '../../ui/Sheet';
import { TimeWheel } from '../../ui/TimeWheel';

/** Одна сумма: транспорт в месяц и т. п. Пустое поле или 0 — выключить. */
export function AmountSheet({
  title,
  hint,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  hint: string;
  initial: Kopecks;
  onSave: (amount: Kopecks) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(toRubInput(initial));
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="hint">{hint}</p>
      <AmountPad fields={[{ label: 'Сумма', text }]} active={0} onActivate={() => {}} onChange={(_, u) => setText(u)} />
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => onSave(parseRubInput(text) ?? (0 as Kopecks))}
      >
        Сохранить
      </button>
    </Sheet>
  );
}

/** Время напоминания барабанами, как в будильнике. */
export function TimeSheet({ initial, onSave, onClose }: { initial: string; onSave: (t: string) => void; onClose: () => void }) {
  const [time, setTime] = useState(initial);
  return (
    <Sheet title="Время напоминания" onClose={onClose}>
      <TimeWheel value={time} onChange={setTime} />
      <button type="button" className="btn btn-primary btn-wide" onClick={() => onSave(time)}>
        Готово
      </button>
    </Sheet>
  );
}

/** Ожидаемый разовый доход с датой. */
export function OneOffSheet({
  today,
  onSave,
  onClose,
}: {
  today: ISODate;
  onSave: (v: { name: string; amount: Kopecks; date: ISODate }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [date, setDate] = useState(addDays(today, 1));
  const [error, setError] = useState(false);
  return (
    <Sheet title="Ожидаемый разовый доход" onClose={onClose}>
      <TextField label="Откуда" value={name} onChange={setName} placeholder="Например, проект" />
      <AmountPad
        fields={[{ label: 'Сумма', text }]}
        active={0}
        onActivate={() => {}}
        onChange={(_, u) => {
          setText(u);
          setError(false);
        }}
      />
      {error && <p className="field-error">Введите сумму</p>}
      <DateField label="Когда придёт" value={date} onChange={setDate} today={today} min={today} />
      <p className="hint">Пока доход не подтверждён кнопкой «Пришла», в остаток он не входит.</p>
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => {
          const amount = parseRubInput(text);
          if (!amount) return setError(true);
          onSave({ name: name.trim() || 'Разовый доход', amount, date });
        }}
      >
        Сохранить
      </button>
    </Sheet>
  );
}

export const CATEGORY_ERRORS = {
  limit: 'Больше 12 категорий завести нельзя.',
  empty: 'Введите название.',
  duplicate: 'Такая категория уже есть.',
  locked: 'Эту категорию нельзя изменить.',
} as const;

/** Новая или существующая категория: название, цвет, удаление. */
export function CategorySheet({
  category,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  category?: Category;
  error: string | null;
  onSave: (name: string, color: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);
  return (
    <Sheet title={category ? 'Категория' : 'Своя категория'} onClose={onClose}>
      {!category?.locked && <TextField label="Название" value={name} onChange={setName} placeholder="Например, Кошка" />}
      <div className="color-row" role="radiogroup" aria-label="Цвет">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-label="Цвет"
            className={`color-dot${c === color ? ' is-on' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="button" className="btn btn-primary btn-wide" onClick={() => onSave(name, color)}>
        Сохранить
      </button>
      {onDelete && (
        <button type="button" className="link-btn danger" onClick={onDelete}>
          Удалить категорию (траты перейдут в «Другое»)
        </button>
      )}
    </Sheet>
  );
}
