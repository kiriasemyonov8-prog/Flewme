import { CircleAlert, CircleCheck, CircleHelp, Hourglass, Scale, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { CONFIG } from '../core/config';
import { diffDays } from '../core/dates';
import { formatDayMonth, formatPermille, formatRub, formatRubWhole, parseRubInput } from '../core/format';
import {
  evaluatePurchase,
  type PurchaseResult,
  type PurchaseSource,
  type Recommendation,
  type SavingMethod,
  type Verdict,
} from '../core/purchase';
import type { FinanceData } from '../core/types';
import type { FinanceStore } from '../state/useFinance';
import { Segmented } from '../ui/Form';
import { AmountDisplay, Keypad } from '../ui/Keypad';
import { approxDuration } from './finance/GoalSheets';

const VERDICTS: Record<Verdict, { word: string; Icon: LucideIcon; color: string }> = {
  yes: { word: 'Можно', Icon: CircleCheck, color: 'var(--verdict-yes)' },
  compromise: { word: 'Можно, но с компромиссом', Icon: Scale, color: 'var(--verdict-compromise)' },
  wait: { word: 'Лучше подождать', Icon: Hourglass, color: 'var(--verdict-wait)' },
  no: { word: 'Не стоит', Icon: CircleAlert, color: 'var(--verdict-no)' },
  unknown: { word: 'Вывод сделать нельзя', Icon: CircleHelp, color: 'var(--text-muted)' },
};

function sourceKey(s: PurchaseSource): string {
  return s.kind === 'other' ? `other:${s.accountId}` : s.kind;
}

function explain(r: PurchaseResult): string {
  const goal = r.goalAfter?.goal;
  switch (r.reason) {
    case 'fits':
      return `По вашим данным хватает: покупка забирает ${r.sharePercent}% доступных денег.`;
    case 'takesMuch':
      return `По вашим данным хватает, но покупка забирает ${r.sharePercent}% доступных денег.`;
    case 'canSaveSoon':
      return `Сейчас не хватает ${formatRub(r.shortfall)}. По вашим данным это можно собрать примерно к ${formatDayMonth(r.readyDate!)}.`;
    case 'tooLongToSave':
      return `Не хватает ${formatRub(r.shortfall)}, и копить придётся долго — примерно до ${formatDayMonth(r.readyDate!)} ${r.readyDate!.slice(0, 4)}.`;
    case 'breaksGoal':
      return `Покупка отодвинет цель${goal ? ` «${goal.name}»` : ''} больше чем на год. Можно найти вариант мягче.`;
    case 'cannotEstimate':
      return `Не хватает ${formatRub(r.shortfall)}, а откладывать по вашим данным сейчас не из чего, поэтому срок не назвать.`;
  }
}

function recommendationText(rec: Recommendation, data: FinanceData): string {
  switch (rec.type) {
    case 'waitIncome':
      return `Дождаться дохода ${formatDayMonth(rec.date)}: тогда по вашим данным хватит без компромисса.`;
    case 'saveDaily': {
      const names = data.questionnaire.protectedCategoryIds
        .map((id) => data.categories.find((c) => c.id === id)?.name)
        .filter(Boolean);
      return rec.method === 'setAside'
        ? `Копить из отложенного (около ${formatRubWhole(rec.perDay)} в день) — хватит примерно к ${formatDayMonth(rec.readyDate)}.`
        : `Откладывать ${formatRubWhole(rec.perDay)} в день из лимита — хватит примерно к ${formatDayMonth(rec.readyDate)}` +
            (names.length ? `, не трогая: ${names.join(', ')}.` : '.');
    }
    case 'fromSavings': {
      const i = rec.impact;
      if (!i) return `Взять ${formatRub(rec.amount)} из накоплений, не привязанных к целям.`;
      return (
        `Взять ${formatRub(rec.amount)} из накоплений: цель «${i.goal.name}» ${formatPermille(i.from)} → ${formatPermille(i.to)}` +
        (i.delayDays ? `, отодвинется примерно на ${approxDuration(i.delayDays)}.` : '.')
      );
    }
    case 'cheaper':
      return `Без компромисса сейчас укладывается покупка до ${formatRub(rec.upTo)}.`;
  }
}

export function PurchaseScreen({ store }: { store: FinanceStore }) {
  const { data, today, limit } = store;
  const others = data.accounts.filter((a) => a.kind === 'other');
  const [source, setSource] = useState<PurchaseSource>({ kind: 'main' });
  const [text, setText] = useState('');
  const [method, setMethod] = useState<SavingMethod>('setAside');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = parseRubInput(text);
  // Накопления и другие счета проверяются и без лимита (3.26, п. 18).
  const needsLimit = source.kind === 'main' || source.kind === 'all';
  const canCheck = limit.status === 'ok' || !needsLimit;
  const result =
    shown && price && canCheck
      ? evaluatePurchase(data, limit.status === 'ok' ? limit : null, price, source, today, method)
      : null;

  const sources: { value: string; label: string; source: PurchaseSource }[] = [
    { value: 'main', label: 'Основной', source: { kind: 'main' } },
    { value: 'savings', label: 'Накопления', source: { kind: 'savings' } },
    { value: 'all', label: 'Все счета', source: { kind: 'all' } },
    ...others.map((a) => ({ value: `other:${a.id}`, label: a.name, source: { kind: 'other' as const, accountId: a.id } })),
  ];

  return (
    <>
      <h1 className="screen-title">Рассчитать покупку</h1>

      <div className="chips" role="radiogroup" aria-label="Откуда деньги">
        {sources.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={sourceKey(source) === s.value}
            className={`chip${sourceKey(source) === s.value ? ' is-on' : ''}`}
            onClick={() => setSource(s.source)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {!canCheck ? (
        <div className="card stub">
          <p>
            Чтобы проверить покупку с основного счёта, Флюми нужен его остаток. Укажите его в профиле — или выберите
            источник «Накопления».
          </p>
        </div>
      ) : !result ? (
        <section className="card purchase-input">
          <span className="field-label">Сколько стоит покупка</span>
          <AmountDisplay value={text} />
          {error && <p className="field-error">{error}</p>}
          <Keypad
            onChange={(u) => {
              setText(u);
              setError(null);
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={() => (price ? setShown(true) : setError('Введите сумму'))}
          >
            Рассчитать
          </button>
        </section>
      ) : (
        <>
          <section className="card verdict-card" style={{ borderColor: VERDICTS[result.verdict].color }}>
            <div className="verdict-head" style={{ color: VERDICTS[result.verdict].color }}>
              {(() => {
                const V = VERDICTS[result.verdict].Icon;
                return <V size={26} aria-hidden />;
              })()}
              <span>{VERDICTS[result.verdict].word}</span>
            </div>
            <div className="verdict-price num">{formatRub(result.price)}</div>
            <p className="verdict-text">{explain(result)}</p>
            <div className="list-row">
              <span className="row-sub">Доступно из выбранного</span>
              <span className="num">{formatRub(result.available)}</span>
            </div>
            {result.limitAfter && result.shortfall === 0 && limit.status === 'ok' && (
              <div className="list-row">
                <span className="row-sub">Лимит в день до {formatDayMonth(limit.horizon)}</span>
                <span className="num">
                  {formatRubWhole(result.limitAfter.from)} → {formatRubWhole(result.limitAfter.to)}
                </span>
              </div>
            )}
            {result.goalAfter && result.shortfall === 0 && (
              <div className="list-row">
                <span className="row-sub">Цель «{result.goalAfter.goal.name}»</span>
                <span className="num">
                  {formatPermille(result.goalAfter.from)} → {formatPermille(result.goalAfter.to)}
                  {result.goalAfter.delayDays ? ` (≈ ${approxDuration(result.goalAfter.delayDays)})` : ''}
                </span>
              </div>
            )}
          </section>

          {result.shortfall > 0 && (
            <section className="card">
              <span className="field-label">Как копить недостающее</span>
              <Segmented
                label="Как копить"
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'setAside', label: 'Из отложенного' },
                  { value: 'cutLimit', label: 'Урезать лимит' },
                ]}
              />
              {method === 'cutLimit' && (
                <p className="hint">Каждый день откладывать {CONFIG.purchase.cutLimitPercent}% дневного лимита.</p>
              )}
              {result.readyDate && (
                <p className="hint">
                  Примерно {approxDuration(diffDays(today, result.readyDate))}, к {formatDayMonth(result.readyDate)}.
                </p>
              )}
            </section>
          )}

          {result.recommendations.length > 0 && (
            <section className="card list-card">
              <h2 className="card-title">Рекомендации</h2>
              <ul className="recs">
                {result.recommendations.map((rec) => (
                  <li key={rec.type}>{recommendationText(rec, data)}</li>
                ))}
              </ul>
            </section>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-wide"
            onClick={() => {
              setShown(false);
              setText('');
            }}
          >
            Проверить другую покупку
          </button>
        </>
      )}
    </>
  );
}
