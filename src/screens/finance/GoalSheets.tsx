import { useState } from 'react';
import { addDays, type ISODate } from '../../core/dates';
import { formatDayMonth, formatPermille, formatRub, formatRubWhole, parseRubInput, toRubInput } from '../../core/format';
import type { LimitOk } from '../../core/limit';
import type { Kopecks } from '../../core/money';
import { previewWithdrawal } from '../../core/purchase';
import type { Goal } from '../../core/types';
import { DateField } from '../../ui/Calendar';
import { AmountPad, TextField, Toggle } from '../../ui/Form';
import { Sheet } from '../../ui/Sheet';

/** «Примерно 3 недели» из числа дней. */
export function approxDuration(days: number): string {
  if (days < 7) return `${days} дн.`;
  if (days < 60) {
    const w = Math.round(days / 7);
    return `${w} ${w === 1 ? 'неделю' : w < 5 ? 'недели' : 'недель'}`;
  }
  const m = Math.round(days / 30);
  return `${m} ${m === 1 ? 'месяц' : m < 5 ? 'месяца' : 'месяцев'}`;
}

export function GoalSheet({
  goal,
  today,
  newId,
  onSave,
  onDelete,
  onClose,
}: {
  goal?: Goal;
  today: ISODate;
  newId: string;
  onSave: (g: Goal) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(goal?.name ?? '');
  const [text, setText] = useState(goal ? toRubInput(goal.target) : '');
  const [hasDeadline, setHasDeadline] = useState(Boolean(goal?.deadline));
  const [deadline, setDeadline] = useState(goal?.deadline ?? addDays(today, 365));
  const [error, setError] = useState(false);

  return (
    <Sheet title={goal ? 'Цель' : 'Новая цель'} onClose={onClose}>
      <TextField label="На что копим" value={name} onChange={setName} placeholder="Например, отпуск" />
      <AmountPad
        fields={[{ label: 'Сколько нужно', text }]}
        active={0}
        onActivate={() => {}}
        onChange={(_, u) => {
          setText(u);
          setError(false);
        }}
      />
      {error && <p className="field-error">Введите сумму цели</p>}
      <Toggle label="Есть срок" checked={hasDeadline} onChange={setHasDeadline} />
      {hasDeadline && <DateField label="К какой дате" value={deadline} onChange={setDeadline} today={today} min={today} />}
      <p className="hint">Цель копится на накопительном счёте: прогресс цели равен сумме на нём.</p>
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => {
          const target = parseRubInput(text);
          if (!target) return setError(true);
          onSave({ id: goal?.id ?? newId, name: name.trim() || 'Цель', target, deadline: hasDeadline ? deadline : undefined });
        }}
      >
        Сохранить
      </button>
      {onDelete && (
        <button type="button" className="link-btn danger" onClick={onDelete}>
          Удалить цель
        </button>
      )}
    </Sheet>
  );
}

/** «Взять из накоплений»: сразу видна цена — лимит и сдвиг цели (SPEC, раздел 7). */
export function WithdrawSheet({
  limit,
  savings,
  goal,
  onConfirm,
  onClose,
}: {
  limit: LimitOk;
  savings: Kopecks;
  goal?: Goal;
  onConfirm: (amount: Kopecks) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const amount = parseRubInput(text);
  const preview = amount ? previewWithdrawal(limit, amount, savings, goal) : null;

  return (
    <Sheet title="Взять из накоплений" onClose={onClose}>
      <p className="hint">На накопительном счёте {formatRub(savings)}.</p>
      <AmountPad
        fields={[{ label: 'Сколько взять', text }]}
        active={0}
        onActivate={() => {}}
        onChange={(_, u) => {
          setText(u);
          setError(null);
        }}
      />
      {preview && (
        <div className="price-box">
          <p>
            Лимит вырастет с <b className="num">{formatRubWhole(preview.limitFrom)}</b> до{' '}
            <b className="num">{formatRubWhole(preview.limitTo)}</b> в день до {formatDayMonth(limit.horizon)}.
          </p>
          {goal && (
            <p>
              Цель «{goal.name}»: {formatPermille(preview.progressFrom)} → {formatPermille(preview.progressTo)}
              {preview.goalDelayDays !== null && preview.goalDelayDays > 0
                ? `, отодвинется примерно на ${approxDuration(preview.goalDelayDays)}`
                : ''}
              .
            </p>
          )}
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
      <p className="hint">Сначала переведите деньги в приложении банка, потом подтвердите здесь.</p>
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => {
          if (!amount) return setError('Введите сумму');
          if (amount > savings) return setError('На накопительном счёте меньше');
          onConfirm(amount);
        }}
      >
        Перевёл, подтвердить
      </button>
    </Sheet>
  );
}
