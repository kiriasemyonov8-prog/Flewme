import { House, ShoppingBag, Target, UserRound, type LucideIcon } from 'lucide-react';

export type Tab = 'home' | 'finance' | 'purchase' | 'profile';

const ITEMS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'home', label: 'Главная', Icon: House },
  { id: 'finance', label: 'Финансы и цели', Icon: Target },
  { id: 'purchase', label: 'Покупка', Icon: ShoppingBag },
  { id: 'profile', label: 'Профиль', Icon: UserRound },
];

export function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="nav" aria-label="Разделы">
      {ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`nav-item${active === id ? ' is-active' : ''}`}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <span className="nav-icon">
            <Icon size={22} strokeWidth={active === id ? 2.2 : 1.8} />
          </span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
