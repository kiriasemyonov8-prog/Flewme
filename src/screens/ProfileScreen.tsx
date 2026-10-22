import { Download, Minus, Plus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { exportBackup, importBackup, type ImportError } from '../core/backup';
import { demoData } from '../core/demo';
import { formatDayMonth, formatRub } from '../core/format';
import * as P from '../core/profile';
import { paymentAmountFor } from '../core/schedule';
import { monthOf } from '../core/dates';
import type { Account, AccountKind, FinanceData, RegularIncome } from '../core/types';
import { newId, type FinanceStore } from '../state/useFinance';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { DemoBadge } from '../ui/DemoBadge';
import { RowButton, Section, Segmented, Toggle } from '../ui/Form';
import { BalanceSheet } from './profile/BalanceSheet';
import { PaymentSheet } from './profile/PaymentSheet';
import { RegularIncomeSheet } from './profile/RegularIncomeSheet';
import { AmountSheet, CATEGORY_ERRORS, CategorySheet, OneOffSheet, TimeSheet } from './profile/SimpleSheets';

type Open =
  | null
  | { kind: 'balance'; accountKind: AccountKind; account?: Account }
  | { kind: 'income'; income?: RegularIncome }
  | { kind: 'oneOff' }
  | { kind: 'removeOneOff'; id: string; name: string }
  | { kind: 'payment'; id?: string }
  | { kind: 'transport' }
  | { kind: 'time' }
  | { kind: 'category'; id?: string }
  | { kind: 'confirm'; title: string; text: string; label: string; run: () => void };

function scheduleText(i: RegularIncome): string {
  const s = i.schedule;
  if (s.type === 'window') return `с ${s.fromDay} по ${s.toDay} число`;
  return `${s.days.join(' и ')} числа`;
}

function amountText(i: RegularIncome): string {
  return i.min === i.max ? formatRub(i.min) : `${formatRub(i.min)} – ${formatRub(i.max)}`;
}

const IMPORT_ERRORS: Record<ImportError, string> = {
  notJson: 'Этот файл не похож на копию Флюми.',
  notFlyumi: 'Этот файл не похож на копию Флюми.',
  newerVersion: 'Копия сделана более новой версией приложения.',
  broken: 'Файл копии повреждён, восстановить из него нельзя.',
};

export function ProfileScreen({ store }: { store: FinanceStore }) {
  const { data, today, update, replace } = store;
  const [open, setOpen] = useState<Open>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [lastPercent, setLastPercent] = useState(data.settings.savePercent || 30);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => setOpen(null);
  const thisMonth = monthOf(today);

  const main = data.accounts.find((a) => a.kind === 'main');
  const savings = data.accounts.find((a) => a.kind === 'savings');
  const others = data.accounts.filter((a) => a.kind === 'other');
  const confirmedOneOff = new Set(data.receipts.map((r) => r.occurrenceKey));
  const expectedOneOff = data.oneOffIncomes.filter((i) => !confirmedOneOff.has(`oneoff:${i.id}`));
  const pct = data.settings.savePercent;

  function accountRow(kind: AccountKind, account: Account | undefined, title: string) {
    return (
      <RowButton
        key={account?.id ?? kind}
        title={account?.name ?? title}
        sub={
          account
            ? `${kind === 'main' ? 'основной, ' : kind === 'savings' ? 'накопительный, ' : ''}на ${formatDayMonth(account.asOf)}`
            : 'не указан'
        }
        value={account ? formatRub(account.amount) : 'Указать'}
        onClick={() => setOpen({ kind: 'balance', accountKind: kind, account })}
      />
    );
  }

  function saveCategory(result: FinanceData | P.CategoryError) {
    if (typeof result === 'string') return setCategoryError(CATEGORY_ERRORS[result]);
    replace(result);
    close();
  }

  function download() {
    const blob = new Blob([exportBackup(data, new Date())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flyumi-kopiya-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function pickFile(file: File) {
    setFileError(null);
    const result = importBackup(await file.text());
    if (typeof result === 'string') return setFileError(IMPORT_ERRORS[result]);
    setOpen({
      kind: 'confirm',
      title: 'Восстановить из файла',
      text: 'Текущие данные будут заменены данными из копии. Продолжить?',
      label: 'Восстановить',
      run: () => replace(result),
    });
  }

  return (
    <>
      {data.isDemo && <DemoBadge />}
      <h1 className="screen-title">Профиль</h1>

      <Section title="Счета">
        {accountRow('main', main, 'Основной счёт')}
        {accountRow('savings', savings, 'Накопления')}
        {others.map((a) => accountRow('other', a, a.name))}
        <button type="button" className="add-row" onClick={() => setOpen({ kind: 'balance', accountKind: 'other' })}>
          <Plus size={18} aria-hidden /> Другой счёт
        </button>
      </Section>

      <Section title="Доходы и платежи">
        <div className="sub-title">Регулярные доходы</div>
        {data.regularIncomes.map((i) => (
          <RowButton key={i.id} title={i.name} sub={scheduleText(i)} value={amountText(i)} onClick={() => setOpen({ kind: 'income', income: i })} />
        ))}
        <button type="button" className="add-row" onClick={() => setOpen({ kind: 'income' })}>
          <Plus size={18} aria-hidden /> Регулярный доход
        </button>

        <div className="sub-title">Ожидаемые разовые доходы</div>
        {expectedOneOff.map((i) => (
          <RowButton
            key={i.id}
            title={i.name}
            sub={formatDayMonth(i.date)}
            value={formatRub(i.amount)}
            onClick={() => setOpen({ kind: 'removeOneOff', id: i.id, name: i.name })}
          />
        ))}
        <button type="button" className="add-row" onClick={() => setOpen({ kind: 'oneOff' })}>
          <Plus size={18} aria-hidden /> Разовый доход
        </button>

        <div className="sub-title">Обязательные платежи</div>
        {data.payments.map((p) => {
          const amount = paymentAmountFor(p, thisMonth) ?? p.amounts[0].amount;
          return (
            <RowButton key={p.id} title={p.name} sub={`${p.day} числа`} value={formatRub(amount)} onClick={() => setOpen({ kind: 'payment', id: p.id })} />
          );
        })}
        <button type="button" className="add-row" onClick={() => setOpen({ kind: 'payment' })}>
          <Plus size={18} aria-hidden /> Обязательный платёж
        </button>

        <RowButton
          title="Транспорт"
          sub="резервируется по дням, поездки вводить не нужно"
          value={data.settings.transportMonthly > 0 ? `${formatRub(data.settings.transportMonthly)} в мес.` : 'нет'}
          onClick={() => setOpen({ kind: 'transport' })}
        />
      </Section>

      <Section title="Откладывание">
        <Toggle
          label="Откладывать в накопления"
          checked={pct > 0}
          onChange={(on) => update((d) => P.updateSettings(d, { savePercent: on ? lastPercent : 0 }))}
        />
        {pct > 0 && (
          <div className="stepper-row">
            <span>от остатка после обязательных платежей</span>
            <div className="stepper">
              <button
                type="button"
                className="icon-btn"
                aria-label="Меньше"
                onClick={() => {
                  const v = Math.max(5, pct - 5);
                  setLastPercent(v);
                  update((d) => P.updateSettings(d, { savePercent: v }));
                }}
              >
                <Minus size={18} />
              </button>
              <span className="num stepper-value">{pct}%</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Больше"
                onClick={() => {
                  const v = Math.min(90, pct + 5);
                  setLastPercent(v);
                  update((d) => P.updateSettings(d, { savePercent: v }));
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        )}
        <div className="sub-title">Непотраченный остаток дня</div>
        <Segmented
          label="Непотраченный остаток"
          value={data.settings.leftoverMode}
          onChange={(v) => update((d) => P.updateSettings(d, { leftoverMode: v }))}
          options={[
            { value: 'otherDays', label: 'На другие дни' },
            { value: 'account', label: 'На счёт' },
          ]}
        />
        <p className="hint">
          {data.settings.leftoverMode === 'otherDays'
            ? 'Недотраченное растворяется в оставшихся днях: лимит завтра пересчитается.'
            : 'Лимит фиксирован до дохода, недотраченное копится как «сэкономлено».'}
        </p>
      </Section>

      <Section title="На чём не готов экономить" note="Флюми не будет советовать урезать эти категории. На дневной лимит анкета не влияет.">
        <div className="chips">
          {data.categories.map((c) => {
            const on = data.questionnaire.protectedCategoryIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                className={`chip${on ? ' is-on' : ''}`}
                onClick={() =>
                  update((d) =>
                    P.setProtectedCategories(
                      d,
                      on ? d.questionnaire.protectedCategoryIds.filter((x) => x !== c.id) : [...d.questionnaire.protectedCategoryIds, c.id],
                    ),
                  )
                }
              >
                <span className="chip-dot" style={{ background: c.color }} />
                {c.name}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Категории" note={`Максимум 12, сейчас ${data.categories.length}.`}>
        {data.categories.map((c) =>
          c.locked ? (
            <div key={c.id} className="row-static">
              <span className="chip-dot" style={{ background: c.color }} />
              <span className="row-title">{c.name}</span>
              <span className="row-sub">основная, не меняется</span>
            </div>
          ) : (
            <RowButton
              key={c.id}
              title={c.name}
              onClick={() => {
                setCategoryError(null);
                setOpen({ kind: 'category', id: c.id });
              }}
            />
          ),
        )}
        {data.categories.length < 12 && (
          <button
            type="button"
            className="add-row"
            onClick={() => {
              setCategoryError(null);
              setOpen({ kind: 'category' });
            }}
          >
            <Plus size={18} aria-hidden /> Своя категория
          </button>
        )}
      </Section>

      <Section title="Напоминания" note="Пока напоминание показывается внутри приложения, когда вы его открываете.">
        <Toggle
          label="Напоминать закрыть день"
          checked={data.settings.reminderEnabled}
          onChange={(v) => update((d) => P.updateSettings(d, { reminderEnabled: v }))}
        />
        {data.settings.reminderEnabled && (
          <RowButton title="Время" value={data.settings.reminderTime} onClick={() => setOpen({ kind: 'time' })} />
        )}
      </Section>

      <Section title="Данные">
        <p className="hint data-warning">
          Данные хранятся только на этом устройстве. Если очистить данные браузера, они удалятся — поэтому иногда
          сохраняйте копию в файл.
        </p>
        <button type="button" className="add-row" onClick={download}>
          <Download size={18} aria-hidden /> Сохранить копию в файл
        </button>
        <button type="button" className="add-row" onClick={() => fileRef.current?.click()}>
          <Upload size={18} aria-hidden /> Восстановить из файла
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void pickFile(f);
          }}
        />
        {fileError && <p className="field-error">{fileError}</p>}
        {data.isDemo ? (
          <button
            type="button"
            className="add-row"
            onClick={() =>
              setOpen({
                kind: 'confirm',
                title: 'Ввести свои данные',
                text: 'Демо-данные будут удалены, и вы начнёте с чистого листа: укажете счета, доходы и платежи. Продолжить?',
                label: 'Начать',
                run: () => replace(P.emptyData(today)),
              })
            }
          >
            Ввести свои данные вместо демо
          </button>
        ) : (
          <button
            type="button"
            className="add-row"
            onClick={() =>
              setOpen({
                kind: 'confirm',
                title: 'Сбросить к демо',
                text: 'Все ваши данные будут заменены демо-данными. Если они нужны, сначала сохраните копию в файл.',
                label: 'Сбросить',
                run: () => replace(demoData(today, Date.now())),
              })
            }
          >
            Сбросить к демо
          </button>
        )}
      </Section>

      {open?.kind === 'balance' && (
        <BalanceSheet
          data={data}
          today={today}
          kind={open.accountKind}
          account={open.account}
          onClose={close}
          onDelete={
            open.account && open.accountKind === 'other'
              ? () => {
                  update((d) => P.removeAccount(d, open.account!.id));
                  close();
                }
              : undefined
          }
          onSave={({ amount, asOf, name, paidOnAsOf }) => {
            const now = Date.now();
            update((d) => {
              if (!open.account) return P.addAccount(d, open.accountKind, amount, asOf, now, newId(), name, paidOnAsOf);
              const next = P.setAccountBalance(d, open.account.id, amount, asOf, now, paidOnAsOf);
              return P.renameAccount(next, open.account.id, name);
            });
            close();
          }}
        />
      )}
      {open?.kind === 'income' && (
        <RegularIncomeSheet
          income={open.income}
          newId={newId()}
          onClose={close}
          onDelete={
            open.income
              ? () => {
                  update((d) => P.removeRegularIncome(d, open.income!.id));
                  close();
                }
              : undefined
          }
          onSave={(i) => {
            update((d) => P.upsertRegularIncome(d, i));
            close();
          }}
        />
      )}
      {open?.kind === 'oneOff' && (
        <OneOffSheet
          today={today}
          onClose={close}
          onSave={(v) => {
            update((d) => P.addOneOffIncome(d, { id: newId(), ...v }));
            close();
          }}
        />
      )}
      {open?.kind === 'removeOneOff' && (
        <ConfirmSheet
          title={open.name}
          text="Удалить этот ожидаемый доход? Если он уже пришёл, подтвердите его на главной кнопкой «Записать доход»."
          confirmLabel="Удалить"
          onClose={close}
          onConfirm={() => {
            update((d) => P.removeOneOffIncome(d, open.id));
            close();
          }}
        />
      )}
      {open?.kind === 'payment' && (
        <PaymentSheet
          payment={data.payments.find((p) => p.id === open.id)}
          today={today}
          onClose={close}
          onDelete={
            open.id
              ? () => {
                  update((d) => P.removePayment(d, open.id!));
                  close();
                }
              : undefined
          }
          onSave={({ name, day, amount, fromMonth, amountChanged }) => {
            update((d) => {
              if (!open.id) return P.addPayment(d, newId(), name, day, amount, thisMonth);
              const next = P.updatePaymentInfo(d, open.id, name, day);
              return amountChanged ? P.changePaymentAmount(next, open.id, amount, fromMonth) : next;
            });
            close();
          }}
        />
      )}
      {open?.kind === 'transport' && (
        <AmountSheet
          title="Транспорт"
          hint="Сколько в месяц уходит на транспорт. Сумма делится на 30 дней и резервируется. 0 — не учитывать."
          initial={data.settings.transportMonthly}
          onClose={close}
          onSave={(v) => {
            update((d) => P.updateSettings(d, { transportMonthly: v }));
            close();
          }}
        />
      )}
      {open?.kind === 'time' && (
        <TimeSheet
          initial={data.settings.reminderTime}
          onClose={close}
          onSave={(t) => {
            update((d) => P.updateSettings(d, { reminderTime: t }));
            close();
          }}
        />
      )}
      {open?.kind === 'category' && (
        <CategorySheet
          category={data.categories.find((c) => c.id === open.id)}
          error={categoryError}
          onClose={close}
          onDelete={open.id && open.id !== 'other' ? () => saveCategory(P.removeCategory(data, open.id!)) : undefined}
          onSave={(name, color) => {
            if (!open.id) return saveCategory(P.addCategory(data, newId(), name, color));
            const renamed = P.renameCategory(data, open.id, name);
            saveCategory(typeof renamed === 'string' ? renamed : P.setCategoryColor(renamed, open.id, color));
          }}
        />
      )}
      {open?.kind === 'confirm' && (
        <ConfirmSheet
          title={open.title}
          text={open.text}
          confirmLabel={open.label}
          onClose={close}
          onConfirm={() => {
            open.run();
            close();
          }}
        />
      )}
    </>
  );
}
