import { useState } from 'react';
import type { ExpenseInput } from '../../core/actions';
import type { ISODate } from '../../core/dates';
import { formatDayMonth, parseRubInput } from '../../core/format';
import type { FinanceData } from '../../core/types';
import { AmountDisplay, Keypad } from '../../ui/Keypad';
import { Sheet } from '../../ui/Sheet';

export function ExpenseSheet({
  data,
  date,
  today,
  onSave,
  onClose,
}: {
  data: FinanceData;
  date: ISODate;
  today: ISODate;
  onSave: (e: ExpenseInput) => void;
  onClose: () => void;
}) {
  const main = data.accounts.find((a) => a.kind === 'main');
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState(data.lastCategoryId ?? data.categories[0].id);
  const [accountId, setAccountId] = useState(main?.id ?? data.accounts[0]?.id);
  const [error, setError] = useState(false);

  function save() {
    const amount = parseRubInput(text);
    if (!amount || !accountId) return setError(true);
    onSave({ amount, accountId, categoryId, date });
  }

  return (
    <Sheet title={date === today ? 'Записать трату' : `Трата за ${formatDayMonth(date)}`} onClose={onClose}>
      <AmountDisplay value={text} />
      {error && <p className="field-error">Введите сумму</p>}

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

      {data.accounts.length > 1 && (
        <div className="chips chips-small" role="radiogroup" aria-label="Счёт">
          {data.accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a.id === accountId}
              className={`chip${a.id === accountId ? ' is-on' : ''}`}
              onClick={() => setAccountId(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
      {accountId !== main?.id && <p className="hint">Траты не с основного счёта на дневной лимит не влияют.</p>}

      <Keypad
        value={text}
        onChange={(v) => {
          setText(v);
          setError(false);
        }}
      />
      <button type="button" className="btn btn-primary btn-wide" onClick={save}>
        Записать
      </button>
    </Sheet>
  );
}
