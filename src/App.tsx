import { useMemo, useState } from 'react';
import { todayLocal } from './core/dates';
import { demoData } from './core/demo';
import { BottomNav, type Tab } from './ui/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { StubScreen } from './screens/StubScreen';
import './ui/app.css';

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  // Пока данные только демо и живут в памяти; сохранение в браузере — шаг 7.
  const today = todayLocal();
  const data = useMemo(() => demoData(today, Date.now()), [today]);

  return (
    <div className="app">
      <main className="screen">
        {tab === 'home' && <HomeScreen data={data} today={today} />}
        {tab === 'finance' && (
          <StubScreen title="Финансы и цели" note="Доходы, расходы и цели появятся на шаге 5." />
        )}
        {tab === 'purchase' && (
          <StubScreen
            title="Рассчитать покупку или предложи получше"
            note="Проверка крупных покупок появится на шаге 5."
          />
        )}
        {tab === 'profile' && (
          <StubScreen title="Профиль" note="Счета, доходы и платежи, настройки появятся на шаге 4." />
        )}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
