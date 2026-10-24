import { useState } from 'react';
import { OTHER_ID } from '../../core/categories';
import { addDays, type ISODate } from '../../core/dates';
import { formatRub, parseRubInput, toRubInput } from '../../core/format';
import { min, type Kopecks } from '../../core/money';
import type { FinanceData } from '../../core/types';
import { DateField } from '../../ui/Calendar';
import { AmountPad } from '../../ui/Form';
import { Sheet } from '../../ui/Sheet';

/**
 * Обновление остатка показало, что денег заметно меньше, чем по записям (3.26, п. 13):
 * предлагаем разнести неучтённые траты по категориям. Можно частями.
 */
export function GapSheet({
  data,
  gap,
  onRecord,
  onClose,
}: {
  data: FinanceData;
  gap: Kopecks;
  onRecord: (categoryId: string, amount: Kopecks, note?: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(toRubInput(gap));
  const [categoryId, setCategoryId] = useState(data.lastCategoryId ?? data.categories[0].id);
  const [error, setError] = useState(false);

  return (
    <Sheet title="Похоже, не всё записано" onClose={onClose}>
      <p className="close-question">
        По записям на счёте должно быть больше: не записано около <b className="num">{formatRub(gap)}</b> трат. Разнести по
        категориям?
      </p>
      <div className="chips" role="radiogroup" aria-label="Категория">
        {data.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={c.id === categoryId}
            className={`chip${c.id === categoryId ? ' is-on' : ''}`}
            onClick={() => setCategoryId(c.id)}
          >
            <span className="chip-dot" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>
      <AmountPad
        fields={[{ label: 'Сколько', text }]}
        active={0}
        onActivate={() => {}}
        onChange={(_, u) => {
          setText(u);
          setError(false);
        }}
      />
      {error && <p className="field-error">Введите сумму</p>}
      <p className="hint">Траты запишутся вчерашним днём: остаток, который вы указали, они не изменят.</p>
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={() => onRecord(OTHER_ID, gap, 'Неучтённое')}>
          Всё в «Другое»
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const amount = parseRubInput(text);
            if (!amount) return setError(true);
            onRecord(categoryId, min(amount, gap));
            setText('');
          }}
        >
          Записать
        </button>
      </div>
    </Sheet>
  );
}

/** «Дотянуть до»: без регулярного дохода — до какой даты должны хватить деньги (3.26, п. 8). */
export function StretchSheet({
  today,
  initial,
  onSave,
  onClose,
}: {
  today: ISODate;
  initial?: ISODate;
  onSave: (until: ISODate | undefined) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initial && initial > today ? initial : addDays(today, 30));
  return (
    <Sheet title="Дотянуть до" onClose={onClose}>
      <p className="hint">
        Регулярного дохода нет, поэтому Флюми делит деньги на дни до выбранной даты. Разовые доходы прибавятся, когда
        придут.
      </p>
      <DateField label="Денег должно хватить до" value={date} onChange={setDate} today={today} min={addDays(today, 1)} />
      <button type="button" className="btn btn-primary btn-wide" onClick={() => onSave(date)}>
        Сохранить
      </button>
      {initial && (
        <button type="button" className="link-btn" onClick={() => onSave(undefined)}>
          Всегда на 30 дней вперёд
        </button>
      )}
    </Sheet>
  );
}
