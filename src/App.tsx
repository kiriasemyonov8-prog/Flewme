import { useLayoutEffect, useState } from 'react';
import { BottomNav, type Tab } from './ui/BottomNav';
import { ChatScreen, SectionHeader } from './screens/ChatScreen';
import { FinanceScreen } from './screens/FinanceScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { PurchaseScreen } from './screens/PurchaseScreen';
import { FeatureCards, Welcome } from './screens/onboarding/Intro';
import { Questionnaire } from './screens/onboarding/Questionnaire';
import { Recovery } from './screens/onboarding/Recovery';
import { demoData } from './core/demo';
import { currentMood, useChat } from './state/useChat';
import { useFinance } from './state/useFinance';
import { useKeyboardInset } from './state/useKeyboard';
import './ui/app.css';

const THEME_COLORS = { light: '#EDF5F2', dark: '#16191D', aurora: '#151036' } as const;

/** Первый вход (SPEC 3.27): приветствие → карточки → анкета; из профиля — сразу анкета. Один раз (3.29). */
type Phase = 'welcome' | 'cards' | 'quiz' | 'quizFromProfile' | 'app';

export function App() {
  const store = useFinance();
  const [phase, setPhase] = useState<Phase>(store.meta.onboarded ? 'app' : 'welcome');
  const [tab, setTab] = useState<Tab>('home');
  const [homeSignal, setHomeSignal] = useState(0);
  // Чат, открытый из раздела по иконке Флюми; повторное нажатие возвращает в этот раздел.
  const [chatOpen, setChatOpen] = useState(false);
  useKeyboardInset();

  // Тема оформления (3.32): атрибут на <html> и цвет строки состояния телефона.
  const theme = store.meta.theme ?? 'light';
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') delete root.dataset.theme;
    else root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  }, [theme]);
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
    store.setMeta({ onboarded: true });
    setPhase('app');
    setTab('home');
    setChatOpen(false);
    window.scrollTo({ top: 0 });
  }

  if (store.broken) {
    return (
      <div className="app">
        <Recovery
          reason={store.broken}
          onRestore={(data) => {
            store.resolveBroken(data, { onboarded: true });
            enterApp();
          }}
          onStartOver={() => {
            store.resolveBroken(demoData(store.today, Date.now()), { onboarded: false });
            setPhase('welcome');
          }}
        />
      </div>
    );
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
