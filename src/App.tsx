import { useState } from 'react';
import { BottomNav, type Tab } from './ui/BottomNav';
import { ChatScreen, SectionHeader } from './screens/ChatScreen';
import { FinanceScreen } from './screens/FinanceScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { PurchaseScreen } from './screens/PurchaseScreen';
import { currentMood, useChat } from './state/useChat';
import { useFinance } from './state/useFinance';
import './ui/app.css';

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [homeSignal, setHomeSignal] = useState(0);
  // Чат, открытый из раздела по иконке Флюми; повторное нажатие возвращает в этот раздел.
  const [chatOpen, setChatOpen] = useState(false);
  const store = useFinance();
  const chat = useChat(store);
  const mood = currentMood(store);

  function changeTab(next: Tab) {
    if (next === 'home') setHomeSignal((n) => n + 1);
    setChatOpen(false);
    setTab(next);
    window.scrollTo({ top: 0 });
  }

  function toggleChat(open: boolean) {
    setChatOpen(open);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="app">
      <main className="screen">
        {tab === 'home' && (
          <HomeScreen store={store} chatStore={chat} homeSignal={homeSignal} onOpenProfile={() => changeTab('profile')} />
        )}
        {tab !== 'home' && chatOpen && <ChatScreen chat={chat} mood={mood} onBack={() => toggleChat(false)} />}
        {tab !== 'home' && !chatOpen && (
          <>
            <SectionHeader mood={mood} isDemo={store.data.isDemo} onOpenChat={() => toggleChat(true)} />
            {tab === 'finance' && <FinanceScreen store={store} />}
            {tab === 'purchase' && <PurchaseScreen store={store} />}
            {tab === 'profile' && <ProfileScreen store={store} />}
          </>
        )}
      </main>
      <BottomNav active={tab} onChange={changeTab} />
    </div>
  );
}
