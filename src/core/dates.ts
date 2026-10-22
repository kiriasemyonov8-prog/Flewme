// Календарные даты без часовых поясов: строка 'YYYY-MM-DD'.
// Арифметика идёт через UTC, чтобы переход на летнее время не сдвигал дни.

export type ISODate = string;
/** Месяц 'YYYY-MM'. */
export type ISOMonth = string;

const DAY_MS = 86_400_000;

function toUtc(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function makeDate(year: number, month: number, day: number): ISODate {
  return fromUtc(Date.UTC(year, month - 1, day));
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Сколько дней от a до b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function monthOf(date: ISODate): ISOMonth {
  return date.slice(0, 7);
}

export function addMonths(month: ISOMonth, delta: number): ISOMonth {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function daysInMonth(month: ISOMonth): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** День месяца; 29–31 в коротком месяце превращается в последний день. */
export function dateInMonth(month: ISOMonth, day: number): ISODate {
  const d = Math.min(day, daysInMonth(month));
  return `${month}-${String(d).padStart(2, '0')}`;
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10));
}

/** Сегодняшняя локальная дата устройства. */
export function todayLocal(now: Date = new Date()): ISODate {
  return makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
