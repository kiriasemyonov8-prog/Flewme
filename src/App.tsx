import { useState } from 'react';
import { BottomNav, type Tab } from './ui/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { FinanceScreen } from './screens/FinanceScreen';
import { PurchaseScreen } from './screens/PurchaseScreen';
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
        {tab === 'finance' && <FinanceScreen store={store} />}
        {tab === 'purchase' && <PurchaseScreen store={store} />}
        {tab === 'profile' && <ProfileScreen store={store} />}
      </main>
      <BottomNav active={tab} onChange={changeTab} />
    </div>
  );
}
