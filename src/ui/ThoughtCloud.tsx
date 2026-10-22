// Облачко-мысль как в мультфильмах: пухлое облако из кружков и два кружочка-«пузырька»,
// уходящих вниз влево к голове робота. Контур общий для всех кружков (через drop-shadow).

const CLOUD: [cx: number, cy: number, r: number][] = [
  [112, 62, 44], // середина
  [62, 58, 24],
  [80, 36, 25],
  [112, 28, 26],
  [144, 36, 24],
  [164, 60, 22],
  [148, 86, 22],
  [114, 92, 22],
  [78, 88, 22],
];

export function ThoughtCloud({ text }: { text: string }) {
  return (
    <div className="thought" aria-live="polite">
      <svg className="thought-shape" viewBox="0 0 200 126" aria-hidden="true">
        {CLOUD.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} />
        ))}
        <circle cx={30} cy={108} r={8} />
        <circle cx={14} cy={120} r={4.5} />
      </svg>
      <div className="thought-text">{text}</div>
    </div>
  );
}
