import { useState } from 'react';
import { incomesToConfirm } from '../../core/actions';
import { currentBalance } from '../../core/balance';
import type { ISODate } from '../../core/dates';
import { formatRub, parseRubInput, toRubInput } from '../../core/format';
import type { Kopecks } from '../../core/money';
import { dataPayments } from '../../core/schedule';
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
  onSave: (v: {
    amount: Kopecks;
    asOf: ISODate;
    name: string;
    paidOnAsOf: string[];
    /** Ожидаемый доход уже пришёл и вошёл в эту сумму (3.25). */
    receivedIncome?: { key: string; amount: Kopecks };
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  // Сейчас на счёте — с учётом записанных трат и доходов, а не сумма последней сверки (3.33)
  const [text, setText] = useState(account ? toRubInput(currentBalance(account, data, today)) : '');
  const [asOf, setAsOf] = useState(today);
  const [name, setName] = useState(account?.name ?? '');
  const [paid, setPaid] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [received, setReceived] = useState(false);
  const [incomeText, setIncomeText] = useState('');
  const [active, setActive] = useState(0);
  const duePayments = kind === 'main' ? dataPayments(data, asOf, asOf) : [];
  // Ожидаемый доход уже наступил и не подтверждён: возможно, он уже в этой сумме.
  const dueIncome = kind === 'main' && account ? (incomesToConfirm(data, asOf).find((o) => o.early <= asOf) ?? null) : null;

  function save() {
    // Ноль на счёте — тоже честный остаток.
    const amount = text === '' || text === '0' ? (0 as Kopecks) : parseRubInput(text);
    if (amount === null) return setError(true);
    let receivedIncome: { key: string; amount: Kopecks } | undefined;
    if (dueIncome && received) {
      const incomeAmount = parseRubInput(incomeText);
      if (!incomeAmount) {
        setActive(1);
        return setError(true);
      }
      receivedIncome = { key: dueIncome.key, amount: incomeAmount };
    }
    onSave({ amount, asOf, name, paidOnAsOf: paid.filter((k) => duePayments.some((p) => p.key === k)), receivedIncome });
  }

  return (
    <Sheet title={account ? account.name : `Добавить: ${TITLES[kind].toLowerCase()}`} onClose={onClose}>
      {kind !== 'main' && (
        <TextField
          label="Название"
          value={name}
          onChange={setName}
          placeholder={kind === 'other' ? 'Например, карта мамы' : TITLES[kind]}
        />
      )}
      {kind !== 'other' && (
        <p className="hint">
          {kind === 'main'
            ? 'С этого счёта считается дневной лимит.'
            : 'Здесь копится цель: прогресс цели равен сумме на этом счёте.'}
        </p>
      )}
      <p className="hint">Сколько сейчас на счёте — посмотрите в приложении банка.</p>
      <AmountPad
        fields={
          dueIncome && received
            ? [
                { label: 'На счёте', text },
                { label: `${dueIncome.name}: пришло`, text: incomeText },
              ]
            : [{ label: 'Сумма', text }]
        }
        active={dueIncome && received ? active : 0}
        onActivate={setActive}
        onChange={(i, update) => {
          if (i === 1) setIncomeText(update);
          else setText(update);
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
      {dueIncome && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={received}
            onChange={(e) => {
              setReceived(e.target.checked);
              if (e.target.checked) {
                setIncomeText(String(Math.floor(dueIncome.min / 100)));
                setActive(1);
              } else setActive(0);
            }}
          />
          <span>«{dueIncome.name}» уже пришла и есть в этой сумме</span>
        </label>
      )}
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
