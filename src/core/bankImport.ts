// Импорт выписки банка (SPEC 3.30). Файл читается на устройстве и никуда не отправляется.
// Покупки — тратами с категориями; переводы и другие движения денег — не траты,
// но меняют остаток счёта. Всё — чистые функции: «текст файла → план → новые данные».
import { incomesToConfirm } from './actions';
import { diffDays, type ISODate } from './dates';
import { ZERO, add, sub, type Kopecks } from './money';
import type { IncomeOccurrence } from './schedule';
import type { Expense, FinanceData, ImportRules } from './types';

/** Одна операция из выписки. amount: «−» — списание, «+» — поступление. */
export interface BankOp {
  date: ISODate;
  time: string;
  amount: Kopecks;
  description: string;
  bankCategory?: string;
  mcc?: string;
}

// ——— Чтение файла ———

/** Файл может быть в UTF-8 или в Windows-1251 (так часто выгружают банки). */
export function decodeBankFile(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** «-1 694,92» или «-1694.92» → копейки, без чисел с плавающей точкой. */
export function parseBankAmount(text: string): Kopecks | null {
  const t = text.replace(/[\s  ₽]|RUB/g, '').replace('−', '-');
  const m = /^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const kop = Number(m[2]) * 100 + Number((m[3] ?? '0').padEnd(2, '0'));
  return (m[1] === '-' ? -kop : kop) as Kopecks;
}

/** «24.10.2026 20:07:00» → дата и время. */
function parseBankDate(text: string): { date: ISODate; time: string } | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}))?/.exec(text.trim());
  if (!m) return null;
  return { date: `${m[3]}-${m[2]}-${m[1]}`, time: m[4] ?? '' };
}

/**
 * CSV из интернет-банка. Колонки узнаются по названиям, а не по порядку: «Дата операции»,
 * «Сумма операции», «Описание», «Категория», «MCC», «Статус». Неуспешные операции пропускаются.
 */
export function parseBankCsv(text: string): BankOp[] | 'unknownFormat' {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return 'unknownFormat';
  const sep = [';', '\t', ','].find((s) => lines[0].includes(s)) ?? ';';
  const head = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iDate = col('дата операции');
  const iAmount = col('сумма операции', 'сумма');
  const iDesc = col('описание');
  if (iDate < 0 || iAmount < 0 || iDesc < 0) return 'unknownFormat';
  const iCat = col('категория');
  const iMcc = col('mcc');
  const iStatus = col('статус');
  const ops: BankOp[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line, sep);
    if (iStatus >= 0 && c[iStatus] && !/^ok$/i.test(c[iStatus])) continue;
    const d = parseBankDate(c[iDate] ?? '');
    const amount = parseBankAmount(c[iAmount] ?? '');
    if (!d || amount === null || amount === 0) continue;
    ops.push({
      ...d,
      amount,
      description: c[iDesc] ?? '',
      bankCategory: iCat >= 0 ? c[iCat] || undefined : undefined,
      mcc: iMcc >= 0 ? c[iMcc] || undefined : undefined,
    });
  }
  return ops.length ? ops : 'unknownFormat';
}

// ——— Что это за операция ———

export type OpKind = 'purchase' | 'transferOut' | 'savings' | 'refund' | 'inflow' | 'service';

const CITY_WORDS = new Set(['MOSCOW', 'MOSKVA', 'MOSKOW', 'RUS', 'G', 'RU', 'LYUBERTSY', 'RAMENSKOE', 'MOSCOWRUS', 'Г', 'OOO', 'ООО', 'IP', 'ИП', 'SBSCR']);

/** Хвост сбербанковского описания: «. Операция по карте ****1234». */
function cleanDescription(description: string): string {
  return description.replace(/\.?\s*операция по карте\s*\*+\d*/i, '').trim();
}

/**
 * Название магазина без «Оплата в», города и номеров: «Оплата в MAGNOLIYA MOSCOW RUS» → «MAGNOLIYA».
 * Город стоит перед «RUS» и выбрасывается вместе с ним — так работает для любого города.
 */
export function merchantKey(description: string): string {
  const words = cleanDescription(description)
    .replace(/^возврат (средств по оплате|покупки)\s*/i, '')
    .replace(/^оплата( услуг| в)?\s*/i, '')
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/[^A-ZА-Я]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const rus = words.lastIndexOf('RUS');
  const noCity = rus > 0 ? [...words.slice(0, rus - 1), ...words.slice(rus + 1)] : words;
  const name = noCity.filter((w) => !CITY_WORDS.has(w));
  return name.slice(0, 2).join(' ') || description.trim().toUpperCase();
}

/** Кому перевод: телефон или название — по нему запоминается «это трата». */
export function recipientKey(description: string): string {
  const phone = /\+?\d[\d\s()-]{9,}\d/.exec(description)?.[0].replace(/\D/g, '');
  return phone ? `тел. …${phone.slice(-4)}` : description.replace(/^внешний перевод\s*/i, '').trim().slice(0, 40);
}

/** Перевод «в банк» маркетплейса — на деле покупка (Сбер так показывает оплату Wildberries и Ozon по СБП). */
const MARKETPLACE_BANK = /wildberries|вайлдберриз|ozon|озон/;
/** Описание начинается с названия другого банка — это перевод (Сбер: «ВТБ. Операция по карте»). */
const OTHER_BANK = /^(втб|т-банк|тинькофф|альфа|газпромбанк|райффайзен|совкомбанк|почта банк|мтс банк|сбер)(\.|\s|$)/;

export function classifyOp(op: BankOp): OpKind {
  const d = cleanDescription(op.description).toLowerCase();
  const cat = (op.bankCategory ?? '').toLowerCase();
  if (op.amount > 0) {
    if (/^возврат/.test(d) || /^возврат/.test(cat)) return 'refund';
    return 'inflow';
  }
  if (/брокерск|инвесткопилк|вклад|накопительн|vklad/.test(d)) return 'savings';
  const transferish = /перевод/.test(d) || /перевод/.test(cat) || OTHER_BANK.test(d);
  if (transferish && MARKETPLACE_BANK.test(d)) return 'purchase';
  if (transferish) return 'transferOut';
  if (/^плата за|комисси|снятие наличных/.test(d) || cat === 'наличные') return 'service';
  return 'purchase';
}

// ——— Категории ———

/** Встроенный словарь: часть названия магазина → категория (SPEC 3.30). */
const MERCHANT_WORDS: [string, RegExp][] = [
  ['food', /МАГНИТ|ПЯТЕРОЧКА|ВКУСВИЛЛ|ПЕРЕКРЕСТОК|KDV|RESTORAN|CAFE|PARITET|PRODTORG|MAGNOLIYA|PYATEROCHKA|MAGNIT|PEREKRESTOK|VKUSVILL|^VV\b|AROMA|PRODUKTY|ПОДМОСКОВ|LENTA|AUCHAN|DIXY|SAMOKAT|LUNCHBOX|VKUSNOITOCHKA|ROSTIKS|KFC|BURGER|CHAYKHANA|KOFE|COFFEE|VENDING|GOPOEDIM|EATANDSPLIT|BIRKRAFT|EBIDOEBI|IZBUSHKA|MIKROMARKET|DODO|SHOKOLADNITSA|EDA/],
  ['transport', /YANDEX GO|ЯНДЕКС ГО|TPP|AVTOBUS|WHOOSH|URENT|DRIVE|TRANSPORT|CPPK|ЦППК|METRO|TAXI|TAKSI|RZD|AEROEXPRESS|BELKA|DELIMOBIL|CITYDRIVE/],
  ['health', /GORZDRAV|APTEKA|АПТЕК|ZDRAV|RIGLA|ASNA|FITNESS|CLINIC|STOMAT/],
  ['home', /^MTS|МТС|BILAYN|БИЛАЙН|MEGAFON|МЕГАФОН|TELE|ROSTELECOM|ZHKU|ЖКУ|MOSENERGO|LEROY/],
  ['shopping', /ОЗОН|ВАЙЛДБЕРРИЗ|OZON|WILDBERRIES|^WB\b|FAMILIA|PODRUZHKA|LETUAL|ZOLOTOE|DNS|MVIDEO|ELDORADO|SHOP|AVITO|PLAYEROK|PLATI|MARKET/],
  ['fun', /QUICKTICKETS|AKVAPARK|GAMES|STEAM|KINO|CINEMA|IVI|OKKO|KINOPOISK|YANDEX PLUS|TEATR/],
  ['other', /NALOG|BUNDLE/],
];

/** Категории банка (если они есть в файле) → категории Флюми. */
const BANK_CATEGORIES: [string, RegExp][] = [
  ['food', /супермаркет|продукт|фастфуд|ресторан|кафе|еда/],
  ['transport', /транспорт|такси|каршеринг|топливо|авиабилет|ж\/д/],
  ['health', /аптек|медицин|здоров|спорт/],
  ['home', /связь|коммунал|жкх|дом и ремонт|для дома/],
  ['shopping', /одежд|обув|маркетплейс|электрон|техник|цвет|подарк/],
  ['fun', /развлеч|кино|игр|музык|цифров/],
];

/** Коды типа магазина (MCC) → категории Флюми. */
function mccCategory(mcc?: string): string | null {
  const n = Number(mcc);
  if (!n) return null;
  if ([5411, 5422, 5441, 5451, 5462, 5499, 5812, 5813, 5814].includes(n)) return 'food';
  if ([4111, 4112, 4121, 4131, 4789, 5541, 5542, 7512, 7523].includes(n)) return 'transport';
  if ([5912, 8011, 8021, 8062, 8099, 7997].includes(n)) return 'health';
  if ([4814, 4900].includes(n)) return 'home';
  if ([7832, 7841, 7994, 7996, 5815, 5816, 5817, 5818].includes(n)) return 'fun';
  if (n >= 5600 && n <= 5699) return 'shopping';
  return null;
}

/** Категория покупки: запомненная → из файла банка → словарь. null — Флюми спросит. */
export function guessCategory(op: BankOp, rules: ImportRules, categoryIds: Set<string>): string | null {
  const key = merchantKey(op.description);
  const ok = (id: string | null | undefined) => (id && categoryIds.has(id) ? id : null);
  const remembered = ok(rules.merchants[key]);
  if (remembered) return remembered;
  const bankCat = (op.bankCategory ?? '').toLowerCase();
  const fromBank = bankCat ? ok(BANK_CATEGORIES.find(([, re]) => re.test(bankCat))?.[0]) : null;
  if (fromBank) return fromBank;
  const fromMcc = ok(mccCategory(op.mcc));
  if (fromMcc) return fromMcc;
  return ok(MERCHANT_WORDS.find(([, re]) => re.test(key))?.[0]);
}

// ——— План загрузки ———

export interface PlannedPurchase {
  key: string;
  op: BankOp;
  merchant: string;
  /** Сумма после возвратов. */
  amount: Kopecks;
  categoryId: string | null;
  /** Уже записано вручную — эта трата не добавится. */
  duplicateOf?: string;
}

export interface PlannedMovement {
  key: string;
  op: BankOp;
  kind: 'transferOut' | 'savings' | 'inflow' | 'service' | 'refund';
  recipient?: string;
}

export interface PlannedIncome {
  key: string;
  op: BankOp;
  income: IncomeOccurrence;
}

export interface ImportPlan {
  from: ISODate;
  to: ISODate;
  purchases: PlannedPurchase[];
  movements: PlannedMovement[];
  /** Поступления, похожие на ожидаемый доход: Флюми предложит «Пришла». */
  incomes: PlannedIncome[];
  /** Магазины, категорию которых Флюми не знает. */
  unknownMerchants: { merchant: string; count: number; total: Kopecks }[];
  /** Сколько операций уже загружали раньше (повторная загрузка того же файла). */
  alreadyImported: number;
  /** Возвраты, учтённые в покупках. */
  refundsApplied: number;
}

const opKey = (op: BankOp) => `${op.date} ${op.time}|${op.amount}|${op.description}`;

function knownImportKeys(data: FinanceData): Set<string> {
  return new Set(
    [
      ...data.expenses.map((x) => x.importKey),
      ...(data.movements ?? []).map((x) => x.importKey),
      ...data.receipts.map((x) => x.importKey),
      ...data.transfers.map((x) => x.importKey),
    ].filter((k): k is string => Boolean(k)),
  );
}

function rulesOf(data: FinanceData): ImportRules {
  return data.importRules ?? { merchants: {}, recipients: {} };
}

/** Похоже на ожидаемый доход: дата в окне выплаты (± 5 дней), сумма около ожидаемой. */
function matchIncome(data: FinanceData, op: BankOp): IncomeOccurrence | null {
  return (
    incomesToConfirm(data, op.date).find(
      (o) =>
        diffDays(o.early, op.date) >= -5 &&
        diffDays(op.date, o.late) >= -5 &&
        op.amount * 10 >= o.min * 8 &&
        op.amount * 10 <= o.max * 12,
    ) ?? null
  );
}

export function planImport(data: FinanceData, ops: BankOp[], accountId: string): ImportPlan {
  const rules = rulesOf(data);
  const categoryIds = new Set(data.categories.map((c) => c.id));
  const known = knownImportKeys(data);
  const fresh = ops.filter((op) => !known.has(opKey(op)));
  const sorted = [...fresh].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const purchases: PlannedPurchase[] = [];
  const movements: PlannedMovement[] = [];
  const incomes: PlannedIncome[] = [];
  let refundsApplied = 0;

  for (const op of sorted) {
    const kind = classifyOp(op);
    const key = opKey(op);
    if (kind === 'purchase') {
      purchases.push({
        key,
        op,
        merchant: merchantKey(op.description),
        amount: -op.amount as Kopecks,
        categoryId: guessCategory(op, rules, categoryIds),
      });
    } else if (kind === 'refund') {
      // Возврат уменьшает ту покупку, к которой относится: тот же магазин, а если магазина в описании
      // нет — та же сумма за последние 2 дня.
      const merchant = merchantKey(op.description);
      const target = [...purchases]
        .reverse()
        .find(
          (p) =>
            p.amount >= op.amount &&
            diffDays(p.op.date, op.date) <= 60 &&
            (p.merchant === merchant || (p.amount === op.amount && diffDays(p.op.date, op.date) <= 2)),
        );
      if (target) {
        target.amount = sub(target.amount, op.amount);
        refundsApplied++;
      } else movements.push({ key, op, kind: 'refund' });
    } else if (kind === 'inflow') {
      const income = matchIncome(data, op);
      if (income && !incomes.some((i) => i.income.key === income.key)) incomes.push({ key, op, income });
      else movements.push({ key, op, kind: 'inflow' });
    } else {
      movements.push({ key, op, kind, recipient: kind === 'transferOut' ? recipientKey(op.description) : undefined });
    }
  }

  // Полностью возвращённые покупки не записываем.
  const kept = purchases.filter((p) => p.amount > 0);

  // Дубли с тратами, записанными вручную: та же сумма, тот же или соседний день, этот счёт.
  const manual = data.expenses.filter((x) => !x.importKey && x.accountId === accountId);
  const used = new Set<string>();
  for (const p of kept) {
    const twin = manual.find((x) => !used.has(x.id) && x.amount === p.amount && Math.abs(diffDays(x.date, p.op.date)) <= 1);
    if (twin) {
      used.add(twin.id);
      p.duplicateOf = twin.id;
    }
  }

  const unknown = new Map<string, { merchant: string; count: number; total: Kopecks }>();
  for (const p of kept) {
    if (p.categoryId || p.duplicateOf) continue;
    const u = unknown.get(p.merchant) ?? { merchant: p.merchant, count: 0, total: ZERO };
    unknown.set(p.merchant, { ...u, count: u.count + 1, total: add(u.total, p.amount) });
  }

  const dates = sorted.map((o) => o.date);
  return {
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    purchases: kept,
    movements,
    incomes,
    unknownMerchants: [...unknown.values()].sort((a, b) => b.total - a.total),
    alreadyImported: ops.length - fresh.length,
    refundsApplied,
  };
}

// ——— Применение ———

export interface ImportDecisions {
  /** Магазин → категория (ответы на «что это за магазин?»). */
  merchantCategories: Record<string, string>;
  /** Переводы, отмеченные как трата: ключ операции → категория. */
  transfersAsExpense: Record<string, string>;
  /** Брокерский счёт и Инвесткопилка — перевод в накопления. */
  savingsAsTransfer: boolean;
  /** Подтверждённые доходы (ключи операций). */
  confirmedIncomes: string[];
}

export interface ImportResult {
  data: FinanceData;
  addedExpenses: number;
  addedMovements: number;
  duplicates: number;
  confirmedIncomes: number;
}

export function applyImport(
  data: FinanceData,
  plan: ImportPlan,
  decisions: ImportDecisions,
  accountId: string,
  now: number,
  newId: () => string,
): ImportResult {
  const rules = rulesOf(data);
  const merchants = { ...rules.merchants, ...decisions.merchantCategories };
  const recipients = { ...rules.recipients };
  const expenses: Expense[] = [];
  const movements = [...(data.movements ?? [])];
  const transfers = [...data.transfers];
  const receipts = [...data.receipts];
  let addedMovements = 0;
  const savingsTarget = data.goals[0]?.accountId ?? data.accounts.find((a) => a.kind === 'savings')?.id;

  for (const p of plan.purchases) {
    if (p.duplicateOf) continue;
    expenses.push({
      id: newId(),
      amount: p.amount,
      accountId,
      categoryId: p.categoryId ?? merchants[p.merchant] ?? 'other',
      date: p.op.date,
      createdAt: now,
      note: p.merchant,
      importKey: p.key,
    });
  }

  for (const m of plan.movements) {
    const asExpense = m.kind === 'transferOut' ? decisions.transfersAsExpense[m.key] : undefined;
    if (asExpense) {
      expenses.push({
        id: newId(),
        amount: -m.op.amount as Kopecks,
        accountId,
        categoryId: asExpense,
        date: m.op.date,
        createdAt: now,
        note: `Перевод ${m.recipient ?? ''}`.trim(),
        importKey: m.key,
      });
      if (m.recipient) recipients[m.recipient] = asExpense;
      continue;
    }
    if (m.kind === 'savings' && decisions.savingsAsTransfer && savingsTarget) {
      transfers.push({
        id: newId(),
        fromAccountId: accountId,
        toAccountId: savingsTarget,
        amount: -m.op.amount as Kopecks,
        date: m.op.date,
        createdAt: now,
        purpose: 'setAside',
        importKey: m.key,
      });
      continue;
    }
    movements.push({
      id: newId(),
      accountId,
      amount: m.op.amount,
      date: m.op.date,
      createdAt: now,
      note: m.op.description,
      recipient: m.recipient,
      importKey: m.key,
    });
    addedMovements++;
  }

  let confirmed = 0;
  for (const inc of plan.incomes) {
    if (decisions.confirmedIncomes.includes(inc.key)) {
      receipts.push({ id: newId(), occurrenceKey: inc.income.key, amount: inc.op.amount, date: inc.op.date, createdAt: now, importKey: inc.key });
      confirmed++;
    } else {
      movements.push({ id: newId(), accountId, amount: inc.op.amount, date: inc.op.date, createdAt: now, note: inc.op.description, importKey: inc.key });
      addedMovements++;
    }
  }

  // Ручная трата, совпавшая с операцией из выписки, помечается ею: повторная загрузка её уже не предложит.
  const twins = new Map(plan.purchases.filter((p) => p.duplicateOf).map((p) => [p.duplicateOf!, p.key]));
  const marked = data.expenses.map((x) => (twins.has(x.id) ? { ...x, importKey: twins.get(x.id) } : x));

  return {
    data: {
      ...data,
      expenses: [...marked, ...expenses],
      movements,
      transfers,
      receipts,
      importRules: {
        merchants,
        recipients,
        savingsAsTransfer: plan.movements.some((m) => m.kind === 'savings') ? decisions.savingsAsTransfer : rules.savingsAsTransfer,
      },
    },
    addedExpenses: expenses.length,
    addedMovements,
    duplicates: plan.purchases.filter((p) => p.duplicateOf).length,
    confirmedIncomes: confirmed,
  };
}

/** Перевод этому получателю уже отмечали тратой — предложим так же. */
export function rememberedTransferCategory(data: FinanceData, recipient?: string): string | null {
  return recipient ? (rulesOf(data).recipients[recipient] ?? null) : null;
}
