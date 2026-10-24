// Анкета первого входа (SPEC 3.27): один вопрос на экран, любой можно пропустить, кроме остатка.
// В конце — сводка и сразу посчитанный лимит.
import { ChevronLeft, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { RobotHead } from '../../assets/character';
import { DEFAULT_CATEGORIES } from '../../core/categories';
import { addDays, monthOf, type ISODate } from '../../core/dates';
import { formatDayMonth, formatRub, formatRubWhole, parseRubInput } from '../../core/format';
import { computeLimit } from '../../core/limit';
import type { Kopecks } from '../../core/money';
import { buildFromAnswers, emptyAnswers, PAYMENT_PRESETS, type OnboardingAnswers, type PaymentAnswer } from '../../core/onboarding';
import type { FinanceData, RegularIncome } from '../../core/types';
import { newId } from '../../state/useFinance';
import { DateField } from '../../ui/Calendar';
import { AmountPad, RowButton, TextField, Toggle } from '../../ui/Form';
import { ChoiceChips, incomeScheduleText, repeatText } from '../../ui/Repeat';
import { PaymentSheet } from '../profile/PaymentSheet';
import { RegularIncomeSheet } from '../profile/RegularIncomeSheet';

const QUESTIONS = 7;
const SUMMARY = QUESTIONS;

type Sheet =
  | null
  | { kind: 'income'; income?: RegularIncome }
  | { kind: 'payment'; preset?: string; payment?: PaymentAnswer };

const rub = (n: number) => (n * 100) as Kopecks;

function amountText(i: RegularIncome): string {
  return i.min === i.max ? formatRub(i.min) : `${formatRub(i.min)} – ${formatRub(i.max)}`;
}

export function Questionnaire({
  today,
  onDone,
  onBack,
}: {
  today: ISODate;
  onDone: (data: FinanceData) => void;
  /** Назад с первого вопроса: к карточкам или обратно в приложение. */
  onBack: () => void;
}) {
  const [a, setA] = useState<OnboardingAnswers>(emptyAnswers);
  const [step, setStep] = useState(0);
  // Вопрос открыт из сводки — «Далее» возвращает к сводке.
  const [fromSummary, setFromSummary] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState<string | null>(null);

  // Черновики полей ввода сумм
  const [balanceText, setBalanceText] = useState('');
  const [hasIncome, setHasIncome] = useState<'yes' | 'no' | null>(null);
  const [transport, setTransport] = useState<'0' | '2000' | '5000' | 'own'>('0');
  const [transportText, setTransportText] = useState('');
  const [hasGoal, setHasGoal] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState(addDays(today, 365));
  const [savingsTexts, setSavingsTexts] = useState(['', '']);
  const [savingsActive, setSavingsActive] = useState(0);

  const patch = (p: Partial<OnboardingAnswers>) => setA((x) => ({ ...x, ...p }));

  function next() {
    setError(null);
    setStep(fromSummary ? SUMMARY : step + 1);
    window.scrollTo({ top: 0 });
  }

  /** Сохранить ответ текущего вопроса; строка — текст ошибки. */
  function commit(): string | null {
    switch (step) {
      case 0: {
        const v = balanceText === '' || balanceText === '0' ? (0 as Kopecks) : parseRubInput(balanceText);
        if (balanceText === '' || v === null) return 'Введите сумму — можно 0';
        patch({ balance: v });
        return null;
      }
      case 1:
        if (hasIncome === null) return 'Выберите «Да» или «Нет»';
        if (hasIncome === 'yes' && a.incomes.length === 0) return 'Добавьте доход или выберите «Нет»';
        if (hasIncome === 'no') patch({ incomes: [] });
        return null;
      case 3: {
        if (transport !== 'own') {
          patch({ transportMonthly: rub(Number(transport)) });
          return null;
        }
        const v = parseRubInput(transportText);
        if (!v) return 'Введите сумму';
        patch({ transportMonthly: v });
        return null;
      }
      case 4: {
        const savings = parseRubInput(savingsTexts[0]) ?? (0 as Kopecks);
        if (!hasGoal) {
          patch({ savings, goal: undefined });
          return null;
        }
        const target = parseRubInput(savingsTexts[1]);
        if (!target) return 'Сколько нужно на цель?';
        patch({ savings, goal: { name: goalName.trim() || 'Цель', target, deadline: hasDeadline ? deadline : undefined } });
        return null;
      }
      default:
        return null;
    }
  }

  function skip() {
    // Пропуск: ответ остаётся пустым, его можно добавить потом в профиле.
    if (step === 1) patch({ incomes: [], stretchUntil: undefined });
    if (step === 2) patch({ payments: [] });
    if (step === 3) patch({ transportMonthly: 0 as Kopecks });
    if (step === 4) patch({ savings: 0 as Kopecks, goal: undefined });
    if (step === 6) patch({ protectedCategoryIds: [] });
    next();
  }

  function back() {
    setError(null);
    if (fromSummary) return setStep(SUMMARY);
    if (step === 0) return onBack();
    setStep(step - 1);
  }

  if (step === SUMMARY) return <Summary a={a} today={today} onEdit={(i) => (setFromSummary(true), setStep(i))} onDone={onDone} onBack={() => (setFromSummary(false), setStep(QUESTIONS - 1))} />;

  let say: string;
  let title: string;
  let body: ReactNode;
  switch (step) {
    case 0:
      title = 'Сколько сейчас на основном счёте?';
      say = 'С этого счёта я считаю лимит на день. Сумму посмотрите в приложении банка.';
      body = (
        <AmountPad
          fields={[{ label: 'На счёте', text: balanceText }]}
          active={0}
          onActivate={() => {}}
          onChange={(_, u) => {
            setBalanceText(u);
            setError(null);
          }}
        />
      );
      break;
    case 1:
      title = 'Есть регулярный доход?';
      say = 'Зарплата, пенсия, стипендия, выплаты по неделям — до них я растягиваю деньги.';
      body = (
        <>
          <ChoiceChips
            label="Есть регулярный доход"
            value={hasIncome ?? ''}
            onChange={(v) => {
              setHasIncome(v as 'yes' | 'no');
              setError(null);
            }}
            options={[
              { value: 'yes', label: 'Да' },
              { value: 'no', label: 'Нет, только разовые' },
            ]}
          />
          {hasIncome === 'yes' && (
            <>
              {a.incomes.map((i) => (
                <RowButton key={i.id} title={i.name} sub={incomeScheduleText(i.schedule)} value={amountText(i)} onClick={() => setSheet({ kind: 'income', income: i })} />
              ))}
              <button type="button" className="add-row" onClick={() => setSheet({ kind: 'income' })}>
                <Plus size={18} aria-hidden /> {a.incomes.length ? 'Ещё доход' : 'Добавить доход'}
              </button>
            </>
          )}
          {hasIncome === 'no' && (
            <>
              <DateField
                label="Деньги должны хватить до"
                value={a.stretchUntil ?? addDays(today, 30)}
                onChange={(d) => patch({ stretchUntil: d })}
                today={today}
                min={addDays(today, 1)}
              />
              <p className="hint">Разовые доходы прибавятся, когда придут: на главной есть кнопка «Записать доход».</p>
            </>
          )}
        </>
      );
      break;
    case 2:
      title = 'Обязательные платежи';
      say = 'Отмечу их заранее, чтобы на них точно хватило. Нажмите, что у вас есть.';
      body = (
        <>
          <div className="chips">
            {PAYMENT_PRESETS.filter((n) => !a.payments.some((p) => p.name === n)).map((n) => (
              <button key={n} type="button" className="chip" onClick={() => setSheet({ kind: 'payment', preset: n })}>
                <Plus size={14} aria-hidden /> {n}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setSheet({ kind: 'payment' })}>
              <Plus size={14} aria-hidden /> Свой
            </button>
          </div>
          {a.payments.map((p) => (
            <RowButton
              key={p.id}
              title={p.name}
              sub={p.repeat ? repeatText(p.repeat) : `${p.day} числа`}
              value={formatRub(p.amount)}
              onClick={() => setSheet({ kind: 'payment', payment: p })}
            />
          ))}
          {a.payments.length === 0 && <p className="hint">Нет платежей — просто нажмите «Далее».</p>}
        </>
      );
      break;
    case 3:
      title = 'Сколько в месяц уходит на транспорт?';
      say = 'Я отложу эту сумму по дням, и поездки можно не записывать.';
      body = (
        <>
          <ChoiceChips
            label="Транспорт"
            value={transport}
            onChange={(v) => {
              setTransport(v);
              setError(null);
            }}
            options={[
              { value: '0', label: 'Не трачу' },
              { value: '2000', label: 'Около 2 000 ₽' },
              { value: '5000', label: 'Около 5 000 ₽' },
              { value: 'own', label: 'Своя сумма' },
            ]}
          />
          {transport === 'own' && (
            <AmountPad
              fields={[{ label: 'В месяц', text: transportText }]}
              active={0}
              onActivate={() => {}}
              onChange={(_, u) => {
                setTransportText(u);
                setError(null);
              }}
            />
          )}
        </>
      );
      break;
    case 4:
      title = 'Накопления и цель';
      say = 'Покажу, как растёт цель, и подскажу, когда покупка её отодвинет.';
      body = (
        <>
          <Toggle label="Копите на что-то" checked={hasGoal} onChange={(v) => (setHasGoal(v), setSavingsActive(0))} />
          {hasGoal && <TextField label="На что" value={goalName} onChange={setGoalName} placeholder="Например, отпуск" />}
          <AmountPad
            fields={
              hasGoal
                ? [
                    { label: 'Уже накоплено', text: savingsTexts[0] },
                    { label: 'Сколько нужно', text: savingsTexts[1] },
                  ]
                : [{ label: 'Уже накоплено', text: savingsTexts[0] }]
            }
            active={hasGoal ? savingsActive : 0}
            onActivate={setSavingsActive}
            onChange={(i, u) => {
              setSavingsTexts((t) => t.map((x, j) => (j === i ? u(x) : x)));
              setError(null);
            }}
          />
          {hasGoal && (
            <>
              <Toggle label="Есть срок" checked={hasDeadline} onChange={setHasDeadline} />
              {hasDeadline && <DateField label="К какой дате" value={deadline} onChange={setDeadline} today={today} min={today} />}
            </>
          )}
        </>
      );
      break;
    case 5:
      title = 'Сколько откладывать?';
      say = 'Отложу часть от каждого дохода после обязательных платежей. Лимит дня из-за этого не станет меньше 500 ₽.';
      body = (
        <ChoiceChips
          label="Откладывать"
          value={String(a.savePercent)}
          onChange={(v) => patch({ savePercent: Number(v) })}
          options={[
            { value: '10', label: '10 %' },
            { value: '20', label: '20 %' },
            { value: '30', label: '30 %' },
            { value: '0', label: 'Пока нет' },
          ]}
        />
      );
      break;
    default:
      title = 'На чём не готовы экономить?';
      say = 'Не буду советовать урезать эти траты. На лимит это не влияет.';
      body = (
        <div className="chips">
          {DEFAULT_CATEGORIES.map((c) => {
            const on = a.protectedCategoryIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                className={`chip${on ? ' is-on' : ''}`}
                onClick={() =>
                  patch({ protectedCategoryIds: on ? a.protectedCategoryIds.filter((x) => x !== c.id) : [...a.protectedCategoryIds, c.id] })
                }
              >
                <span className="chip-dot" style={{ background: c.color }} />
                {c.name}
              </button>
            );
          })}
        </div>
      );
  }

  const thisMonth = monthOf(today);
  return (
    <div className="onboard onboard-quiz">
      <div className="quiz-head">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={back}>
          <ChevronLeft size={22} />
        </button>
        <div className="quiz-progress" aria-label={`Вопрос ${step + 1} из ${QUESTIONS}`}>
          <span style={{ width: `${((step + 1) / QUESTIONS) * 100}%` }} />
        </div>
        <span className="quiz-count num">
          {step + 1} из {QUESTIONS}
        </span>
      </div>

      <div className="quiz-say">
        <span className="flyumi-icon quiz-avatar">
          <RobotHead expression="calm" />
        </span>
        <p>{say}</p>
      </div>
      <h1 className="onboard-title quiz-title">{title}</h1>
      <div className="quiz-body">{body}</div>
      {error && <p className="field-error">{error}</p>}

      <div className="onboard-actions quiz-actions">
        <button
          type="button"
          className="btn btn-primary btn-wide btn-big"
          onClick={() => {
            const err = commit();
            if (err) return setError(err);
            next();
          }}
        >
          {fromSummary ? 'Готово' : 'Далее'}
        </button>
        {step > 0 && !fromSummary && (
          <button type="button" className="link-btn" onClick={skip}>
            Пропустить, укажу потом
          </button>
        )}
      </div>

      {sheet?.kind === 'income' && (
        <RegularIncomeSheet
          income={sheet.income}
          newId={newId()}
          today={today}
          onClose={() => setSheet(null)}
          onDelete={
            sheet.income
              ? () => {
                  patch({ incomes: a.incomes.filter((i) => i.id !== sheet.income!.id) });
                  setSheet(null);
                }
              : undefined
          }
          onSave={(income) => {
            patch({ incomes: [...a.incomes.filter((i) => i.id !== income.id), income] });
            setError(null);
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === 'payment' && (
        <PaymentSheet
          simple
          today={today}
          presetName={sheet.preset}
          payment={
            sheet.payment && {
              id: sheet.payment.id,
              name: sheet.payment.name,
              day: sheet.payment.day,
              amounts: [{ fromMonth: thisMonth, amount: sheet.payment.amount }],
              repeat: sheet.payment.repeat,
            }
          }
          onClose={() => setSheet(null)}
          onDelete={
            sheet.payment
              ? () => {
                  patch({ payments: a.payments.filter((p) => p.id !== sheet.payment!.id) });
                  setSheet(null);
                }
              : undefined
          }
          onSave={({ name, day, amount, repeat }) => {
            const id = sheet.payment?.id ?? newId();
            const p: PaymentAnswer = { id, name: name.trim() || sheet.preset || 'Платёж', day, amount, repeat };
            patch({ payments: [...a.payments.filter((x) => x.id !== id), p] });
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

/** Итог анкеты: сводка с правкой любой строки и сразу посчитанный лимит. */
function Summary({
  a,
  today,
  onEdit,
  onDone,
  onBack,
}: {
  a: OnboardingAnswers;
  today: ISODate;
  onEdit: (step: number) => void;
  onDone: (data: FinanceData) => void;
  onBack: () => void;
}) {
  const now = Date.now();
  const data = buildFromAnswers(a, today, now);
  const limit = computeLimit(data, today);
  const paymentsTotal = a.payments.reduce((s, p) => s + p.amount, 0) as Kopecks;

  return (
    <div className="onboard onboard-quiz">
      <div className="quiz-head">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={onBack}>
          <ChevronLeft size={22} />
        </button>
      </div>
      <div className="quiz-say">
        <span className="flyumi-icon quiz-avatar">
          <RobotHead expression="joy" />
        </span>
        <p>Готово! Проверьте, всё ли верно. Любую строку можно исправить.</p>
      </div>

      {limit.status === 'ok' ? (
        <section className="card stat stat-accent summary-limit">
          <div className="stat-head">Сегодня можно</div>
          <div className="stat-value num">{formatRubWhole(limit.dailyLimit)}</div>
          <div className="stat-note">
            в день до {formatDayMonth(limit.horizon)}
            {limit.noFreeMoney ? ' · свободных денег до дохода пока нет' : ''}
          </div>
        </section>
      ) : (
        <div className="card stub">
          <p>Лимит появится, когда вы укажете остаток основного счёта.</p>
        </div>
      )}

      <section className="card list-card">
        <RowButton title="Основной счёт" value={a.balance === null ? 'не указан' : formatRub(a.balance)} onClick={() => onEdit(0)} />
        <RowButton
          title="Доход"
          sub={
            a.incomes.length
              ? a.incomes.map((i) => `${i.name}: ${incomeScheduleText(i.schedule)}`).join('; ')
              : a.stretchUntil
                ? `регулярного нет, деньги до ${formatDayMonth(a.stretchUntil)}`
                : 'регулярного нет, деньги на 30 дней вперёд'
          }
          value={a.incomes.length ? amountText(a.incomes[0]) : undefined}
          onClick={() => onEdit(1)}
        />
        <RowButton
          title="Обязательные платежи"
          sub={a.payments.length ? a.payments.map((p) => p.name).join(', ') : 'нет'}
          value={a.payments.length ? formatRub(paymentsTotal) : undefined}
          onClick={() => onEdit(2)}
        />
        <RowButton
          title="Транспорт"
          value={a.transportMonthly > 0 ? `${formatRub(a.transportMonthly)} в мес.` : 'нет'}
          onClick={() => onEdit(3)}
        />
        <RowButton
          title={a.goal ? `Цель «${a.goal.name}»` : 'Накопления'}
          sub={a.goal ? `${formatRub(a.savings)} из ${formatRub(a.goal.target)}${a.goal.deadline ? ` · к ${formatDayMonth(a.goal.deadline)}` : ''}` : undefined}
          value={a.goal ? undefined : a.savings > 0 ? formatRub(a.savings) : 'нет'}
          onClick={() => onEdit(4)}
        />
        <RowButton title="Откладывать" value={a.savePercent > 0 ? `${a.savePercent} %` : 'пока нет'} onClick={() => onEdit(5)} />
        <RowButton
          title="Не экономить на"
          value={
            a.protectedCategoryIds.length
              ? a.protectedCategoryIds.map((id) => DEFAULT_CATEGORIES.find((c) => c.id === id)?.name).join(', ')
              : 'ничего не отмечено'
          }
          onClick={() => onEdit(6)}
        />
      </section>
      {a.savePercent > 0 && (
        <p className="hint">Откладывание начнётся с ближайшего дохода: когда он придёт, нажмите «Записать доход → Пришла».</p>
      )}

      <div className="onboard-actions">
        <button type="button" className="btn btn-primary btn-wide btn-big" onClick={() => onDone(buildFromAnswers(a, today, Date.now()))}>
          Всё верно — начать
        </button>
      </div>
    </div>
  );
}

