import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/caveat/cyrillic-500.css';
import './styles/theme.css';
import './styles/global.css';
import { App } from './App';
import { ExpressionsShowcase } from './screens/ExpressionsShowcase';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.hash === '#expressions' ? <ExpressionsShowcase /> : <App />}</StrictMode>,
);

// Работа без интернета (SPEC 3.29). Только в собранной версии: при разработке кеш мешал бы видеть правки.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
