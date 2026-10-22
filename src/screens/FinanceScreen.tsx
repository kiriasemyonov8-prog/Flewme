import { ArrowDownToLine, PiggyBank, Plus, Target, Wallet } from 'lucide-react';
import { useState } from 'react';
import { removeExpense } from '../core/actions';
import { currentBalance } from '../core/balance';
import { monthOf } from '../core/dates';
import { formatDayMonth, formatPermille, formatRub, formatRubWhole, pluralDays } from '../core/format';
import { goalProgressPermille } from '../core/goal';
import { addTransfer, removeGoal, upsertGoal } from '../core/money-moves';
import type { Kopecks } from '../core/money';
import { incomeName, monthExpenses, receivedIncomes, upcomingIncomes } from '../core/overview';
import { savingsTotal } from '../core/purchase';
import type { Expense, TransferPurpose } from '../core/types';
import { newId, type FinanceStore } from '../state/useFinance';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { Segmented } from '../ui/Form';
import { GoalSheet, WithdrawSheet } from './finance/GoalSheets';

type TabId = 'overview' | 'expenses' | 'incomes' | 'goals';

type Open =
  | null
  | { kind: 'goal'; edit: boolean }
  | { kind: 'withdraw' }
  | { kind: 'transfer'; amount: Kopecks; purpose: TransferPurpose }
  | { kind: 'expense'; expense: Expense };

const MONTHS_NOM = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function Progress({ permille, color = 'var(--emerald)' }: { permille: number; color?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(permille / 10)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(permille, 8) / 10}%`, background: color }} />
    </div>
  );
}

export function FinanceScreen({ store }: { store: FinanceStore }) {
  const { data, today, limit, update } = store;
  const [tab, setTab] = useState<TabId>('overview');
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  const main = data.accounts.find((a) => a.kind === 'main');
  const savingsAcc = data.accounts.find((a) => a.kind === 'savings');
  const savings = savingsTotal(data, today);
  const goal = data.goals[0];
  const progress = goal ? goalProgressPermille(savings, goal.target) : 0;
  const month = monthOf(today);
  const spending = monthExpenses(data, month);
  const maxCat = spending.byCategory[0]?.total ?? 0;
  const categoryName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Другое';
  const categoryColor = (id: string) => data.categories.find((c) => c.id === id)?.color ?? 'var(--cat-7)';
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? 'Счёт';

  function transferRow(amount: Kopecks, purpose: TransferPurpose, title: string) {
    if (amount <= 0) return null;
    return (
      <div className="card move-card">
        <div>
          <div className="stat-head">
            <ArrowDownToLine size={18} aria-hidden />
            <span>{title}</span>
          </div>
          <div className="move-amount num">{formatRub(amount)}</div>
          <div className="stat-note">
            {savingsAcc ? 'Переведите в банке на накопительный счёт и подтвердите' : 'Укажите накопительный счёт в профиле'}
          </div>
        </div>
        {savingsAcc && main && (
          <button type="button" className="btn btn-secondary" onClick={() => setOpen({ kind: 'transfer', amount, purpose })}>
            Перевёл
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <h1 className="screen-title">Финансы и цели</h1>
      <Segmented
        label="Раздел"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Обзор' },
          { value: 'expenses', label: 'Расходы' },
          { value: 'incomes', label: 'Доходы' },
          { value: 'goals', label: 'Цели' },
        ]}
      />

      {tab === 'overview' && (
        <>
          {limit.status === 'ok' ? (
            <section className="card big-card">
              <div className="stat-head">
                <Wallet size={18} aria-hidden />
                <span>Свободно до {formatDayMonth(limit.horizon)}</span>
              </div>
              <div className="big-value num">{formatRub(limit.free > 0 ? limit.free : (0 as Kopecks))}</div>
              <div className="stat-note">
                {formatRubWhole(limit.dailyLimit)} в день · {limit.days} {pluralDays(limit.days)}
              </div>
            </section>
          ) : (
            <div className="card stub">
              <p>Чтобы посчитать свободные деньги, укажите в профиле остаток основного счёта и ожидаемый доход.</p>
            </div>
          )}

          <div className="top-cards">
            {data.accounts.map((a) => (
              <section key={a.id} className="card stat">
                <div className="stat-head">
                  {a.kind === 'savings' ? <PiggyBank size={18} aria-hidden /> : <Wallet size={18} aria-hidden />}
                  <span>{a.name}</span>
                </div>
                <div className="stat-value small num">{formatRub(currentBalance(a, data, today))}</div>
              </section>
            ))}
          </div>

          {limit.status === 'ok' && transferRow(limit.setAside, 'setAside', 'Отложить в накопления')}
          {limit.status === 'ok' && transferRow(limit.saved, 'saved', 'Сэкономлено')}

          {limit.status === 'ok' && (
            <section className="card list-card">
              <h2 className="card-title">Запланировано до {formatDayMonth(limit.horizon)}</h2>
              {limit.reservedPayments.map((p) => (
                <div key={p.key} className="list-row">
                  <span>
                    {p.name} <span className="row-sub">· {formatDayMonth(p.date)}</span>
                  </span>
                  <span className="num">−{formatRub(p.amount)}</span>
                </div>
              ))}
              {limit.transportReserve > 0 && (
                <div className="list-row">
                  <span>
                    Транспорт <span className="row-sub">· резерв на {limit.days} {pluralDays(limit.days)}</span>
                  </span>
                  <span className="num">−{formatRub(limit.transportReserve)}</span>
                </div>
              )}
              <div className="list-row">
                <span>
                  {limit.horizonIncome.name}{' '}
                  <span className="row-sub">
                    · ожидается{' '}
                    {limit.horizonIncome.early === limit.horizonIncome.late
                      ? formatDayMonth(limit.horizon)
                      : `${formatDayMonth(limit.horizonIncome.early)} – ${formatDayMonth(limit.horizonIncome.late)}`}
                  </span>
                </span>
                <span className="num plus">+{formatRub(limit.horizonIncome.min)}</span>
              </div>
            </section>
          )}

          {goal && (
            <button type="button" className="card goal-mini" onClick={() => setTab('goals')}>
              <div className="stat-head">
                <Target size={18} aria-hidden />
                <span>{goal.name}</span>
                <span className="goal-pct num">{formatPermille(progress)}</span>
              </div>
              <Progress permille={progress} />
              <div className="stat-note">
                {formatRub(savings)} из {formatRub(goal.target)}
              </div>
            </button>
          )}
        </>
      )}

      {tab === 'expenses' && (
        <>
          <section className="card big-card">
            <div className="stat-head">
              <span>Расходы за {MONTHS_NOM[Number(month.slice(5)) - 1]}</span>
            </div>
            <div className="big-value num">{formatRub(spending.total)}</div>
            {spending.byCategory.map((c) => (
              <div key={c.categoryId} className="cat-row">
                <div className="cat-row-head">
                  <span>
                    <span className="chip-dot" style={{ background: categoryColor(c.categoryId) }} /> {categoryName(c.categoryId)}
                  </span>
                  <span className="num">{formatRub(c.total)}</span>
                </div>
                <Progress permille={Math.round((c.total * 1000) / maxCat)} color={categoryColor(c.categoryId)} />
              </div>
            ))}
          </section>
          <section className="card list-card">
            <h2 className="card-title">Все траты</h2>
            {spending.items.length === 0 && <p className="hint">В этом месяце трат пока нет.</p>}
            {spending.items.map((x) => (
              <button key={x.id} type="button" className="list-row list-btn" onClick={() => setOpen({ kind: 'expense', expense: x })}>
                <span>
                  {x.note ?? categoryName(x.categoryId)}
                  <span className="row-sub">
                    {' '}
                    · {formatDayMonth(x.date)}
                    {x.note ? ` · ${categoryName(x.categoryId)}` : ''}
                    {x.accountId !== main?.id ? ` · ${accountName(x.accountId)}` : ''}
                    {x.demo ? ' · примерная' : ''}
                  </span>
                </span>
                <span className="num">−{formatRub(x.amount)}</span>
              </button>
            ))}
          </section>
        </>
      )}

      {tab === 'incomes' && (
        <>
          <section className="card list-card">
            <h2 className="card-title">Ожидается</h2>
            {upcomingIncomes(data, today).length === 0 && <p className="hint">Ожидаемых доходов нет. Добавьте их в профиле.</p>}
            {upcomingIncomes(data, today).map((o) => (
              <div key={o.key} className="list-row">
                <span>
                  {o.name}{' '}
                  <span className="row-sub">
                    · {o.early === o.late ? formatDayMonth(o.late) : `${formatDayMonth(o.early)} – ${formatDayMonth(o.late)}`}
                  </span>
                </span>
                <span className="num muted">
                  {o.min === o.max ? formatRub(o.min) : `${formatRub(o.min)} – ${formatRub(o.max)}`}
                </span>
              </div>
            ))}
            <p className="hint">Ожидаемые доходы в остаток не входят, пока не подтверждены «Пришла» на главной.</p>
          </section>
          <section className="card list-card">
            <h2 className="card-title">Получено</h2>
            {receivedIncomes(data).length === 0 && <p className="hint">Подтверждённых поступлений пока нет.</p>}
            {receivedIncomes(data).map((r) => (
              <div key={r.id} className="list-row">
                <span>
                  {incomeName(data, r.occurrenceKey)} <span className="row-sub">· {formatDayMonth(r.date)}</span>
                </span>
                <span className="num plus">+{formatRub(r.amount)}</span>
              </div>
            ))}
          </section>
        </>
      )}

      {tab === 'goals' && (
        <>
          {goal ? (
            <section className="card goal-card">
              <div className="stat-head">
                <Target size={18} aria-hidden />
                <span>{goal.name}</span>
              </div>
              <div className="big-value num">{formatPermille(progress)}</div>
              <Progress permille={progress} />
              <div className="stat-note">
                {formatRub(savings)} из {formatRub(goal.target)}
                {goal.deadline ? ` · к ${formatDayMonth(goal.deadline)} ${goal.deadline.slice(0, 4)}` : ' · без срока'}
              </div>
              <div className="btn-row">
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ kind: 'goal', edit: true })}>
                  Изменить
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setOpen({ kind: 'withdraw' })}
                  disabled={limit.status !== 'ok' || !savingsAcc || savings <= 0}
                >
                  Взять из накоплений
                </button>
              </div>
              {(limit.status !== 'ok' || !savingsAcc) && (
                <p className="hint">Чтобы брать из накоплений, укажите в профиле основной и накопительный счета и доход.</p>
              )}
            </section>
          ) : (
            <div className="card stub">
              <p>Цели пока нет. Поставьте цель — Флюми покажет прогресс по накопительному счёту.</p>
              <button type="button" className="add-row" onClick={() => setOpen({ kind: 'goal', edit: false })}>
                <Plus size={18} aria-hidden /> Новая цель
              </button>
            </div>
          )}
        </>
      )}

      {open?.kind === 'goal' && (
        <GoalSheet
          goal={open.edit ? goal : undefined}
          today={today}
          newId={newId()}
          onClose={close}
          onDelete={
            open.edit && goal
              ? () => {
                  update((d) => removeGoal(d, goal.id));
                  close();
                }
              : undefined
          }
          onSave={(g) => {
            update((d) => upsertGoal(d, g));
            close();
          }}
        />
      )}
      {open?.kind === 'withdraw' && limit.status === 'ok' && savingsAcc && main && (
        <WithdrawSheet
          limit={limit}
          savings={savings}
          goal={goal}
          onClose={close}
          onConfirm={(amount) => {
            update((d) => addTransfer(d, savingsAcc.id, main.id, amount, 'withdraw', today, newId(), Date.now()));
            close();
          }}
        />
      )}
      {open?.kind === 'transfer' && savingsAcc && main && (
        <ConfirmSheet
          title={open.purpose === 'saved' ? 'Сэкономленное в накопления' : 'Отложить в накопления'}
          text={`Переведите ${formatRub(open.amount)} с «${main.name}» на «${savingsAcc.name}» в приложении банка. Перевели?`}
          confirmLabel="Да, перевёл"
          onClose={close}
          onConfirm={() => {
            update((d) => addTransfer(d, main.id, savingsAcc.id, open.amount, open.purpose, today, newId(), Date.now()));
            close();
          }}
        />
      )}
      {open?.kind === 'expense' && (
        <ConfirmSheet
          title={open.expense.note ?? categoryName(open.expense.categoryId)}
          text={`${formatRub(open.expense.amount)}, ${formatDayMonth(open.expense.date)}. Удалить эту трату, если она записана по ошибке?`}
          confirmLabel="Удалить"
          onClose={close}
          onConfirm={() => {
            update((d) => removeExpense(d, open.expense.id));
            close();
          }}
        />
      )}
    </>
  );
}
