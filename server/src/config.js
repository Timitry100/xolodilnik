import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  port: Number(process.env.PORT || 3001), // 3001 — порт 3000 занят первым сайтом bobkoved.ru
  appUrl: process.env.APP_URL || '',
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
