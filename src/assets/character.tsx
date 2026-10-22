// Единая точка подключения персонажа. Когда придут файлы автора,
// меняется только этот модуль, экраны не трогаются.
import { RobotPlaceholder, type PlaceholderExpression } from './placeholders/RobotPlaceholder';

export type Expression = PlaceholderExpression;

export const EXPRESSION_LABELS: Record<Expression, string> = {
  calm: 'спокойствие',
  joy: 'радость',
  sad: 'грусть',
};

export function Robot({ expression, size }: { expression: Expression; size?: number }) {
  return (
    <span role="img" aria-label={`Флюми: ${EXPRESSION_LABELS[expression]}`} style={{ display: 'inline-flex' }}>
      <RobotPlaceholder expression={expression} size={size} />
    </span>
  );
}
