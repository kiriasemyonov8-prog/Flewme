// PDF-выписки (SPEC 3.31): «Выписка по счёту дебетовой карты» Сбера и «Справка о движении средств»
// Т-Банка. Сам PDF читает pdf.js в интерфейсе; сюда приходят кусочки текста с координатами,
// а дальше — чистые функции: строки таблицы → операции. Файл никуда не отправляется.
import type { ISODate } from './dates';
import type { Kopecks } from './money';
import { parseBankAmount, type BankOp } from './bankImport';

/** Кусочек текста со страницы PDF: координаты в пунктах, y растёт вверх. */
export interface PdfItem {
  page: number;
  x: number;
  y: number;
  str: string;
}

export interface BankStatement {
  bank: 'sber' | 'tbank' | 'csv';
  ops: BankOp[];
  /** Остаток счёта на конец выписки, если банк его указывает. */
  closing?: { date: ISODate; amount: Kopecks };
}

/** Собираем кусочки в строки: одна строка — одинаковая высота на странице (с допуском). */
export function pdfLines(items: PdfItem[]): string[] {
  const pages = new Map<number, PdfItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    pages.set(it.page, [...(pages.get(it.page) ?? []), it]);
  }
  const out: string[] = [];
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    const rows: { y: number; items: PdfItem[] }[] = [];
    for (const it of [...pages.get(page)!].sort((a, b) => b.y - a.y)) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 2.5);
      if (row) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    for (const r of rows) {
      out.push(normalize(r.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ')));
    }
  }
  return out;
}

/** Все виды пробелов (в суммах банки ставят неразрывные) — в обычный, без лишних. */
function normalize(s: string): string {
  return s.replace(/[\s   ]+/g, ' ').trim();
}

const toIso = (d: string): ISODate => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
const NUM = String.raw`\d{1,3}(?: \d{3})*`;

// ——— Сбер ———

const SBER_START = new RegExp(String.raw`^(\d{2}\.\d{2}\.\d{4}) (\d{2}:\d{2}) (.+?) (\+?${NUM},\d{2}) (${NUM},\d{2})$`);
const SBER_SECOND = /^\d{2}\.\d{2}\.\d{4} \S+ (.*)$/;
const SBER_STOP = /^(Продолжение на следующей|Выписка по сч[её]ту дебетовой карты|ДАТА ОПЕРАЦИИ|Дата обработки|и код авторизации|Описание операции|операции|В валюте сч[её]та|Дата формирования|ПАО Сбербанк|Для проверки|\d\. )/i;
// Остаток может стоять в одном ряду с другими полями шапки («Валюта … Остаток на …»).
const SBER_CLOSING = new RegExp(String.raw`Остаток на (\d{2}\.\d{2}\.\d{4}) (-?${NUM},\d{2})$`);

/**
 * Сбер: у операции две строки — «дата время категория сумма остаток» и «дата код описание»,
 * описание может продолжаться ниже. Траты без знака, пополнения с «+».
 */
function parseSber(lines: string[]): BankStatement {
  const ops: BankOp[] = [];
  let cur: (BankOp & { open: boolean }) | null = null;
  let closing: BankStatement['closing'];
  const flush = () => {
    if (cur) ops.push({ date: cur.date, time: cur.time, amount: cur.amount, description: cur.description.trim(), bankCategory: cur.bankCategory });
    cur = null;
  };
  for (const line of lines) {
    const c = SBER_CLOSING.exec(line);
    if (c) {
      const amount = parseBankAmount(c[2]);
      if (amount !== null && (!closing || toIso(c[1]) >= closing.date)) closing = { date: toIso(c[1]), amount };
      continue;
    }
    const m = SBER_START.exec(line);
    if (m) {
      flush();
      const value = parseBankAmount(m[4].replace('+', ''));
      if (value === null) continue;
      cur = {
        date: toIso(m[1]),
        time: m[2],
        amount: (m[4].startsWith('+') ? value : -value) as Kopecks,
        description: '',
        bankCategory: m[3],
        open: true,
      };
      continue;
    }
    if (!cur) continue;
    if (SBER_STOP.test(line)) {
      cur.open = false;
      continue;
    }
    const second = SBER_SECOND.exec(line);
    if (second && !cur.description) cur.description = second[1];
    else if (cur.open) cur.description += ` ${line}`;
  }
  flush();
  return { bank: 'sber', ops, closing };
}

// ——— Т-Банк ———

const T_START = new RegExp(
  String.raw`^(\d{2}\.\d{2}\.\d{4}) \d{2}\.\d{2}\.\d{4} ([+-]${NUM}\.\d{2}) ₽ [+-]${NUM}\.\d{2} ₽ ?(.*?)(?: (\d{4}|—))?$`,
);
const T_TIMES = /^(\d{2}:\d{2}) \d{2}:\d{2}(?: (.*))?$/;
const T_STOP = /^(АО «ТБанк»|БИК|\d{1,2}$|Дата и время|операции списания|Пополнения:|Расходы:|С уважением|Руководитель)/;

/** Т-Банк: «дата дата сумма сумма описание карта», ниже — «время время продолжение описания». */
function parseTbank(lines: string[]): BankStatement {
  const ops: BankOp[] = [];
  let cur: { op: BankOp; open: boolean } | null = null;
  const flush = () => {
    if (cur) ops.push({ ...cur.op, description: cur.op.description.trim() });
    cur = null;
  };
  for (const line of lines) {
    const m = T_START.exec(line);
    if (m) {
      flush();
      const amount = parseBankAmount(m[2]);
      if (amount === null) continue;
      cur = { op: { date: toIso(m[1]), time: '', amount, description: m[3] }, open: true };
      continue;
    }
    if (!cur) continue;
    if (T_STOP.test(line)) {
      cur.open = false;
      continue;
    }
    const t = T_TIMES.exec(line);
    if (t && !cur.op.time) {
      cur.op.time = t[1];
      if (t[2]) cur.op.description += ` ${t[2]}`;
    } else if (cur.open) cur.op.description += ` ${line}`;
  }
  flush();
  return { bank: 'tbank', ops };
}

/** Какой банк — по шапке документа; незнакомый документ — понятная ошибка. */
export function parseBankPdf(lines: string[]): BankStatement | 'unknownFormat' {
  const head = lines.slice(0, 40).join(' ');
  const statement = /Выписка по сч[её]ту дебетовой карты|СБЕР|Сбербанк/i.test(head)
    ? parseSber(lines)
    : /Справка о движении средств|ТБАНК|Т-Банк/i.test(head)
      ? parseTbank(lines)
      : null;
  return statement && statement.ops.length ? statement : 'unknownFormat';
}
