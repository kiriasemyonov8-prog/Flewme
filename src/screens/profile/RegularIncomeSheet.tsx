import { useState } from 'react';
import { parseRubInput, toRubInput } from '../../core/format';
import type { RegularIncome } from '../../core/types';
import { AmountPad, DayGrid, Segmented, TextField } from '../../ui/Form';
import { Sheet } from '../../ui/Sheet';

type AmountKind = 'fixed' | 'range';
type ScheduleKind = 'days' | 'window';

/** Регулярный доход: вводится один раз, повторяется каждый месяц (SPEC, раздел 8). */
export function RegularIncomeSheet({
  income,
  newId,
  onSave,
  onDelete,
  onClose,
}: {
  income?: RegularIncome;
  newId: string;
  onSave: (income: RegularIncome) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(income?.name ?? 'Зарплата');
  const [amountKind, setAmountKind] = useState<AmountKind>(income && income.min !== income.max ? 'range' : 'fixed');
  const [texts, setTexts] = useState([income ? toRubInput(income.min) : '', income ? toRubInput(income.max) : '']);
  const [active, setActive] = useState(0);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(income?.schedule.type ?? 'days');
  const [days, setDays] = useState<number[]>(
    income?.schedule.type === 'days'
      ? income.schedule.days
      : income?.schedule.type === 'window'
        ? [income.schedule.fromDay, income.schedule.toDay]
        : [],
  );
  const [error, setError] = useState<string | null>(null);

  function toggleDay(d: number) {
    setError(null);
    if (scheduleKind === 'days') {
      setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
    } else {
      // Окно: первое нажатие — начало, второе — конец; третье начинает заново.
      setDays((prev) => (prev.length === 1 ? [Math.min(prev[0], d), Math.max(prev[0], d)] : [d]));
    }
  }

  function save() {
    const min = parseRubInput(texts[0]);
    const max = amountKind === 'range' ? parseRubInput(texts[1]) : min;
    if (!min || !max) return setError('Введите сумму');
    if (max < min) return setError('Верхняя граница меньше нижней');
    if (scheduleKind === 'days' && days.length === 0) return setError('Выберите хотя бы один день');
    if (scheduleKind === 'window' && days.length !== 2) return setError('Выберите первый и последний день окна');
    onSave({
      id: income?.id ?? newId,
      name: name.trim() || 'Доход',
      min,
      max,
      schedule: scheduleKind === 'days' ? { type: 'days', days } : { type: 'window', fromDay: days[0], toDay: days[1] },
    });
  }

  const fields =
    amountKind === 'fixed'
      ? [{ label: 'Сумма', text: texts[0] }]
      : [
          { label: 'От', text: texts[0] },
          { label: 'До', text: texts[1] },
        ];

  return (
    <Sheet title={income ? 'Регулярный доход' : 'Новый регулярный доход'} onClose={onClose}>
      <TextField label="Название" value={name} onChange={setName} />
      <div className="sub-title">Когда приходит</div>
      <Segmented
        label="Когда приходит"
        value={scheduleKind}
        onChange={(v) => {
          setScheduleKind(v);
          setDays([]);
        }}
        options={[
          { value: 'days', label: 'В определённые дни' },
          { value: 'window', label: 'Плавает в окне дат' },
        ]}
      />
      <p className="hint">
        {scheduleKind === 'days'
          ? 'Отметьте дни месяца, например 5 и 20.'
          : 'Отметьте первый и последний день окна, например 10 и 20. Лимит считается по последнему дню и нижней сумме.'}
      </p>
      <DayGrid
        label="Дни месяца"
        selected={scheduleKind === 'window' && days.length === 2 ? range(days[0], days[1]) : days}
        onToggle={toggleDay}
      />
      <p className="schedule-summary">{scheduleSummary(scheduleKind, days)}</p>

      <div className="sub-title">Сколько</div>
      <Segmented
        label="Сумма"
        value={amountKind}
        onChange={(v) => {
          setAmountKind(v);
          setActive(0);
        }}
        options={[
          { value: 'fixed', label: 'Точная сумма' },
          { value: 'range', label: 'Диапазон' },
        ]}
      />
      <AmountPad
        fields={fields}
        active={active}
        onActivate={setActive}
        onChange={(i, update) => {
          setTexts((t) => t.map((x, j) => (j === i ? update(x) : x)));
          setError(null);
        }}
      />
      {error && <p className="field-error">{error}</p>}
      <button type="button" className="btn btn-primary btn-wide" onClick={save}>
        Сохранить
      </button>
      {onDelete && (
        <button type="button" className="link-btn danger" onClick={onDelete}>
          Удалить доход
        </button>
      )}
    </Sheet>
  );
}

function scheduleSummary(kind: ScheduleKind, days: number[]): string {
  if (days.length === 0) return 'Дни пока не выбраны';
  if (kind === 'days') return `Каждый месяц: ${days.join(' и ')} числа`;
  if (days.length === 1) return `Начало окна: ${days[0]} число. Теперь отметьте последний день.`;
  return `Каждый месяц между ${days[0]} и ${days[1]} числом`;
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
