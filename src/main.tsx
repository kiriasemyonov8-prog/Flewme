import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/caveat/cyrillic-500.css';
import './styles/theme.css';
import './styles/global.css';
import { App } from './App';
import { ExpressionsShowcase } from './screens/ExpressionsShowcase';

// Тема оформления (3.32) — до первого кадра, чтобы не мигала светлая.
try {
  const theme = JSON.parse(localStorage.getItem('flyumi') ?? 'null')?.meta?.theme;
  if (theme === 'dark' || theme === 'aurora') document.documentElement.dataset.theme = theme;
} catch {
  // нет сохранённых данных — светлая тема
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.hash === '#expressions' ? <ExpressionsShowcase /> : <App />}</StrictMode>,
);

// Работа без интернета (SPEC 3.29). Только в собранной версии: при разработке кеш мешал бы видеть правки.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
