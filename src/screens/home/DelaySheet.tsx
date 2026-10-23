import { useState } from 'react';
import { addDays, type ISODate } from '../../core/dates';
import { DateField } from '../../ui/Calendar';
import { Sheet } from '../../ui/Sheet';

/**
 * «Задерживается» / «Перенести»: к какой дате теперь ждём доход (3.25)
 * или когда пройдёт не прошедший платёж (3.26, п. 20).
 */
export function DelaySheet({
  name,
  today,
  payment = false,
  onSave,
  onClose,
}: {
  name: string;
  today: ISODate;
  payment?: boolean;
  onSave: (until: ISODate) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(addDays(today, 1));
  return (
    <Sheet title={`${name}: ${payment ? 'когда спишется?' : 'когда теперь ждёте?'}`} onClose={onClose}>
      <DateField label={payment ? 'Спишется' : 'Ждём к'} value={date} onChange={setDate} today={today} min={today} />
      <p className="hint">
        {payment
          ? 'До этой даты платёж останется в резерве: Флюми не будет считать эти деньги свободными.'
          : 'До этой даты лимит останется прежним, а потом Флюми снова спросит.'}
      </p>
      <button type="button" className="btn btn-primary btn-wide" onClick={() => onSave(date)}>
        Сохранить
      </button>
    </Sheet>
  );
}
