import https from 'node:https';
import crypto from 'node:crypto';
import { fetchJson } from './http.js';
import { config } from './config.js';

/**
 * «Честный знак» (ЦРПТ) + публичная проверка кодов ГИС МТ (ФНС).
 *
 * 1) Проверка подлинности кода маркировки — публичный сервис ФНС
 *    POST https://apic.datamatrix.nalog.ru/service/verification/check (без авторизации).
 * 2) Данные о товаре по GTIN — официальный API ЦРПТ ismp.crpt.ru/api/v3
 *    (нужны client_id/client_secret из ЛК ЦРПТ, см. PROJECT.md).
 * 3) Если ЦРПТ недоступен/не настроен — фолбэк на открытые данные Open Food Facts.
 */


/* ---------- 1. Проверка подлинности кода (ФНС ГИС МТ, публично) ---------- */

/**
 * @param {object} opts { gtin, serial, code }
 * code — содержимое Data Matrix целиком (с AI 01 в начале), если доступно.
 */
export async function verifyCode({ gtin, serial, code } = {}) {
  try {
    const { json, status } = await fetchJson('https://apic.datamatrix.nalog.ru/service/verification/check', {
      method: 'POST',
      body: { gtin, serial, code: code || `01${gtin}21${serial || ''}` },
      timeoutMs: 10000,
    });
    return { status, json };
  } catch (e) {
    return { status: 0, json: null, error: e.message };
  }
}

/* ---------- 2. Официальный API ЦРПТ (требует client_id/client_secret) ---------- */

let crptTokenCache = null;

export async function getCrptToken(force = false) {
  if (!config.crptClientId || !config.crptClientSecret) return null;
  if (!force && crptTokenCache && crptTokenCache.expireAt > Date.now()) {
    return crptTokenCache.token;
  }
  try {
    const { json } = await fetchJson(`${config.crptBaseUrl}/auth/`, {
      method: 'POST',
      body: { client_id: config.crptClientId, client_secret: config.crptClientSecret, uuid: crypto.randomUUID() },
    });
    if (json?.token) {
      const expireIn = Number(json.expireIn || 86400) * 1000;
      crptTokenCache = { token: json.token, expireAt: Date.now() + expireIn };
      return json.token;
    }
  } catch (e) {
    console.warn('[crpt] OAuth ошибка:', e.message);
  }
  return null;
}

/** Пробуем несколько известных endpoint'ов ЦРПТ для получения данных товара по GTIN. */
export async function getProductFromCrpt(gtin) {
  const token = await getCrptToken();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const candidates = [
    `${config.crptBaseUrl}/products/${gtin}`,
    `${config.crptBaseUrl}/true-marking/cises/search?gtin=${gtin}`,
    `${config.crptBaseUrl}/milk/gtins/${gtin}`,
  ];
  for (const url of candidates) {
    try {
      const { json, status } = await fetchJson(url, { headers });
      if (status >= 200 && status < 300 && json) return json;
    } catch {
      /* пробуем следующий */
    }
  }
  return null;
}

function mapCrptProduct(json) {
  const p = json?.productInfo || json?.product || json;
  if (!p) return null;
  return {
    name: p.productName || p.name || p.product_name || p.nm || '',
    brand: p.producerName || p.producer || p.brand || '',
    category: p.categoryName || p.category || '',
    composition: p.ingredients || p.composition || '',
    image_url: p.imageUrl || p.image_url || '',
  };
}

/* ---------- 3. Фолбэк: Open Food Facts по GTIN ---------- */

function normalizeToEan(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length === 14) {
    const without = digits.replace(/^0+/, '');
    if (without.length === 13) return without;
    if (without.length === 12) return '0' + without;
    return without;
  }
  if (digits.length === 13) return digits;
  if (digits.length === 12) return '0' + digits;
  return digits;
}

async function getProductFromOFF(gtin) {
  const ean = normalizeToEan(gtin);
  if (ean.length !== 13) return null;
  try {
    const { json } = await fetchJson(
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json` +
        `?fields=product_name,product_name_ru,generic_name,brands,nutriments,` +
        `ingredients_text,ingredients_text_ru,categories,categories_ru,image_front_small_url`,
      { timeoutMs: 10000 }
    );
    const p = json?.product;
    if (!p) return null;
    const n = p.nutriments || {};
    const cat = String(p.categories_ru || p.categories || '').split(',')[0].trim();
    return {
      name: p.product_name_ru || p.product_name || p.generic_name || '',
      brand: p.brands || '',
      category: cat && cat.length > 1 ? cat : '',
      kcal: n['energy-kcal_100g'] ?? null,
      protein: n.proteins_100g ?? null,
      fat: n.fat_100g ?? null,
      carbs: n.carbohydrates_100g ?? null,
      composition: p.ingredients_text_ru || p.ingredients_text || '',
      image_url: p.image_front_small_url || '',
    };
  } catch {
    return null;
  }
}

/* ---------- Главная функция: разрешение GTIN «Честного знака» ---------- */

export async function resolveHonestSign(gtin) {
  const result = {
    gtin,
    source: 'none',
    product: null,
    crptConfigured: !!(config.crptClientId && config.crptClientSecret),
  };

  // 1) Официальный API ЦРПТ (если настроен)
  const crpt = await getProductFromCrpt(gtin);
  if (crpt) {
    const mapped = mapCrptProduct(crpt);
    if (mapped && mapped.name) {
      return { ...result, source: 'crpt', product: mapped };
    }
  }

  // 2) Открытые данные (фолбэк)
  const off = await getProductFromOFF(gtin);
  if (off && off.name) {
    return { ...result, source: 'off', product: off };
  }

  return result;
}

