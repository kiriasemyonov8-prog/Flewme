// Выбор времени барабанами, как в будильнике iPhone: часы и минуты прокручиваются и защёлкиваются.
import { useEffect, useRef } from 'react';

const ITEM = 44; // высота строки барабана, px
const VISIBLE = 5; // видно строк: выбранная по центру и по две сверху и снизу

function Wheel({ count, value, onChange, label }: { count: number; value: number; onChange: (v: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Начальная прокрутка только при открытии.
    if (ref.current) ref.current.scrollTop = value * ITEM;
  }, []);

  function onScroll() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!ref.current) return;
      const i = Math.max(0, Math.min(count - 1, Math.round(ref.current.scrollTop / ITEM)));
      if (i !== value) onChange(i);
    }, 90);
  }

  function step(delta: number) {
    const i = (value + delta + count) % count;
    onChange(i);
    ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' });
  }

  return (
    <div
      ref={ref}
      className="wheel"
      role="spinbutton"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={count - 1}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') step(-1);
        if (e.key === 'ArrowDown') step(1);
      }}
      style={{ height: ITEM * VISIBLE, paddingBlock: ITEM * 2 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`wheel-item num${i === value ? ' is-on' : ''}`}
          style={{ height: ITEM }}
          onClick={() => {
            onChange(i);
            ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' });
          }}
        >
          {String(i).padStart(2, '0')}
        </div>
      ))}
    </div>
  );
}

/** Время 'HH:MM' двумя барабанами. */
export function TimeWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value.split(':').map(Number);
  // Последнее значение держим в ref: оба барабана могут остановиться почти одновременно.
  const latest = useRef(value);
  latest.current = value;
  function set(part: 0 | 1, v: number) {
    const parts = latest.current.split(':');
    parts[part] = String(v).padStart(2, '0');
    latest.current = parts.join(':');
    onChange(latest.current);
  }
  return (
    <div className="time-wheel">
      <div className="wheel-band" style={{ top: ITEM * 2, height: ITEM }} aria-hidden />
      <Wheel count={24} value={h} onChange={(v) => set(0, v)} label="Часы" />
      <span className="wheel-colon">:</span>
      <Wheel count={60} value={m} onChange={(v) => set(1, v)} label="Минуты" />
    </div>
  );
}
