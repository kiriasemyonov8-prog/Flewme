// Деньги: только целые копейки. Брендированный тип не даёт случайно
// сложить копейки с обычным числом (например, с количеством дней).

export type Kopecks = number & { readonly __brand: 'Kopecks' };

export function kop(value: number): Kopecks {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Сумма должна быть целым числом копеек, получено: ${value}`);
  }
  return value as Kopecks;
}

/** Целые рубли → копейки. */
export function rub(rubles: number): Kopecks {
  return kop(rubles * 100);
}

export const ZERO = kop(0);

export function add(...values: Kopecks[]): Kopecks {
  let sum = 0;
  for (const v of values) sum += v;
  return kop(sum);
}

export function sub(a: Kopecks, b: Kopecks): Kopecks {
  return kop(a - b);
}

export function min(a: Kopecks, b: Kopecks): Kopecks {
  return a < b ? a : b;
}

export function max(a: Kopecks, b: Kopecks): Kopecks {
  return a > b ? a : b;
}

/** Целочисленное деление с округлением вниз (до копейки). */
export function divFloor(a: Kopecks, divisor: number): Kopecks {
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new Error(`Делитель должен быть целым положительным, получено: ${divisor}`);
  }
  return kop(Math.floor(a / divisor));
}

export function mulInt(a: Kopecks, factor: number): Kopecks {
  if (!Number.isSafeInteger(factor)) throw new Error(`Множитель должен быть целым: ${factor}`);
  return kop(a * factor);
}

/** Процент (целое число процентов) от суммы, округление вниз. */
export function percentOf(a: Kopecks, percent: number): Kopecks {
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) {
    throw new Error(`Процент должен быть целым от 0 до 100: ${percent}`);
  }
  return kop(Math.floor((a * percent) / 100));
}

export function sum(values: Kopecks[]): Kopecks {
  return add(...values);
}
