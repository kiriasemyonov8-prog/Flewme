import { useState } from 'react';
import { addDays, type ISODate } from '../../core/dates';
import type { IncomeOccurrence } from '../../core/schedule';
import { DateField } from '../../ui/Calendar';
import { Sheet } from '../../ui/Sheet';

/** «Задерживается» / «Перенести»: к какой дате теперь ждём доход (3.25). */
export function DelaySheet({
  income,
  today,
  onSave,
  onClose,
}: {
  income: IncomeOccurrence;
  today: ISODate;
  onSave: (until: ISODate) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(addDays(today, 1));
  return (
    <Sheet title={`${income.name}: когда теперь ждёте?`} onClose={onClose}>
      <DateField label="Ждём к" value={date} onChange={setDate} today={today} min={today} />
      <p className="hint">До этой даты лимит останется прежним, а потом Флюми снова спросит.</p>
      <button type="button" className="btn btn-primary btn-wide" onClick={() => onSave(date)}>
        Сохранить
      </button>
    </Sheet>
  );
}
