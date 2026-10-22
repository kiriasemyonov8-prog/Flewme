import { useState } from 'react';
import { addMonths, monthOf, type ISODate, type ISOMonth } from '../../core/dates';
import { parseRubInput, toRubInput } from '../../core/format';
import type { Kopecks } from '../../core/money';
import { paymentAmountFor } from '../../core/schedule';
import type { FixedPayment } from '../../core/types';
import { AmountPad, DayGrid, Segmented, TextField } from '../../ui/Form';
import { Sheet } from '../../ui/Sheet';

const MONTHS_PREP = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function monthLabel(m: ISOMonth): string {
  return `с ${MONTHS_PREP[Number(m.slice(5)) - 1]}`;
}

/** Обязательный платёж: название, сумма, день месяца. Изменение суммы — с выбранного месяца. */
export function PaymentSheet({
  payment,
  today,
  onSave,
  onDelete,
  onClose,
}: {
  payment?: FixedPayment;
  today: ISODate;
  onSave: (v: { name: string; day: number; amount: Kopecks; fromMonth: ISOMonth; amountChanged: boolean }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const thisMonth = monthOf(today);
  const current = payment ? paymentAmountFor(payment, thisMonth) : null;
  const [name, setName] = useState(payment?.name ?? '');
  const [text, setText] = useState(current ? toRubInput(current) : '');
  const [day, setDay] = useState<number | null>(payment?.day ?? null);
  const [fromMonth, setFromMonth] = useState<ISOMonth>(thisMonth);
  const [error, setError] = useState<string | null>(null);
  const amount = parseRubInput(text);
  const amountChanged = !payment || amount !== current;

  function save() {
    if (!amount) return setError('Введите сумму');
    if (!day) return setError('Выберите день месяца');
    onSave({ name, day, amount, fromMonth, amountChanged });
  }

  return (
    <Sheet title={payment ? payment.name : 'Новый обязательный платёж'} onClose={onClose}>
      <TextField label="Название" value={name} onChange={setName} placeholder="Например, квартира" />
      <AmountPad
        fields={[{ label: 'Сумма в месяц', text }]}
        active={0}
        onActivate={() => {}}
        onChange={(_, update) => {
          setText(update);
          setError(null);
        }}
      />
      {payment && amountChanged && (
        <>
          <p className="hint">Новая сумма будет действовать с выбранного месяца, прошлые месяцы не изменятся.</p>
          <Segmented
            label="С какого месяца"
            value={fromMonth}
            onChange={setFromMonth}
            options={[
              { value: thisMonth, label: monthLabel(thisMonth) },
              { value: addMonths(thisMonth, 1), label: monthLabel(addMonths(thisMonth, 1)) },
            ]}
          />
        </>
      )}
      <p className="hint">День списания. Если в месяце нет такого дня (например, 31-го), платёж будет в последний день.</p>
      <DayGrid
        label="День месяца"
        selected={day ? [day] : []}
        onToggle={(d) => {
          setDay(d);
          setError(null);
        }}
      />
      {error && <p className="field-error">{error}</p>}
      <button type="button" className="btn btn-primary btn-wide" onClick={save}>
        Сохранить
      </button>
      {onDelete && (
        <button type="button" className="link-btn danger" onClick={onDelete}>
          Удалить платёж
        </button>
      )}
    </Sheet>
  );
}
