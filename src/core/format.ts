// Форматирование сумм и дат для экрана. Без чисел с плавающей точкой.
import type { ISODate } from './dates';
import type { Kopecks } from './money';

const NBSP = ' ';
const THIN = ' ';

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** 105000 → «1 050 ₽», 105001 → «1 050,01 ₽». */
export function formatRub(value: Kopecks): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  const rubles = Math.floor(abs / 100);
  const kopecks = abs % 100;
  const tail = kopecks ? `,${String(kopecks).padStart(2, '0')}` : '';
  return `${sign}${group(rubles)}${tail}${NBSP}₽`;
}

/** Для крупных чисел: копейки отбрасываются вниз, 109827 → «1 098 ₽». */
export function formatRubWhole(value: Kopecks): string {
  return formatRub((value - (((value % 100) + 100) % 100)) as Kopecks);
}

/**
 * Строка с экранной клавиатуры → копейки, без чисел с плавающей точкой.
 * «1050» → 105000, «1050,5» → 105050, «» или «0» → null.
 */
export function parseRubInput(text: string): Kopecks | null {
  const m = /^(\d{0,9})(?:,(\d{0,2}))?$/.exec(text);
  if (!m) return null;
  const rubles = m[1] ? Number(m[1]) : 0;
  const kopecks = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  const value = rubles * 100 + kopecks;
  return value > 0 ? (value as Kopecks) : null;
}

/** Округление вверх до рубля (для перерасхода, чтобы не преуменьшать): 10173 → «102 ₽». */
export function formatRubWholeUp(value: Kopecks): string {
  return formatRub((Math.ceil(value / 100) * 100) as Kopecks);
}

/** Копейки → строка для экранной клавиатуры: 105000 → «1050», 105050 → «1050,5». */
export function toRubInput(value: Kopecks): string {
  if (value <= 0) return '';
  const rubles = Math.floor(value / 100);
  const kopecks = value % 100;
  if (!kopecks) return String(rubles);
  return `${rubles},${String(kopecks).padStart(2, '0').replace(/0$/, '')}`;
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** '2026-10-21' → «21 октября». */
export function formatDayMonth(date: ISODate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d}${NBSP}${MONTHS_GEN[m - 1]}`;
}

/** 1 день, 2 дня, 5 дней. */
export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

/** Прогресс в десятых процента: 100 → «10%», 105 → «10,5%». */
export function formatPermille(p: number): string {
  const whole = Math.floor(p / 10);
  const frac = p % 10;
  return frac ? `${whole},${frac}%` : `${whole}%`;
}
