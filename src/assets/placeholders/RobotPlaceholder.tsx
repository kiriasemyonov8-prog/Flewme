// TEMP-PLACEHOLDER: упрощённый векторный Флюми до получения файлов автора (SPEC, раздел 6).
// Внешность по референсу: капсульный молочный корпус, овальный чёрный визор,
// большие тёплые глаза, оранжевые наушники. Без наряда (✅ SPEC 3.15).
// Три выражения (✅ SPEC 3.16): спокойствие (перерисовано), радость, грусть.

export type PlaceholderExpression = 'calm' | 'joy' | 'sad';

const VISOR = '#15181a';
const WARM = '#f3a24c';
const EYES = [76, 124] as const;
const EYE_Y = 90;

function Eye({ cx, dy = 0 }: { cx: number; dy?: number }) {
  return (
    <g>
      <circle cx={cx} cy={EYE_Y} r={18} fill="#9a5a24" />
      <circle cx={cx} cy={EYE_Y} r={13} fill="#c7802f" />
      <circle cx={cx} cy={EYE_Y + dy} r={8.5} fill="#2a1408" />
      <circle cx={cx - 5} cy={EYE_Y + dy - 6} r={4.5} fill="#fff" />
      <circle cx={cx + 4} cy={EYE_Y + dy + 4} r={1.8} fill="#fff" opacity={0.8} />
    </g>
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
          <ellipse cx={58} cy={114} rx={9} ry={5} fill="#ff8a1f" opacity={0.35} />
          <ellipse cx={142} cy={114} rx={9} ry={5} fill="#ff8a1f" opacity={0.35} />
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
