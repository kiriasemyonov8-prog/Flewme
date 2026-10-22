import { FlaskConical } from 'lucide-react';

/** Плашка «Демо»: видна всегда, пока в приложении демо-данные (SPEC, раздел 14). */
export function DemoBadge() {
  return (
    <div className="demo-badge" role="note">
      <FlaskConical size={16} strokeWidth={2} aria-hidden />
      <span>
        <b>Демо.</b> Это примерные данные, не ваши
      </span>
    </div>
  );
}
