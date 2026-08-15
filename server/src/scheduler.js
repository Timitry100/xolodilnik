import { bot, daysUntil, sendExpiryDigest } from './bot.js';
import { allUsers, listProducts, hasNotification, markNotified } from './db.js';

/**
 * Проверка сроков годности.
 * Для каждого продукта отправляется не более одного предупреждения на каждый уровень:
 *  - d7    — осталось 4–7 дней
 *  - d3    — осталось 1–3 дня
 *  - d1    — истекает сегодня
 *  - expired — просрочен
 * Отправленные отметки хранятся в таблице notifications (БД).
 */
export function checkExpiryOnce() {
  if (!bot) return;
  const users = allUsers();
  for (const user of users) {
    const products = listProducts(user.id);
    const toSend = [];
    for (const p of products) {
      if (!p.expiry_date) continue;
      const d = daysUntil(p.expiry_date);
      const level = d < 0 ? 'expired' : d === 0 ? 'd1' : d <= 3 ? 'd3' : d <= 7 ? 'd7' : null;
      if (level && !hasNotification(p.id, level)) {
        toSend.push({ p, level, d });
        markNotified(p.id, level);
      }
    }
    for (const { p, level, d } of toSend) {
      const labels = {
        expired: '🔴 ПРОСРОЧЕН',
        d1: '🟠 Истекает СЕГОДНЯ',
        d3: '🟡 Истекает в ближайшие дни',
        d7: '🟢 Скоро истекает',
      };
      const text =
        `${labels[level]}\n\n` +
        `🧊 ${p.name}${p.brand ? ` (${p.brand})` : ''}\n` +
        `📅 Срок годности: ${p.expiry_date}\n` +
        (d < 0 ? `💀 Просрочен на ${-d} дн. — лучше выбросить!` : `⏳ Осталось ${d} дн.`);
      bot.sendMessage(user.chat_id, text).catch((err) => console.error('[scheduler] не удалось отправить:', err.message));
    }
  }
}

export function initScheduler() {
  const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // каждые 6 часов
  setTimeout(() => {
    checkExpiryOnce();
    setInterval(checkExpiryOnce, CHECK_INTERVAL);
  }, 30 * 1000);
  console.log('[scheduler] проверка сроков годности запущена');
}

export { sendExpiryDigest };
