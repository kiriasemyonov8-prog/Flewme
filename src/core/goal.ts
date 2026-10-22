// Прогресс цели = сумма на накопительном счёте (SPEC, раздел 7).
import type { Kopecks } from './money';

/** Прогресс в десятых долях процента (целое число): 100 = 10,0%. */
export function goalProgressPermille(savings: Kopecks, target: Kopecks): number {
  if (target <= 0) return 0;
  const p = Math.floor((Math.max(0, savings) * 1000) / target);
  return Math.min(1000, p);
}
