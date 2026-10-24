import { useState } from 'react';
import { BottomNav, type Tab } from './ui/BottomNav';
import { ChatScreen, SectionHeader } from './screens/ChatScreen';
import { FinanceScreen } from './screens/FinanceScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { PurchaseScreen } from './screens/PurchaseScreen';
import { FeatureCards, Welcome } from './screens/onboarding/Intro';
import { Questionnaire } from './screens/onboarding/Questionnaire';
import { currentMood, useChat } from './state/useChat';
import { useFinance } from './state/useFinance';
import { useKeyboardInset } from './state/useKeyboard';
import './ui/app.css';

/** Первый вход (SPEC 3.27): приветствие → карточки → анкета; из профиля — сразу анкета. */
type Phase = 'welcome' | 'cards' | 'quiz' | 'quizFromProfile' | 'app';

export function App() {
  const [phase, setPhase] = useState<Phase>('welcome');
  const [tab, setTab] = useState<Tab>('home');
  const [homeSignal, setHomeSignal] = useState(0);
  // Чат, открытый из раздела по иконке Флюми; повторное нажатие возвращает в этот раздел.
  const [chatOpen, setChatOpen] = useState(false);
  const store = useFinance();
  useKeyboardInset();
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

  function enterApp() {
    setPhase('app');
    setTab('home');
    setChatOpen(false);
    window.scrollTo({ top: 0 });
  }

  if (phase !== 'app') {
    return (
      <div className="app">
        {phase === 'welcome' && <Welcome onStart={() => setPhase('cards')} onDemo={enterApp} />}
        {phase === 'cards' && <FeatureCards onDone={() => setPhase('quiz')} />}
        {(phase === 'quiz' || phase === 'quizFromProfile') && (
          <Questionnaire
            today={store.today}
            onBack={() => (phase === 'quiz' ? setPhase('cards') : setPhase('app'))}
            onDone={(data) => {
              store.replace(data);
              enterApp();
            }}
          />
        )}
      </div>
    );
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
            {tab === 'profile' && <ProfileScreen store={store} onStartOnboarding={() => setPhase('quizFromProfile')} />}
          </>
        )}
      </main>
      <BottomNav active={tab} onChange={changeTab} />
    </div>
  );
}
