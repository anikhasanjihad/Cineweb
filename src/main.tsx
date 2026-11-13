import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import {applySettings} from './lib/settings';

applySettings();

// Telegram Mini App: fill the screen, black bars, and stop the swipe-down-to-close gesture while scrolling.
const tg = (window as any).Telegram?.WebApp;
if (tg) {
  try {
    tg.ready(); tg.expand(); tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#000000'); tg.setBackgroundColor?.('#000000'); tg.setBottomBarColor?.('#000000');
    document.documentElement.classList.add('tg');
  } catch { /* old Telegram version: ignore */ }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
