import { Delete } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'] as const;

/** Экранная цифровая клавиатура для сумм (SPEC, раздел 4). Значение — строка вида «1050,5». */
export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function press(key: (typeof KEYS)[number]) {
    if (key === 'back') return onChange(value.slice(0, -1));
    if (key === ',') {
      if (value.includes(',')) return;
      return onChange((value || '0') + ',');
    }
    const [whole, frac] = value.split(',');
    if (frac !== undefined && frac.length >= 2) return;
    if (frac === undefined && whole.length >= 9) return;
    onChange(value === '0' ? key : value + key);
  }

  return (
    <div className="keypad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="key"
          aria-label={k === 'back' ? 'Стереть' : k === ',' ? 'Запятая' : k}
          onClick={() => press(k)}
        >
          {k === 'back' ? <Delete size={24} /> : k}
        </button>
      ))}
    </div>
  );
}

/** Крупное отображение вводимой суммы. */
export function AmountDisplay({ value }: { value: string }) {
  const [whole, frac] = value.split(',');
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (
    <div className="amount-display num" aria-live="polite">
      {grouped}
      {frac !== undefined && `,${frac}`}
      <span className="amount-currency"> ₽</span>
    </div>
  );
}
