/** True on a phone: small screen, a touch phone in "desktop site" mode, or a Telegram mobile app. */
export const detectPhone = (): boolean => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && /^(android|android_x|ios)$/.test(String(tg.platform))) return true;
    if (window.innerWidth <= 820) return true;
    const touch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    return touch && Math.min(screen.width, screen.height) <= 900;
  } catch {
    return window.innerWidth <= 820;
  }
};

/** Keeps `<html class="phone">` up to date (the phone CSS only applies under that class). */
export const watchPhone = () => {
  const apply = () => document.documentElement.classList.toggle('phone', detectPhone());
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
};
