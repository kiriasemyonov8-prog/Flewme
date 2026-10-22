// Служебная витрина выражений персонажа для проверки автором (адрес …/#expressions).
// В приложении на неё нет ссылок.
import { EXPRESSION_LABELS, Robot, type Expression } from '../assets/character';

export function ExpressionsShowcase() {
  return (
    <main className="screen">
      <h1 className="screen-title">Выражения Флюми</h1>
      <p className="hint">Временные заглушки. Когда придут файлы автора, они заменят эти рисунки.</p>
      <div className="showcase">
        {(Object.keys(EXPRESSION_LABELS) as Expression[]).map((e) => (
          <figure key={e} className="card showcase-item">
            <Robot expression={e} size={110} />
            <figcaption>{EXPRESSION_LABELS[e]}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
