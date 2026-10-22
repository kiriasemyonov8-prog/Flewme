import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/** Нижняя шторка для ввода. Закрывается крестиком, фоном или Esc. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
