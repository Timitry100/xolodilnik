import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  port: Number(process.env.PORT || 3001), // 3001 — порт 3000 занят первым сайтом bobkoved.ru
  appUrl: process.env.APP_URL || '',
  tgProxy: process.env.TG_PROXY || '', // прокси для Telegram-бота (VPN): http://127.0.0.1:10809
  // Бот можно полностью отключить (BOT_ENABLED=false) — останется только сайт.
  botEnabled: process.env.BOT_ENABLED !== 'false',
  // Гостевой доступ: сайт работает без Telegram-авторизации (обычный браузер).
  allowGuest: process.env.ALLOW_GUEST !== 'false',
  // Google Gemini для точного распознавания этикеток (бесплатный ключ: aistudio.google.com)
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'xolodilnik.db'),
  distPath: path.join(__dirname, '..', '..', 'app', 'dist'),

  // ИИ для рецептов (OpenRouter или любой OpenAI-совместимый API)
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'deepseek/deepseek-chat:free',
  aiBaseUrl: process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',

  // API «Честного знака» (ЦРПТ). Данные ЛК ЦРПТ: https://ismp.crpt.ru
  crptBaseUrl: process.env.CRPT_BASE_URL || 'https://ismp.crpt.ru/api/v3',
  crptClientId: process.env.CRPT_CLIENT_ID || '',
  crptClientSecret: process.env.CRPT_CLIENT_SECRET || '',
};
