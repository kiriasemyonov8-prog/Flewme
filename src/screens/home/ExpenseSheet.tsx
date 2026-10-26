import { Plus } from 'lucide-react';
import { useState } from 'react';
import { recentDuplicate, type ExpenseInput } from '../../core/actions';
import { MAX_CATEGORIES } from '../../core/categories';
import type { ISODate } from '../../core/dates';
import { formatDayMonth, formatRub, parseRubInput } from '../../core/format';
import type { FinanceData } from '../../core/types';
import { newId } from '../../state/useFinance';
import { DateField } from '../../ui/Calendar';
import { AmountDisplay, Keypad } from '../../ui/Keypad';
import { Sheet } from '../../ui/Sheet';

export function ExpenseSheet({
  data,
  date: initialDate,
  today,
  onSave,
  onAddCategory,
  onClose,
}: {
  data: FinanceData;
  date: ISODate;
  today: ISODate;
  onSave: (e: ExpenseInput) => void;
  /** Добавить свою категорию; возвращает текст ошибки или null. */
  onAddCategory: (id: string, name: string) => string | null;
  onClose: () => void;
}) {
  const main = data.accounts.find((a) => a.kind === 'main');
  const [text, setText] = useState('');
  const [date, setDate] = useState(initialDate);
  const [categoryId, setCategoryId] = useState(data.lastCategoryId ?? data.categories[0].id);
  const [accountId, setAccountId] = useState(main?.id ?? data.accounts[0]?.id);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ e: ExpenseInput; at: number } | null>(null);

  function save() {
    const amount = parseRubInput(text);
    if (!accountId) return setError('Сначала укажите основной счёт в профиле');
    if (!amount) return setError('Введите сумму');
    const e = { amount, accountId, categoryId, date };
    // Та же трата только что записана — переспросим (3.26, п. 19).
    const dup = recentDuplicate(data, e, Date.now());
    if (dup) return setDuplicate({ e, at: dup.createdAt });
    onSave(e);
  }

  if (duplicate) {
    const at = new Date(duplicate.at);
    const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    return (
      <Sheet title="Такая трата уже есть" onClose={onClose}>
        <p className="close-question">
          {formatRub(duplicate.e.amount)} в «{data.categories.find((c) => c.id === duplicate.e.categoryId)?.name ?? 'Другое'}» уже
          записана в {time}. Записать ещё одну?
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Не надо
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(duplicate.e)}>
            Записать ещё
          </button>
        </div>
      </Sheet>
    );
  }

  function addCategory() {
    const id = newId();
    const err = onAddCategory(id, newCategory ?? '');
    if (err) return setCategoryError(err);
    setCategoryId(id);
    setNewCategory(null);
    setCategoryError(null);
  }

  return (
    <Sheet title={initialDate === today ? 'Записать трату' : `Трата за ${formatDayMonth(initialDate)}`} onClose={onClose}>
      {/* Сумма закреплена сверху окна: её видно, пока нажимают цифры внизу (3.35) */}
      <div className="sheet-sticky-amount">
        <AmountDisplay value={text} />
      </div>
      {error && <p className="field-error">{error}</p>}

      {/* Категории — одной строкой с прокруткой вбок, чтобы окно помещалось на экране (3.35) */}
      <div className="chips chips-scroll" role="radiogroup" aria-label="Категория">
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
        {newCategory === null && data.categories.length < MAX_CATEGORIES && (
          <button type="button" className="chip chip-add" onClick={() => setNewCategory('')}>
            <Plus size={16} aria-hidden /> Своя
          </button>
        )}
      </div>
      {newCategory !== null && (
        <div className="inline-add">
          <input
            className="text-field"
            autoFocus
            placeholder="Название категории"
            value={newCategory}
            onChange={(e) => {
              setNewCategory(e.target.value);
              setCategoryError(null);
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={addCategory}>
            Добавить
          </button>
        </div>
      )}
      {categoryError && <p className="field-error">{categoryError}</p>}

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

      <DateField label="Дата" value={date} onChange={setDate} today={today} max={today} />

      <Keypad
        onChange={(update) => {
          setText(update);
          setError(null);
        }}
      />
      <button type="button" className="btn btn-primary btn-wide" onClick={save}>
        Записать
      </button>
    </Sheet>
  );
}
