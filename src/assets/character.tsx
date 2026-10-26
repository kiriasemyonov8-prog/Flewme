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

/**
 * Флюми в полный рост; height — высота в пикселях (без неё — по размеру контейнера).
 * lit — Флюми стоит в комнате: на корпус ложатся блики света от окна и ламп этой темы (3.33).
 * Блик — слой поверх картинки, вырезанный по её силуэту, цвет берётся из темы (--robot-light).
 */
export function Robot({ expression, height, lit = false }: { expression: Expression; height?: number; lit?: boolean }) {
  const img = (
    <img
      className="robot-img"
      src={IMAGES[expression]}
      alt={`Флюми: ${EXPRESSION_LABELS[expression]}`}
      style={height ? { height } : undefined}
      draggable={false}
    />
  );
  if (!lit) return img;
  const mask = `url(${IMAGES[expression]})`;
  return (
    <span className="robot-lit">
      {img}
      <span className="robot-light" aria-hidden style={{ WebkitMaskImage: mask, maskImage: mask }} />
    </span>
  );
}

/** Голова Флюми в круглой рамке — для иконки в разделах и в чате. */
export function RobotHead({ expression }: { expression: Expression }) {
  return <img className="robot-head" src={IMAGES[expression]} alt={`Флюми: ${EXPRESSION_LABELS[expression]}`} draggable={false} />;
}

// Все картинки грузятся сразу, чтобы смена настроения не мигала.
for (const src of Object.values(IMAGES)) new Image().src = src;
