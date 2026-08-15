export const tg = window.Telegram?.WebApp || null;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('secondary_bg_color');
  tg.setBackgroundColor?.('secondary_bg_color');
  tg.disableVerticalSwipes?.();
}

export function haptic(type = 'light') {
  tg?.HapticFeedback?.impactOccurred(type);
}

export function showAlert(message) {
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
}

export function showConfirm(message) {
  if (tg?.showConfirm) return tg.showConfirm(message);
  return window.confirm(message);
}
