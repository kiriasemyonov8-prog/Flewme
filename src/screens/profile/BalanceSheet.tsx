import { useState } from 'react';
import type { ISODate } from '../../core/dates';
import { formatRub, parseRubInput, toRubInput } from '../../core/format';
import type { Kopecks } from '../../core/money';
import { paymentOccurrences } from '../../core/schedule';
import type { Account, AccountKind, FinanceData } from '../../core/types';
import { DateField } from '../../ui/Calendar';
import { AmountPad, TextField } from '../../ui/Form';
import { Sheet } from '../../ui/Sheet';

const TITLES: Record<AccountKind, string> = {
  main: 'Основной счёт',
  savings: 'Накопления',
  other: 'Другой счёт',
};

/**
 * Остаток счёта на дату. Для основного счёта: если в эту дату есть обязательный платёж,
 * спрашиваем, списан ли он уже, чтобы не вычесть его дважды.
 */
export function BalanceSheet({
  data,
  today,
  account,
  kind,
  onSave,
  onDelete,
  onClose,
}: {
  data: FinanceData;
  today: ISODate;
  account?: Account;
  kind: AccountKind;
  onSave: (v: { amount: Kopecks; asOf: ISODate; name: string; paidOnAsOf: string[] }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(account ? toRubInput(account.amount) : '');
  const [asOf, setAsOf] = useState(today);
  const [name, setName] = useState(account?.name ?? '');
  const [paid, setPaid] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const duePayments = kind === 'main' ? paymentOccurrences(data.payments, asOf, asOf) : [];

  function save() {
    // Ноль на счёте — тоже честный остаток.
    const amount = text === '' || text === '0' ? (0 as Kopecks) : parseRubInput(text);
    if (amount === null) return setError(true);
    onSave({ amount, asOf, name, paidOnAsOf: paid.filter((k) => duePayments.some((p) => p.key === k)) });
  }

  return (
    <Sheet title={account ? (kind === 'other' ? account.name : TITLES[kind]) : `Добавить: ${TITLES[kind].toLowerCase()}`} onClose={onClose}>
      {kind === 'other' && <TextField label="Название" value={name} onChange={setName} placeholder="Например, карта мамы" />}
      <p className="hint">Сколько сейчас на счёте — посмотрите в приложении банка.</p>
      <AmountPad
        fields={[{ label: 'Сумма', text }]}
        active={0}
        onActivate={() => {}}
        onChange={(_, update) => {
          setText(update);
          setError(false);
        }}
      />
      {error && <p className="field-error">Введите сумму</p>}
      <DateField label="Сумма верна на" value={asOf} onChange={setAsOf} today={today} max={today} />
      {duePayments.map((p) => (
        <label key={p.key} className="check-row">
          <input
            type="checkbox"
            checked={paid.includes(p.key)}
            onChange={(e) => setPaid(e.target.checked ? [...paid, p.key] : paid.filter((k) => k !== p.key))}
          />
          <span>
            {p.name} {formatRub(p.amount)} в этот день уже списан с этой суммы
          </span>
        </label>
      ))}
      <button type="button" className="btn btn-primary btn-wide" onClick={save}>
        Сохранить
      </button>
      {onDelete && (
        <button type="button" className="link-btn danger" onClick={onDelete}>
          Удалить счёт
        </button>
      )}
    </Sheet>
  );
}
