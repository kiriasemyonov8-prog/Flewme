import { DemoBadge } from '../ui/DemoBadge';

/** Временный экран раздела, который делается на следующих шагах плана. */
export function StubScreen({ title, note }: { title: string; note: string }) {
  return (
    <>
      <DemoBadge />
      <h1 className="screen-title">{title}</h1>
      <div className="card stub">
        <p>{note}</p>
      </div>
    </>
  );
}
