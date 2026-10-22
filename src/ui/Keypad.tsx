import { Delete } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'] as const;

type Key = (typeof KEYS)[number];

function apply(value: string, key: Key): string {
  if (key === 'back') return value.slice(0, -1);
  if (key === ',') return value.includes(',') ? value : (value || '0') + ',';
  const [whole, frac] = value.split(',');
  if (frac !== undefined && frac.length >= 2) return value;
  if (frac === undefined && whole.length >= 9) return value;
  return value === '0' ? key : value + key;
}

/**
 * Экранная цифровая клавиатура для сумм (SPEC, раздел 4). Значение — строка вида «1050,5».
 * Изменение передаётся функцией от прежнего значения, чтобы быстрые нажатия подряд не терялись.
 */
export function Keypad({ onChange }: { onChange: (update: (prev: string) => string) => void }) {
  function press(key: Key) {
    onChange((prev) => apply(prev, key));
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
