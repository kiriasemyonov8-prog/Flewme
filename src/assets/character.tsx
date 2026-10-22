// Единая точка подключения персонажа. Когда придут файлы автора,
// меняется только этот модуль, экраны не трогаются.
import type { Mood } from '../core/mood';
import { RobotPlaceholder } from './placeholders/RobotPlaceholder';

export type Expression = Mood;

const LABELS: Record<Expression, string> = {
  calm: 'спокойствие',
  joy: 'радость',
  thoughtful: 'задумчивость',
  sad: 'грусть',
};

export function Robot({ expression, size }: { expression: Expression; size?: number }) {
  return (
    <span role="img" aria-label={`Флюми: ${LABELS[expression]}`} style={{ display: 'inline-flex' }}>
      <RobotPlaceholder expression={expression} size={size} />
    </span>
  );
}
