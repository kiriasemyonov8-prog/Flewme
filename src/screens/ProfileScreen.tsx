import { Download, FileSpreadsheet, Minus, Plus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { confirmIncome } from '../core/actions';
import { addDays, type ISODate } from '../core/dates';
import type { Kopecks } from '../core/money';
import { repeatText } from '../ui/Repeat';
import { GapSheet, StretchSheet } from './profile/GapSheet';
import { ImportSheet } from './profile/ImportSheet';
import { importBackup, type ImportError } from '../core/backup';
import { saveBackupFile } from '../state/backupFile';
import { demoData } from '../core/demo';
import { formatDayMonth, formatRub } from '../core/format';
import * as P from '../core/profile';
import { paymentAmountFor } from '../core/schedule';
import { monthOf } from '../core/dates';
import type { Account, AccountKind, FinanceData, RegularIncome } from '../core/types';
import { newId, type FinanceStore } from '../state/useFinance';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { Collapsible, RowButton, Segmented, Toggle } from '../ui/Form';
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
  | { kind: 'gap'; amount: Kopecks; asOf: ISODate }
  | { kind: 'stretch' }
  | { kind: 'import' }
  | { kind: 'transport' }
  | { kind: 'time' }
  | { kind: 'category'; id?: string }
  | { kind: 'confirm'; title: string; text: string; label: string; run: () => void };

function scheduleText(i: RegularIncome): string {
  const s = i.schedule;
  if (s.type === 'window') return `${s.fromDay}–${s.toDay} числа`;
  if (s.type === 'weekly' || s.type === 'biweekly') return repeatText(s);
  return `${s.days.join(' и ')} числа`;
}

function amountText(i: RegularIncome): string {
  return i.min === i.max ? formatRub(i.min) : `${formatRub(i.min)} – ${formatRub(i.max)}`;
}

const THEME_NAMES = { light: 'Светлая', dark: 'Графит', aurora: 'Аврора' } as const;

const IMPORT_ERRORS: Record<ImportError, string> = {
  notJson: 'Этот файл не похож на копию Флюми.',
  notFlyumi: 'Этот файл не похож на копию Флюми.',
  newerVersion: 'Копия сделана более новой версией приложения.',
  broken: 'Файл копии повреждён, восстановить из него нельзя.',
};

export function ProfileScreen({ store, onStartOnboarding }: { store: FinanceStore; onStartOnboarding: () => void }) {
  const { data, today, update, replace } = store;
  const [open, setOpen] = useState<Open>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [lastPercent, setLastPercent] = useState(data.settings.savePercent || 30);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => setOpen(null);
  const thisMonth = monthOf(today);

  const main = data.accounts.find((a) => a.kind === 'main');
  const savingsList = data.accounts.filter((a) => a.kind === 'savings');
  const others = data.accounts.filter((a) => a.kind === 'other');
  const confirmedOneOff = new Set(data.receipts.map((r) => r.occurrenceKey));
  const expectedOneOff = data.oneOffIncomes.filter((i) => !confirmedOneOff.has(`oneoff:${i.id}`));
  const pct = data.settings.savePercent;

  // Разделы-вкладки: открыт не больше одного, остальные свёрнуты до заголовка с итогом.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const sec = (id: string, title: string, summary: string) => ({
    title,
    summary,
    open: openSection === id,
    onToggle: () => setOpenSection((cur) => (cur === id ? null : id)),
  });
  const accountsSummary = main
    ? `основной ${formatRub(main.amount)} · всего счетов: ${data.accounts.length}`
    : 'основной счёт не указан';
  const moneySummary =
    [
      `доходов: ${data.regularIncomes.length}`,
      `платежей: ${data.payments.length}`,
      data.settings.transportMonthly > 0 ? 'транспорт' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  const protectedNames = data.questionnaire.protectedCategoryIds
    .map((id) => data.categories.find((c) => c.id === id)?.name)
    .filter(Boolean);
  const protectedSummary = protectedNames.length ? protectedNames.join(', ') : 'ничего не отмечено';

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
    saveBackupFile(store, today);
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
      <h1 className="screen-title">Профиль</h1>

      <Collapsible {...sec('accounts', 'Счета', accountsSummary)}>
        {accountRow('main', main, 'Основной счёт')}
        {savingsList.length === 0
          ? accountRow('savings', undefined, 'Накопления')
          : savingsList.map((a) => accountRow('savings', a, a.name))}
        {others.map((a) => accountRow('other', a, a.name))}
        <button type="button" className="add-row" onClick={() => setOpen({ kind: 'balance', accountKind: 'other' })}>
          <Plus size={18} aria-hidden /> Другой счёт
        </button>
      </Collapsible>

      <Collapsible {...sec('money', 'Доходы и платежи', moneySummary)}>
        <div className="sub-title">Регулярные доходы</div>
        {data.regularIncomes.map((i) => (
          <RowButton key={i.id} title={i.name} sub={scheduleText(i)} value={amountText(i)} onClick={() => setOpen({ kind: 'income', income: i })} />
        ))}
        <button type="button" className="add-row" onClick={() => setOpen({ kind: 'income' })}>
          <Plus size={18} aria-hidden /> Регулярный доход
        </button>
        {data.regularIncomes.length === 0 && (
          <RowButton
            title="Дотянуть до"
            sub="регулярного дохода нет: до какой даты должны хватить деньги"
            value={
              data.settings.stretchUntil && data.settings.stretchUntil > today
                ? formatDayMonth(data.settings.stretchUntil)
                : '30 дней вперёд'
            }
            onClick={() => setOpen({ kind: 'stretch' })}
          />
        )}

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
            <RowButton
              key={p.id}
              title={p.name}
              sub={p.repeat ? repeatText(p.repeat) : `${p.day} числа`}
              value={formatRub(amount)}
              onClick={() => setOpen({ kind: 'payment', id: p.id })}
            />
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
      </Collapsible>

      <Collapsible
        {...sec(
          'saving',
          'Откладывание',
          `${pct > 0 ? `${pct}% в накопления` : 'выключено'} · остаток ${data.settings.leftoverMode === 'otherDays' ? 'на другие дни' : 'на счёт'}`,
        )}
      >
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
      </Collapsible>

      <Collapsible
        {...sec('questionnaire', 'На чём не готов экономить', protectedSummary)}
        note="Флюми не будет советовать урезать эти категории. На дневной лимит анкета не влияет."
      >
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
      </Collapsible>

      <Collapsible
        {...sec('categories', 'Категории', `${data.categories.length} из 12`)}
        note={`Максимум 12, сейчас ${data.categories.length}.`}
      >
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
      </Collapsible>

      <Collapsible
        {...sec(
          'reminders',
          'Напоминания',
          data.settings.reminderEnabled ? `закрыть день в ${data.settings.reminderTime}` : 'выключены',
        )}
        note="Пока напоминание показывается внутри приложения, когда вы его открываете."
      >
        <Toggle
          label="Напоминать закрыть день"
          checked={data.settings.reminderEnabled}
          onChange={(v) => update((d) => P.updateSettings(d, { reminderEnabled: v }))}
        />
        {data.settings.reminderEnabled && (
          <RowButton title="Время" value={data.settings.reminderTime} onClick={() => setOpen({ kind: 'time' })} />
        )}
      </Collapsible>

      <Collapsible {...sec('look', 'Оформление', THEME_NAMES[store.meta.theme ?? 'light'])}>
        <Segmented
          label="Тема"
          value={store.meta.theme ?? 'light'}
          onChange={(v) => store.setMeta({ theme: v })}
          options={[
            { value: 'light', label: THEME_NAMES.light },
            { value: 'dark', label: THEME_NAMES.dark },
            { value: 'aurora', label: THEME_NAMES.aurora },
          ]}
        />
        <p className="hint">
          {store.meta.theme === 'dark'
            ? 'Графит и сигнальный оранжевый, как огни Флюми.'
            : store.meta.theme === 'aurora'
              ? 'Ночное небо с северным сиянием: бирюза, фуксия и фиолетовый.'
              : 'Воздушная мята и стеклянные кнопки.'}
        </p>
      </Collapsible>

      <Collapsible {...sec('data', 'Данные', data.isDemo ? 'демо · копия в файл, свои данные' : 'копия в файл, сброс к демо')}>
        <p className="hint data-warning">
          Данные хранятся только на этом устройстве. Если очистить данные браузера, они удалятся — поэтому иногда
          сохраняйте копию в файл.
        </p>
        {/* Выписка банка вместо API: файл читается на устройстве (3.30) */}
        <button type="button" className="add-row" onClick={() => setOpen({ kind: 'import' })}>
          <FileSpreadsheet size={18} aria-hidden /> Загрузить выписку банка
        </button>
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
                text: 'Флюми задаст 7 коротких вопросов. Когда вы ответите, демо-данные заменятся вашими. Продолжить?',
                label: 'К анкете',
                run: onStartOnboarding,
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
      </Collapsible>

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
          onSave={({ amount, asOf, name, paidOnAsOf, receivedIncome }) => {
            const now = Date.now();
            // Денег заметно меньше, чем по записям, — предложим разнести неучтённые траты (3.26, п. 13).
            const gap = open.account ? P.balanceGap(data, open.account.id, amount, asOf, paidOnAsOf) : null;
            update((d) => {
              if (!open.account) return P.addAccount(d, open.accountKind, amount, asOf, now, newId(), name, paidOnAsOf);
              let next = P.setAccountBalance(d, open.account.id, amount, asOf, now, paidOnAsOf);
              // Доход уже в этой сумме: подтверждаем его без второго прибавления (3.25).
              if (receivedIncome) {
                next = confirmIncome(next, receivedIncome.key, receivedIncome.amount, asOf, newId(), now + 1, true);
              }
              return P.renameAccount(next, open.account.id, name);
            });
            if (gap?.notice && !receivedIncome) setOpen({ kind: 'gap', amount: gap.gap, asOf });
            else close();
          }}
        />
      )}
      {open?.kind === 'gap' && (
        <GapSheet
          data={data}
          gap={open.amount}
          onClose={close}
          onRecord={(categoryId, amount, note) => {
            const main = data.accounts.find((a) => a.kind === 'main');
            if (!main) return;
            // Вчерашним днём: трата уже вошла в новый остаток и второй раз его не уменьшит.
            update((d) => ({
              ...d,
              expenses: [
                ...d.expenses,
                {
                  id: newId(),
                  amount,
                  accountId: main.id,
                  categoryId,
                  date: addDays(open.asOf, -1),
                  createdAt: Date.now(),
                  ...(note ? { note } : {}),
                },
              ],
            }));
            const rest = (open.amount - amount) as Kopecks;
            if (rest > 0) setOpen({ ...open, amount: rest });
            else close();
          }}
        />
      )}
      {open?.kind === 'import' && <ImportSheet data={data} onApply={replace} onClose={close} />}
      {open?.kind === 'stretch' && (
        <StretchSheet
          today={today}
          initial={data.settings.stretchUntil}
          onClose={close}
          onSave={(until) => {
            update((d) => P.updateSettings(d, { stretchUntil: until }));
            close();
          }}
        />
      )}
      {open?.kind === 'income' && (
        <RegularIncomeSheet
          income={open.income}
          today={today}
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
          onSave={({ name, day, amount, fromMonth, amountChanged, repeat }) => {
            update((d) => {
              if (!open.id) return P.addPayment(d, newId(), name, day, amount, thisMonth, repeat);
              const next = P.updatePaymentInfo(d, open.id, name, day, repeat);
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
