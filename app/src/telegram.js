// Telegram WebApp API определяется лениво (скрипт грузится async).
export function getTg() {
  return window.Telegram?.WebApp || null;
}

export function initTelegram() {
  const doInit = () => {
    const t = getTg();
    if (!t) return;
    t.ready();
    t.expand();
    t.setHeaderColor?.('secondary_bg_color');
    t.setBackgroundColor?.('secondary_bg_color');
    t.disableVerticalSwipes?.();
  };
  doInit(); // если скрипт уже загружен
  window.addEventListener('load', doInit); // или после полной загрузки
  setTimeout(doInit, 2500); // запасной вариант
}

export function haptic(type = 'light') {
  getTg()?.HapticFeedback?.impactOccurred(type);
}

export function showAlert(message) {
  if (getTg()?.showAlert) getTg().showAlert(message);
  else window.alert(message);
}

export function showConfirm(message) {
  if (getTg()?.showConfirm) return getTg().showConfirm(message);
  return window.confirm(message);
}

