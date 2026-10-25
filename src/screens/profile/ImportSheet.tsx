// Загрузка выписки банка (SPEC 3.30): файл читается на устройстве и никуда не отправляется.
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  applyImport,
  decodeBankFile,
  parseBankCsv,
  planImport,
  rememberedTransferCategory,
  type ImportPlan,
  type ImportResult,
} from '../../core/bankImport';
import { formatDayMonth, formatRub } from '../../core/format';
import { sum, type Kopecks } from '../../core/money';
import { parseBankPdf, pdfLines, type BankStatement } from '../../core/bankPdf';
import { setAccountBalance } from '../../core/profile';
import type { FinanceData } from '../../core/types';
import { readPdfItems } from '../../state/pdfText';
import { newId } from '../../state/useFinance';
import { Toggle } from '../../ui/Form';
import { ChoiceChips } from '../../ui/Repeat';
import { Sheet } from '../../ui/Sheet';

export function ImportSheet({
  data,
  onApply,
  onClose,
}: {
  data: FinanceData;
  onApply: (next: FinanceData) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const spendable = data.accounts.filter((a) => a.kind !== 'savings');
  const [accountId, setAccountId] = useState(spendable.find((a) => a.kind === 'main')?.id ?? spendable[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [merchantCats, setMerchantCats] = useState<Record<string, string>>({});
  const [transferCats, setTransferCats] = useState<Record<string, string>>({});
  const [savingsAsTransfer, setSavingsAsTransfer] = useState(data.importRules?.savingsAsTransfer ?? false);
  const [incomes, setIncomes] = useState<string[]>([]);
  const [showTransfers, setShowTransfers] = useState(false);
  const [reading, setReading] = useState(false);
  const [closing, setClosing] = useState<BankStatement['closing'] | null>(null);
  const [balanceUpdated, setBalanceUpdated] = useState(false);
  const categoryOptions = data.categories.map((c) => ({ value: c.id, label: c.name }));
  const hasSavingsAccount = data.accounts.some((a) => a.kind === 'savings');

  /** Читаем CSV или PDF-выписку (Сбер, Т-Банк) — прямо на устройстве (3.31). */
  async function readStatement(file: File): Promise<BankStatement | 'unknownFormat'> {
    const bytes = await file.arrayBuffer();
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      return parseBankPdf(pdfLines(await readPdfItems(bytes)));
    }
    const ops = parseBankCsv(decodeBankFile(bytes));
    return ops === 'unknownFormat' ? ops : { bank: 'csv', ops };
  }

  async function pick(file: File) {
    setError(null);
    setReading(true);
    let statement: BankStatement | 'unknownFormat';
    try {
      statement = await readStatement(file);
    } catch {
      statement = 'unknownFormat';
    } finally {
      setReading(false);
    }
    if (statement === 'unknownFormat') {
      return setError(
        'Не узнаю этот файл. Подходят PDF-выписка Сбера («Выписка по счёту дебетовой карты»), PDF-справка Т-Банка («Справка о движении средств») или выгрузка операций в CSV.',
      );
    }
    setClosing(statement.closing ?? null);
    const p = planImport(data, statement.ops, accountId);
    setPlan(p);
    // Переводы, которые этому получателю уже отмечали тратой, предлагаем так же.
    const remembered: Record<string, string> = {};
    for (const m of p.movements) {
      const cat = m.kind === 'transferOut' ? rememberedTransferCategory(data, m.recipient) : null;
      if (cat) remembered[m.key] = cat;
    }
    setTransferCats(remembered);
  }

  if (result) {
    return (
      <Sheet title="Выписка загружена" onClose={onClose}>
        <p className="close-question">
          Добавлено трат: <b className="num">{result.addedExpenses}</b>
          {result.duplicates > 0 ? `, ещё ${result.duplicates} уже были записаны вручную` : ''}.
        </p>
        <p className="hint">
          Переводы и другие движения денег ({result.addedMovements}) учтены в остатке счёта, но тратами не считаются.
          {result.confirmedIncomes > 0 ? ` Подтверждено доходов: ${result.confirmedIncomes}.` : ''}
        </p>
        {/* Остаток из выписки (3.31): одной кнопкой, и он больше не устаревший */}
        {closing && !balanceUpdated && (
          <div className="card notice">
            <span>
              По выписке на {formatDayMonth(closing.date)} на счёте <b className="num">{formatRub(closing.amount)}</b>. Обновить
              остаток?
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onApply(setAccountBalance(result.data, accountId, closing.amount, closing.date, Date.now() + 1));
                setBalanceUpdated(true);
              }}
            >
              Обновить
            </button>
          </div>
        )}
        {balanceUpdated && closing && <p className="hint">Остаток обновлён: {formatRub(closing.amount)} на {formatDayMonth(closing.date)}.</p>}
        <button type="button" className="btn btn-primary btn-wide" onClick={onClose}>
          Готово
        </button>
      </Sheet>
    );
  }

  if (!plan) {
    return (
      <Sheet title="Загрузить выписку банка" onClose={onClose}>
        <p className="hint">
          Подходят PDF-выписка Сбера, PDF-справка Т-Банка о движении средств или выгрузка операций в CSV. Файл
          читается прямо на этом устройстве и никуда не отправляется. Покупки станут тратами, переводы — нет.
        </p>
        {spendable.length > 1 && (
          <>
            <div className="sub-title">На какой счёт</div>
            <ChoiceChips label="Счёт" value={accountId} onChange={setAccountId} options={spendable.map((a) => ({ value: a.id, label: a.name }))} />
          </>
        )}
        <button type="button" className="btn btn-primary btn-wide" disabled={reading} onClick={() => fileRef.current?.click()}>
          <Upload size={18} aria-hidden /> {reading ? 'Читаю выписку…' : 'Выбрать файл'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain,application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void pick(f);
          }}
        />
        {error && <p className="field-error">{error}</p>}
      </Sheet>
    );
  }

  const toAdd = plan.purchases.filter((p) => !p.duplicateOf);
  const transfers = plan.movements.filter((m) => m.kind === 'transferOut');
  const transfersTotal = sum(transfers.map((m) => -m.op.amount as Kopecks));
  const hasSavings = plan.movements.some((m) => m.kind === 'savings');

  return (
    <Sheet title="Что в выписке" onClose={onClose}>
      {plan.from ? (
        <p className="close-question">
          С {formatDayMonth(plan.from)} по {formatDayMonth(plan.to)}: покупок <b className="num">{toAdd.length}</b> на{' '}
          <b className="num">{formatRub(sum(toAdd.map((p) => p.amount)))}</b>.
        </p>
      ) : (
        <p className="close-question">Новых операций нет — этот файл уже загружали.</p>
      )}
      <ul className="import-facts">
        {plan.purchases.length - toAdd.length > 0 && <li>Уже записаны вручную: {plan.purchases.length - toAdd.length} — второй раз не добавятся.</li>}
        {plan.refundsApplied > 0 && <li>Учтено возвратов: {plan.refundsApplied}.</li>}
        {plan.alreadyImported > 0 && <li>Уже загружали раньше: {plan.alreadyImported}.</li>}
      </ul>

      {plan.unknownMerchants.length > 0 && (
        <>
          <div className="sub-title">Что это за магазины?</div>
          <p className="hint">Спрошу один раз и запомню. Без ответа — «Другое».</p>
          {plan.unknownMerchants.map((u) => (
            <div key={u.merchant} className="import-row">
              <div className="row-title">{u.merchant}</div>
              <div className="row-sub">
                {u.count} {u.count === 1 ? 'покупка' : 'покупки'} · {formatRub(u.total)}
              </div>
              <ChoiceChips
                label={`Категория ${u.merchant}`}
                value={merchantCats[u.merchant] ?? ''}
                onChange={(v) => setMerchantCats((m) => ({ ...m, [u.merchant]: v }))}
                options={categoryOptions}
              />
            </div>
          ))}
        </>
      )}

      {hasSavings && (
        <>
          <div className="sub-title">Брокерский счёт и Инвесткопилка</div>
          <Toggle label="Это перевод в накопления" checked={savingsAsTransfer} onChange={setSavingsAsTransfer} />
          <p className="hint">
            {hasSavingsAccount
              ? 'Тогда эти пополнения уменьшат «отложить в накопления», как кнопка «Перевёл». Запомню ответ.'
              : 'Чтобы учитывать их как откладывание, добавьте накопительный счёт в профиле. Пока они просто уменьшат остаток.'}
          </p>
        </>
      )}

      {plan.incomes.length > 0 && (
        <>
          <div className="sub-title">Похоже на доход</div>
          {plan.incomes.map((i) => (
            <Toggle
              key={i.key}
              label={`${formatRub(i.op.amount)}, ${formatDayMonth(i.op.date)} — это «${i.income.name}»?`}
              checked={incomes.includes(i.key)}
              onChange={(on) => setIncomes((list) => (on ? [...list, i.key] : list.filter((k) => k !== i.key)))}
            />
          ))}
        </>
      )}

      {transfers.length > 0 && (
        <>
          <button type="button" className="link-btn import-transfers" onClick={() => setShowTransfers(!showTransfers)}>
            Пропущено переводов: {transfers.length} на {formatRub(transfersTotal)} — {showTransfers ? 'скрыть' : 'посмотреть'}
          </button>
          {showTransfers &&
            transfers.map((m) => {
              const asExpense = m.key in transferCats;
              return (
                <div key={m.key} className="import-row">
                  <Toggle
                    label={`${formatRub(-m.op.amount as Kopecks)}, ${formatDayMonth(m.op.date)}${m.recipient ? ` · ${m.recipient}` : ''} — это трата`}
                    checked={asExpense}
                    onChange={(on) =>
                      setTransferCats((t) => {
                        const next = { ...t };
                        if (on) next[m.key] = 'other';
                        else delete next[m.key];
                        return next;
                      })
                    }
                  />
                  {asExpense && (
                    <ChoiceChips
                      label="Категория перевода"
                      value={transferCats[m.key]}
                      onChange={(v) => setTransferCats((t) => ({ ...t, [m.key]: v }))}
                      options={categoryOptions}
                    />
                  )}
                </div>
              );
            })}
        </>
      )}

      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => {
          const r = applyImport(
            data,
            plan,
            { merchantCategories: merchantCats, transfersAsExpense: transferCats, savingsAsTransfer, confirmedIncomes: incomes },
            accountId,
            Date.now(),
            newId,
          );
          onApply(r.data);
          setResult(r);
        }}
      >
        Загрузить
      </button>
    </Sheet>
  );
}
