import { useState } from 'react';
import { BottomNav, type Tab } from './ui/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { StubScreen } from './screens/StubScreen';
import { useFinance } from './state/useFinance';
import './ui/app.css';

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [homeSignal, setHomeSignal] = useState(0);
  const store = useFinance();

  function changeTab(next: Tab) {
    if (next === 'home') setHomeSignal((n) => n + 1);
    setTab(next);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="app">
      <main className="screen">
        {tab === 'home' && (
          <HomeScreen store={store} homeSignal={homeSignal} onOpenProfile={() => changeTab('profile')} />
        )}
        {tab === 'finance' && (
          <StubScreen title="Финансы и цели" note="Доходы, расходы и цели появятся на шаге 5." />
        )}
        {tab === 'purchase' && (
          <StubScreen
            title="Рассчитать покупку или предложи получше"
            note="Проверка крупных покупок появится на шаге 5."
          />
        )}
        {tab === 'profile' && <ProfileScreen store={store} />}
      </main>
      <BottomNav active={tab} onChange={changeTab} />
    </div>
  );
}
