// Единая точка подключения персонажа: файлы автора (docs/character → src/assets/character,
// подготовка — scripts/prepare-character.ps1). Чтобы заменить рисунки, меняется только эта папка.
import calm from './character/calm.png';
import happy from './character/happy.png';
import sad from './character/sad.png';

export type Expression = 'calm' | 'joy' | 'sad';

export const EXPRESSION_LABELS: Record<Expression, string> = {
  calm: 'спокойствие',
  joy: 'радость',
  sad: 'грусть',
};

const IMAGES: Record<Expression, string> = { calm, joy: happy, sad };

export { default as characterBackground } from './character/background.jpg';

/** Флюми в полный рост; height — высота в пикселях (без неё — по размеру контейнера). */
export function Robot({ expression, height }: { expression: Expression; height?: number }) {
  return (
    <img
      className="robot-img"
      src={IMAGES[expression]}
      alt={`Флюми: ${EXPRESSION_LABELS[expression]}`}
      style={height ? { height } : undefined}
      draggable={false}
    />
  );
}

/** Голова Флюми в круглой рамке — для иконки в разделах и в чате. */
export function RobotHead({ expression }: { expression: Expression }) {
  return <img className="robot-head" src={IMAGES[expression]} alt={`Флюми: ${EXPRESSION_LABELS[expression]}`} draggable={false} />;
}

// Все картинки грузятся сразу, чтобы смена настроения не мигала.
for (const src of Object.values(IMAGES)) new Image().src = src;
