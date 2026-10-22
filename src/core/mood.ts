// Настроение робота по тратам за сегодня с основного счёта (SPEC, раздел 4).
import { CONFIG } from './config';
import type { Kopecks } from './money';

export type Mood = 'calm' | 'joy' | 'thoughtful' | 'sad';

export function robotMood(spentToday: Kopecks, dailyLimit: Kopecks): Mood {
  if (spentToday <= 0) return 'calm';
  if (spentToday <= dailyLimit) return 'joy';
  // Сравнение в целых: spent ≤ 1,2 × L  ⇔  spent × 100 ≤ L × 120.
  if (spentToday * 100 <= dailyLimit * CONFIG.moodThoughtfulPercent) return 'thoughtful';
  return 'sad';
}
