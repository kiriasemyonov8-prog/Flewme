// Настроение робота по тратам за сегодня с основного счёта (SPEC, раздел 4, 3.16).
// Три выражения: спокойствие, радость, грусть.
import type { Kopecks } from './money';

export type Mood = 'calm' | 'joy' | 'sad';

export function robotMood(spentToday: Kopecks, dailyLimit: Kopecks): Mood {
  if (spentToday <= 0) return 'calm';
  if (spentToday <= dailyLimit) return 'joy';
  return 'sad';
}
