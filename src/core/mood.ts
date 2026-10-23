// Настроение робота по тратам за сегодня с основного счёта (SPEC, раздел 4, 3.16).
// Три выражения: спокойствие, радость, грусть.
import type { Kopecks } from './money';

export type Mood = 'calm' | 'joy' | 'sad';

/**
 * noFreeMoney — режим «денег не хватает» (3.26, п. 11): человек и так знает, что денег мало,
 * поэтому робот спокоен. Грусть — только перерасход, когда лимит больше нуля.
 */
export function robotMood(spentToday: Kopecks, dailyLimit: Kopecks, noFreeMoney = false): Mood {
  if (spentToday <= 0 || noFreeMoney) return 'calm';
  if (spentToday <= dailyLimit) return 'joy';
  return 'sad';
}
