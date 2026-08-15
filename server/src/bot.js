import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import { getOrCreateUser, listProducts, getStats, consumeProduct, deleteProduct } from './db.js';

export let bot = null;

function formatDays(d) {
  if (d < 0) return `просрочен на ${-d} дн.`;
  if (d === 0) return 'истекает СЕГОДНЯ';
  if (d === 1) return 'истекает завтра';
  return `осталось ${d} дн.`;
}

export function initBot() {
  if (!config.botToken) {
    console.warn('[bot] BOT_TOKEN не задан — бот отключён. Заполните server/.env');
    return null;
  }

  const botOptions = { polling: true };
  // Если Telegram заблокирован (РФ) — бот ходит через прокси (VPN), см. TG_PROXY в .env
  if (config.tgProxy) {
    botOptions.request = { proxy: config.tgProxy };
    console.log(`[bot] используется прокси: ${config.tgProxy}`);
  }
  bot = new TelegramBot(config.botToken, botOptions);

  bot.on('polling_error', (err) => {
    if (err?.response?.statusCode === 401) {
      console.error('[bot] Неверный BOT_TOKEN! Проверьте server/.env');
    } else {
      console.error('[bot] polling_error:', err.message);
    }
  });
  bot.on('error', (err) => console.error('[bot] error:', err.message));


  bot.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'products', description: 'Список продуктов' },
    { command: 'expiring', description: 'Что скоро просрочится' },
    { command: 'help', description: 'Помощь' },
  ]);

  bot.onText(/\/start/, async (msg) => {
    const user = getOrCreateUser({
      telegramId: String(msg.from.id),
      chatId: msg.chat.id,
      name: msg.from.first_name || '',
    });
    const keyboard = config.appUrl
      ? [
          [{ text: '🧊 Открыть приложение', web_app: { url: config.appUrl } }],
          [{ text: '📋 Список продуктов' }, { text: '⚠️ Истекает скоро' }],
        ]
      : [[{ text: '📋 Список продуктов' }, { text: '⚠️ Истекает скоро' }]];
    const kb = { keyboard, resize_keyboard: true };
    const text =
      `Привет, ${user.name || 'друг'}! 🧊\n\n` +
      `Это «Холодильник» — приложение для учёта продуктов и сроков годности.\n\n` +
      `• Сканируй «Честный знак» или штрихкод камерой\n` +
      `• Мы запомним продукт, его КБЖУ и состав\n` +
      `• Предупредим, когда срок подойдёт к концу\n\n` +
      (config.appUrl
        ? `Нажми «🧊 Открыть приложение», чтобы начать.`
        : `⚠️ Кнопка приложения появится после того, как в server/.env будет указан APP_URL.`);
    await bot.sendMessage(msg.chat.id, text, { reply_markup: kb });
  });

  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      '🧊 Как пользоваться:\n\n' +
        '1. Открой приложение через кнопку «🧊 Открыть приложение»\n' +
        '2. Нажми «Сканировать» и наведи камеру на упаковку\n' +
        '3. Честный знак → штрихкод → текст — приложение само найдёт данные\n' +
        '4. Укажи срок годности (если не распознан) и сохрани\n\n' +
        'Бот будет присылать предупреждения: за 7 дней, 3 дня, 1 день и в день истечения.'
    );
  });

  bot.onText(/\/products/, (msg) => sendProductList(msg));
  bot.onText(/\/expiring/, (msg) => sendExpiring(msg));

  bot.on('message', (msg) => {
    if (!msg.text) return;
    if (msg.text.includes('Список продуктов')) sendProductList(msg);
    if (msg.text.includes('Истекает скоро')) sendExpiring(msg);
  });

  // Инлайн-кнопки «Съел» / «Удалить» в списке продуктов
  bot.on('callback_query', async (q) => {
    const data = q.data || '';
    const [cmd, idStr] = data.split(':');
    const id = Number(idStr);
    if (!cmd || !id) {
      return bot.answerCallbackQuery(q.id, { text: 'Ошибка' }).catch(() => {});
    }
    const user = getOrCreateUser({
      telegramId: String(q.from.id),
      chatId: q.message?.chat?.id || q.from.id,
      name: q.from.first_name || '',
    });
    if (cmd === 'eat') {
      const result = consumeProduct(id, user.id);
      if (!result) {
        return bot.answerCallbackQuery(q.id, { text: 'Продукт не найден' }).catch(() => {});
      }
      await bot.answerCallbackQuery(
        q.id,
        result.deleted
          ? { text: 'Съедено! Продукт удалён из списка' }
          : { text: `Съедено! Осталось: ${result.product.quantity}` }
      ).catch(() => {});
    } else if (cmd === 'del') {
      deleteProduct(id, user.id);
      await bot.answerCallbackQuery(q.id, { text: 'Удалено' }).catch(() => {});
    }
    // обновляем сообщение-список
    try {
      const products = listProducts(user.id);
      const sorted = [...products].sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
      const header = products.length ? '📋 Список продуктов:\n\n' : '📭 Список пуст.\n';
      const body = sorted
        .slice(0, 10)
        .map((p, i) => `${i + 1}. ${p.name} — ${p.expiry_date ? p.expiry_date : 'без срока'}`)
        .join('\n');
      await bot.editMessageText(header + body + (products.length ? '\n\nКнопки: «Съел» — уменьшить количество, «🗑» — удалить.' : ''), {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        reply_markup: renderProductsKeyboard(products),
      });
    } catch {
      /* сообщение уже не редактируется — не страшно */
    }
  });

  // Кнопка Mini App рядом с полем ввода
  if (config.appUrl) {
    bot
      .setChatMenuButton({
        menu_button: { type: 'web_app', text: 'Холодильник', web_app: { url: config.appUrl } },
      })
      .catch(() => {});
  }

  console.log(`[bot] запущен (chat menu: ${config.appUrl || 'не задан APP_URL'})`);
  return bot;
}

export function daysUntil(expiryDate) {
  const d = new Date(expiryDate + 'T23:59:59');
  const now = new Date();
  return Math.ceil((d - now) / 86400000);
}

function productCard(p) {
  const lines = [`🧊 ${p.name}`];
  if (p.brand) lines.push(`🏷 ${p.brand}`);
  if (p.category) lines.push(`🗂 ${p.category}`);
  if (p.expiry_date) lines.push(`📅 Срок годности: ${p.expiry_date} (${formatDays(daysUntil(p.expiry_date))})`);
  else lines.push('📅 Срок годности: не указан');
  const kbju = [];
  if (p.kcal != null) kbju.push(`${p.kcal} ккал`);
  if (p.protein != null) kbju.push(`Б ${p.protein}`);
  if (p.fat != null) kbju.push(`Ж ${p.fat}`);
  if (p.carbs != null) kbju.push(`У ${p.carbs}`);
  if (kbju.length) lines.push(`🍽 ${kbju.join(' · ')}`);
  return lines.join('\n');
}

function renderProductsKeyboard(products) {
  return {
    inline_keyboard: [...products]
      .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))
      .slice(0, 10)
      .map((p) => [
        { text: `✅ Съел: ${p.name}`, callback_data: `eat:${p.id}` },
        { text: '🗑', callback_data: `del:${p.id}` },
      ]),
  };
}

async function sendProductList(msg) {
  const user = getOrCreateUser({ telegramId: String(msg.from.id), chatId: msg.chat.id, name: msg.from.first_name || '' });
  const products = listProducts(user.id);
  if (!products.length) {
    return bot.sendMessage(msg.chat.id, '📭 Пока пусто. Открой приложение и добавь первый продукт.');
  }
  const stats = getStats(user.id);
  const header =
    `📋 Всего продуктов: ${stats.total}\n` +
    `🔴 Просрочено: ${stats.expired}\n` +
    `🟡 Истекает в ближайшие 7 дней: ${stats.expiring7}\n\n`;
  const body = products
    .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))
    .slice(0, 10)
    .map((p, i) => `${i + 1}. ${p.name} — ${p.expiry_date ? p.expiry_date + ` (${formatDays(daysUntil(p.expiry_date))})` : 'без срока'}`)
    .join('\n');
  await bot.sendMessage(
    msg.chat.id,
    header + body + (products.length > 10 ? '\n\n… и ещё ' + (products.length - 10) : '') +
      '\n\nКнопки: «Съел» — уменьшить количество, «🗑» — удалить.',
    { reply_markup: renderProductsKeyboard(products) }
  );
}

async function sendExpiring(msg) {
  const user = getOrCreateUser({ telegramId: String(msg.from.id), chatId: msg.chat.id, name: msg.from.first_name || '' });
  const products = listProducts(user.id)
    .filter((p) => p.expiry_date)
    .filter((p) => daysUntil(p.expiry_date) <= 7);
  if (!products.length) {
    return bot.sendMessage(msg.chat.id, '✅ Всё в порядке — в ближайшую неделю ничего не истекает.');
  }
  const body = products
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
    .map((p) => {
      const d = daysUntil(p.expiry_date);
      const icon = d < 0 ? '🔴' : d === 0 ? '🟠' : d <= 3 ? '🟡' : '🟢';
      return `${icon} ${p.name} — ${p.expiry_date} (${formatDays(d)})`;
    })
    .join('\n');
  await bot.sendMessage(msg.chat.id, '⚠️ Продукты со сроком ≤ 7 дней:\n\n' + body);
}

/* ---------- рассылка предупреждений (используется планировщиком) ---------- */

export function sendAlert(chatId, text) {
  if (!bot || !chatId) return Promise.resolve();
  return bot.sendMessage(chatId, text).catch((err) => console.error('[bot] не удалось отправить:', err.message));
}

export function sendExpiryDigest(user) {
  const products = listProducts(user.id);
  const alerts = [];
  for (const p of products) {
    if (!p.expiry_date) continue;
    const d = daysUntil(p.expiry_date);
    if (d <= 7) alerts.push({ p, d });
  }
  if (!alerts.length) return;
  alerts.sort((a, b) => a.d - b.d);
  const lines = ['⚠️ Сводка по срокам годности:\n'];
  for (const { p, d } of alerts) {
    const icon = d < 0 ? '🔴' : d === 0 ? '🟠' : d <= 3 ? '🟡' : '🟢';
    lines.push(`${icon} ${p.name} — ${p.expiry_date} (${formatDays(d)})`);
  }
  sendAlert(user.chat_id, lines.join('\n'));
}

