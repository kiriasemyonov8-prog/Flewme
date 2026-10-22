// TEMP-PLACEHOLDER: упрощённый векторный Флюми до получения файлов автора (SPEC, раздел 6).
// Внешность по референсу: капсульный молочный корпус, овальный чёрный визор,
// большие тёплые глаза, оранжевые наушники. Без наряда (✅ SPEC 3.15).
// Меняются только выражения: десять штук — девять с референса («спокойствие» перерисовано) и «грусть».

export type PlaceholderExpression =
  | 'joy'
  | 'surprise'
  | 'inspiration'
  | 'thoughtful'
  | 'confident'
  | 'playful'
  | 'care'
  | 'laugh'
  | 'calm'
  | 'sad';

const VISOR = '#15181a';
const WARM = '#f3a24c';
const ACCENT = '#c9cbc4';
const EYES = [76, 124] as const;
const EYE_Y = 90;

function Eye({
  cx,
  dx = 0,
  dy = 0,
  size = 1,
  pupil = 8.5,
  star = false,
}: {
  cx: number;
  dx?: number;
  dy?: number;
  size?: number;
  pupil?: number;
  star?: boolean;
}) {
  const hx = cx + dx - 5;
  const hy = EYE_Y + dy - 6;
  return (
    <g>
      <circle cx={cx} cy={EYE_Y} r={18 * size} fill="#9a5a24" />
      <circle cx={cx} cy={EYE_Y} r={13 * size} fill="#c7802f" />
      <circle cx={cx + dx} cy={EYE_Y + dy} r={pupil} fill="#2a1408" />
      {star ? (
        // Блик-звёздочка для «вдохновения».
        <path
          d={`M ${hx} ${hy - 7} Q ${hx + 1.2} ${hy - 1.2} ${hx + 7} ${hy} Q ${hx + 1.2} ${hy + 1.2} ${hx} ${hy + 7} Q ${hx - 1.2} ${hy + 1.2} ${hx - 7} ${hy} Q ${hx - 1.2} ${hy - 1.2} ${hx} ${hy - 7} Z`}
          fill="#fff"
        />
      ) : (
        <circle cx={hx} cy={hy} r={4.5} fill="#fff" />
      )}
      <circle cx={cx + dx + 4} cy={EYE_Y + dy + 4} r={1.8} fill="#fff" opacity={0.8} />
    </g>
  );
}

function Blush() {
  return (
    <>
      <ellipse cx={58} cy={114} rx={9} ry={5} fill="#ff8a1f" opacity={0.35} />
      <ellipse cx={142} cy={114} rx={9} ry={5} fill="#ff8a1f" opacity={0.35} />
    </>
  );
}

/** Четырёхконечная искорка рядом с головой. */
function Sparkle({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const k = r * 0.18;
  return (
    <path
      d={`M ${x} ${y - r} Q ${x + k} ${y - k} ${x + r} ${y} Q ${x + k} ${y + k} ${x} ${y + r} Q ${x - k} ${y + k} ${x - r} ${y} Q ${x - k} ${y - k} ${x} ${y - r} Z`}
      fill={color}
    />
  );
}

function Heart({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M ${x} ${y + 9} C ${x - 14} ${y} ${x - 8} ${y - 10} ${x} ${y - 3} C ${x + 8} ${y - 10} ${x + 14} ${y} ${x} ${y + 9} Z`}
      fill="#ff8a1f"
    />
  );
}

/** Зажмуренный от смеха глаз: «>» слева и «<» справа. */
function SqueezedEye({ cx, left }: { cx: number; left: boolean }) {
  const s = left ? 1 : -1;
  return (
    <path
      d={`M ${cx - 12 * s} ${EYE_Y - 10} L ${cx + 10 * s} ${EYE_Y} L ${cx - 12 * s} ${EYE_Y + 10}`}
      fill="none"
      stroke={WARM}
      strokeWidth={6.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Веко цвета визора поверх глаза: прямое или наклонное (y слева и справа). */
function Lid({ cx, left, right }: { cx: number; left: number; right: number }) {
  return (
    <polygon
      points={`${cx - 21},${EYE_Y - 22} ${cx + 21},${EYE_Y - 22} ${cx + 21},${EYE_Y + right} ${cx - 21},${EYE_Y + left}`}
      fill={VISOR}
    />
  );
}

/** Нижнее «веко»-полумесяц цвета визора: глаз как будто улыбается. */
function SmileCut({ cx }: { cx: number }) {
  return <ellipse cx={cx} cy={EYE_Y + 24} rx={24} ry={13} fill={VISOR} />;
}

function HappyEye({ cx }: { cx: number }) {
  return (
    <path
      d={`M ${cx - 15} ${EYE_Y + 6} Q ${cx} ${EYE_Y - 16} ${cx + 15} ${EYE_Y + 6}`}
      fill="none"
      stroke={WARM}
      strokeWidth={7}
      strokeLinecap="round"
    />
  );
}

function ClosedEye({ cx }: { cx: number }) {
  return (
    <path
      d={`M ${cx - 14} ${EYE_Y - 2} Q ${cx} ${EYE_Y + 12} ${cx + 14} ${EYE_Y - 2}`}
      fill="none"
      stroke="#e0a062"
      strokeWidth={6}
      strokeLinecap="round"
    />
  );
}

function Face({ expression }: { expression: PlaceholderExpression }) {
  const [l, r] = EYES;
  switch (expression) {
    case 'joy':
      return (
        <>
          <HappyEye cx={l} />
          <HappyEye cx={r} />
          <Blush />
        </>
      );
    case 'surprise':
      // Широко раскрытые глаза, маленькие зрачки, короткие «удивлённые» штрихи у головы.
      return (
        <>
          <Eye cx={l} size={1.15} pupil={6} />
          <Eye cx={r} size={1.15} pupil={6} />
          <g stroke={ACCENT} strokeWidth={4} strokeLinecap="round">
            <line x1={170} y1={30} x2={176} y2={20} />
            <line x1={180} y1={42} x2={190} y2={38} />
            <line x1={160} y1={22} x2={161} y2={12} />
          </g>
        </>
      );
    case 'inspiration':
      return (
        <>
          <Eye cx={l} dy={-2} star />
          <Eye cx={r} dy={-2} star />
          <Sparkle x={176} y={30} r={11} color="#ff8a1f" />
          <Sparkle x={160} y={12} r={6} color={ACCENT} />
        </>
      );
    case 'confident':
      // Спокойная уверенность: ровно прикрытые сверху глаза с лёгкой улыбкой снизу.
      return (
        <>
          <Eye cx={l} dy={1} />
          <Eye cx={r} dy={1} />
          <Lid cx={l} left={-8} right={-8} />
          <Lid cx={r} left={-8} right={-8} />
          <SmileCut cx={l} />
          <SmileCut cx={r} />
        </>
      );
    case 'playful':
      // Подмигивание: один глаз-дуга, второй смотрит в сторону.
      return (
        <>
          <HappyEye cx={l} />
          <Eye cx={r} dx={-4} dy={-1} />
          <Blush />
        </>
      );
    case 'care':
      // Забота: открытые тёплые «улыбающиеся» глаза и сердечко, без грусти и упрёка.
      return (
        <>
          <Eye cx={l} dy={-2} />
          <Eye cx={r} dy={-2} />
          <SmileCut cx={l} />
          <SmileCut cx={r} />
          <Blush />
          <Heart x={174} y={30} />
        </>
      );
    case 'laugh':
      return (
        <>
          <SqueezedEye cx={l} left />
          <SqueezedEye cx={r} left={false} />
          <Blush />
          <g stroke={ACCENT} strokeWidth={4} strokeLinecap="round">
            <line x1={6} y1={40} x2={14} y2={46} />
            <line x1={194} y1={40} x2={186} y2={46} />
          </g>
        </>
      );
    case 'calm':
      // Перерисованное «спокойствие»: мягко закрытые глаза-дуги «‿», без сонливости и скуки.
      return (
        <>
          <ClosedEye cx={l} />
          <ClosedEye cx={r} />
        </>
      );
    case 'thoughtful':
      return (
        <>
          <Eye cx={l} dx={5} dy={-4} />
          <Eye cx={r} dx={5} dy={-4} />
          <Lid cx={r} left={-10} right={-12} />
          <circle cx={160} cy={46} r={3} fill={ACCENT} />
          <circle cx={170} cy={36} r={4.5} fill={ACCENT} />
        </>
      );
    case 'sad':
      // Сочувствующая грусть: внешние уголки век опущены, взгляд вниз, без обиды.
      return (
        <>
          <Eye cx={l} dy={4} />
          <Eye cx={r} dy={4} />
          <Lid cx={l} left={0} right={-10} />
          <Lid cx={r} left={-10} right={0} />
        </>
      );
  }
}

export function RobotPlaceholder({ expression, size = 180 }: { expression: PlaceholderExpression; size?: number }) {
  return (
    <svg viewBox="0 0 200 220" width={size} height={(size * 220) / 200} aria-hidden="true">
      {/* корпус */}
      <rect x={62} y={150} width={76} height={62} rx={30} fill="#fbfbf8" stroke="#e2e3dc" strokeWidth={2} />
      <path d="M92 176 l8 -7 l8 7 l-8 7 z" fill="none" stroke="#3a3f3b" strokeWidth={3} strokeLinejoin="round" />
      {/* наушники */}
      <rect x={10} y={62} width={26} height={54} rx={13} fill="#ff8a1f" />
      <rect x={164} y={62} width={26} height={54} rx={13} fill="#ff8a1f" />
      {/* голова-капсула */}
      <rect x={24} y={12} width={152} height={150} rx={72} fill="#fbfbf8" stroke="#e2e3dc" strokeWidth={2} />
      <rect x={30} y={76} width={8} height={26} rx={4} fill="#e8833a" opacity={0.5} />
      <rect x={162} y={76} width={8} height={26} rx={4} fill="#e8833a" opacity={0.5} />
      {/* визор */}
      <ellipse cx={100} cy={90} rx={66} ry={56} fill={VISOR} />
      <ellipse cx={78} cy={58} rx={22} ry={7} fill="#fff" opacity={0.08} />
      <Face expression={expression} />
    </svg>
  );
}
