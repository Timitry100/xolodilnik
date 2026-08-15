import { fetchJson } from './http.js';
import { config } from './config.js';

/**
 * Точное распознавание этикетки продукта через Google Gemini.
 * Требует GEMINI_API_KEY в server/.env (бесплатно: https://aistudio.google.com).
 */

const MODEL = 'gemini-2.0-flash';

function extractJson(text) {
  const t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : t;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

const PROMPT =
  'Ты распознаёшь упаковку продукта питания по фото. Извлеки данные и верни ТОЛЬКО валидный JSON (без markdown и пояснений):\n' +
  '{"name":"название продукта","brand":"марка/производитель","volume":"объём или масса нетто, например 900 г","kcal":число,"protein":число,"fat":число,"carbs":число,"composition":"состав","expiry_date":"YYYY-MM-DD или null"}\n' +
  'Правила: если поле не видно — число ставь null, текст — пустая строка. КБЖУ на 100 г. ' +
  'expiry_date приводи к YYYY-MM-DD (25.08.2026 → 2026-08-25; если указан «срок годности 6 месяцев» — вычисли от текущей даты). ' +
  'Ответ — только один JSON-объект, ничего больше.';

export async function analyzeProductImage(base64, mime = 'image/jpeg') {
  if (!config.geminiApiKey) {
    return { ok: false, reason: 'GEMINI_API_KEY не задан в server/.env' };
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.geminiApiKey}`;
    const { json } = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
      },
      timeoutMs: 30000,
    });
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { ok: false, reason: json?.error?.message || 'пустой ответ модели' };
    }
    const parsed = extractJson(text);
    if (!parsed) {
      return { ok: false, reason: 'модель вернула не JSON' };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
