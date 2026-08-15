import { fetchJson } from './http.js';
import { findByCode } from './db.js';

/**
 * Поиск товара по штрихкоду/GTIN.
 * Порядок: 1) личная база (ранее сохранённые товары), 2) Open Food Facts, 3) upcitemdb.
 * Возвращает нормализованный продукт или null.
 */

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

async function lookupOFF(ean) {
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
      volume: p.quantity || '',
    };
  } catch {
    return null;
  }
}

async function lookupUpcitemdb(ean) {
  try {
    const { json } = await fetchJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`, { timeoutMs: 8000 });
    const item = json?.items?.[0];
    if (!item || !item.title) return null;
    return {
      name: item.title || '',
      brand: item.brand || '',
      category: String(item.category || '').split(',')[0].trim() || '',
      image_url: item.images?.[0] || '',
    };
  } catch {
    return null;
  }
}

export async function lookupProduct(code) {
  const digits = String(code || '').replace(/\D/g, '');
  const ean = normalizeToEan(code);

  // 1) Личная база: ранее сохранённые товары с этим кодом
  const local = findByCode(digits) || (ean !== digits ? findByCode(ean) : null);
  if (local) return { ...local, _source: 'local' };

  if (ean.length !== 13) return null;

  // 2) Открытые базы
  return (await lookupOFF(ean)) || (await lookupUpcitemdb(ean)) || null;
}
