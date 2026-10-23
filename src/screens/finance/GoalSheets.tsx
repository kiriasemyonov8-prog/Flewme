import { useState } from 'react';
import { addDays, type ISODate } from '../../core/dates';
import { formatDayMonth, formatPermille, formatRub, formatRubWhole, parseRubInput, toRubInput } from '../../core/format';
import { currentBalance } from '../../core/balance';
import type { LimitOk } from '../../core/limit';
import { ZERO, max, type Kopecks } from '../../core/money';
import { previewWithdrawal } from '../../core/purchase';
import type { Account, FinanceData, Goal } from '../../core/types';
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

export interface GoalForm {
  id: string;
  name: string;
  target: Kopecks;
  deadline?: ISODate;
  /** Только для новой цели: сколько уже лежит на её счёте. */
  initial: Kopecks;
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
  onSave: (g: GoalForm) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(goal?.name ?? '');
  const [texts, setTexts] = useState([goal ? toRubInput(goal.target) : '', '']);
  const [active, setActive] = useState(0);
  const [hasDeadline, setHasDeadline] = useState(Boolean(goal?.deadline));
  const [deadline, setDeadline] = useState(goal?.deadline ?? addDays(today, 365));
  const [error, setError] = useState(false);

  const fields = goal
    ? [{ label: 'Сколько нужно', text: texts[0] }]
    : [
        { label: 'Сколько нужно', text: texts[0] },
        { label: 'Уже накоплено', text: texts[1] },
      ];

  return (
    <Sheet title={goal ? 'Цель' : 'Новая цель'} onClose={onClose}>
      <TextField label="На что копим" value={name} onChange={setName} placeholder="Например, отпуск" />
      <AmountPad
        fields={fields}
        active={active}
        onActivate={setActive}
        onChange={(i, u) => {
          setTexts((t) => t.map((x, j) => (j === i ? u(x) : x)));
          setError(false);
        }}
      />
      {error && <p className="field-error">Введите сумму цели</p>}
      <Toggle label="Есть срок" checked={hasDeadline} onChange={setHasDeadline} />
      {hasDeadline && <DateField label="К какой дате" value={deadline} onChange={setDeadline} today={today} min={today} />}
      <p className="hint">
        {goal
          ? 'Чем ближе срок, тем раньше цель получает свою долю откладывания. Цели без срока — в конце очереди.'
          : 'У цели будет свой накопительный счёт: прогресс равен сумме на нём. Чем ближе срок, тем раньше цель получает свою долю откладывания; цели без срока — в конце очереди.'}
      </p>
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => {
          const target = parseRubInput(texts[0]);
          if (!target) return setError(true);
          onSave({
            id: goal?.id ?? newId,
            name: name.trim() || 'Цель',
            target,
            deadline: hasDeadline ? deadline : undefined,
            initial: parseRubInput(texts[1]) ?? (0 as Kopecks),
          });
        }}
      >
        Сохранить
      </button>
      {onDelete && (
        <button type="button" className="link-btn danger" onClick={onDelete}>
          Удалить цель (счёт с деньгами останется в профиле)
        </button>
      )}
    </Sheet>
  );
}

/**
 * «Взять из накоплений» с накопительного счёта (с целью или без, 3.26): сразу видна цена —
 * лимит и сдвиг цели (SPEC, раздел 7).
 */
export function WithdrawSheet({
  data,
  limit,
  account,
  today,
  onConfirm,
  onClose,
}: {
  data: FinanceData;
  limit: LimitOk;
  account: Account;
  today: ISODate;
  onConfirm: (amount: Kopecks) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const goal: Goal | undefined = data.goals.find((g) => g.accountId === account.id);
  const balance = max(ZERO, currentBalance(account, data, today));
  const amount = parseRubInput(text);
  const preview = amount ? previewWithdrawal(data, limit, account.id, amount, today) : null;

  return (
    <Sheet title={`Взять из «${goal?.name ?? account.name}»`} onClose={onClose}>
      <p className="hint">На счёте {formatRub(balance)}.</p>
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
          if (amount > balance) return setError('На счёте меньше');
          onConfirm(amount);
        }}
      >
        Перевёл, подтвердить
      </button>
    </Sheet>
  );
}
