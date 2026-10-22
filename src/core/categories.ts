// Стартовый набор категорий (SPEC, раздел 13).
import type { Category } from './types';

export const MAX_CATEGORIES = 12;
export const FOOD_ID = 'food';
export const OTHER_ID = 'other';

/** Готовая палитра для своих категорий (цвета из темы). */
export const CATEGORY_COLORS = [
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
  'var(--cat-7)',
];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: FOOD_ID, name: 'Еда', color: 'var(--cat-1)', locked: true },
  { id: 'transport', name: 'Транспорт', color: 'var(--cat-2)' },
  { id: 'home', name: 'Дом', color: 'var(--cat-3)' },
  { id: 'health', name: 'Здоровье', color: 'var(--cat-4)' },
  { id: 'fun', name: 'Развлечения', color: 'var(--cat-5)' },
  { id: 'shopping', name: 'Покупки', color: 'var(--cat-6)' },
  { id: OTHER_ID, name: 'Другое', color: 'var(--cat-7)' },
];
