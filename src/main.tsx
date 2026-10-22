import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import './styles/theme.css';
import './styles/global.css';
import { App } from './App';
import { ExpressionsShowcase } from './screens/ExpressionsShowcase';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.hash === '#expressions' ? <ExpressionsShowcase /> : <App />}</StrictMode>,
);
