import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import {applySettings} from './lib/settings';
import {watchPhone} from './lib/device';

applySettings();
watchPhone();

// Telegram Mini App: fill the screen, black bars, and stop the swipe-down-to-close gesture while scrolling.
const initTelegram = () => {
  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready(); tg.expand(); tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#000000'); tg.setBackgroundColor?.('#000000'); tg.setBottomBarColor?.('#000000');
    document.documentElement.classList.add('tg');
    watchPhone();
  } catch { /* old Telegram version: ignore */ }
};
initTelegram();
// If the browser skipped the helper script (some WebViews block document.write), load it now.
if (!(window as any).Telegram?.WebApp && /tgWebApp/.test(location.hash + location.search)) {
  const sc = document.createElement('script');
  sc.src = 'https://telegram.org/js/telegram-web-app.js';
  sc.onload = initTelegram;
  document.head.appendChild(sc);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
