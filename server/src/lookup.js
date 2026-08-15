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

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** barcodespider.com — бесплатный парсинг страницы по EAN. */
export async function lookupBarcodespider(ean) {
  try {
    const { status, text } = await fetchJson(`https://www.barcodespider.com/${ean}`, { timeoutMs: 12000 });
    if (status !== 200) return null;
    const title = (text.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
    const m = title.match(/^(.+?)\s*-\s*EAN\s+\d+/i);
    if (!m) return null; // товар не найден
    const plain = stripHtml(text);
    const name = m[1].trim();
    const brand = (plain.match(/\bBrand\s+([A-Za-z0-9.'-]+)/) || [])[1] || '';
    const manufacturer = (plain.match(/Manufacturer:\s*([^.\n]{1,60})/) || [])[1] || '';
    const weight = (plain.match(/Weight:\s*([\d.]+\s*[A-Za-z]+)/) || [])[1] || '';
    return {
      name,
      brand: brand || manufacturer || '',
      volume: weight || '',
    };
  } catch {
    return null;
  }
}

/** upcdatabase.org — бесплатный парсинг страницы по EAN. */
export async function lookupUpcdatabase(ean) {
  try {
    const { status, text } = await fetchJson(`https://upcdatabase.org/code/${ean}`, { timeoutMs: 12000 });
    if (status !== 200) return null;
    const plain = stripHtml(text);
    // название — после "Date Added: <дата>" до "Alias"
    const dateIdx = plain.search(/Date Added:\s*\d{1,2}\s+[A-Za-z]+,\s*\d{4}/);
    if (dateIdx === -1) return null;
    const aliasIdx = plain.indexOf('Alias', dateIdx);
    const seg = plain.slice(dateIdx, aliasIdx === -1 ? undefined : aliasIdx);
    const name = seg.replace(/^Date Added:.*?\d{4}\s*/, '').trim();
    if (!name) return null;
    const brand = (plain.match(/\bBrand\s+([A-Z][A-Za-z0-9 .,'-]{1,80})/) || [])[1] || '';
    const volume = (plain.match(/\bQuantity\s+([\d.,]+\s*\w+)/) || [])[1] || '';
    return {
      name,
      brand: brand.split(',')[0].trim() || '',
      volume,
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
  return (
    (await lookupOFF(ean)) ||
    (await lookupBarcodespider(ean)) ||
    (await lookupUpcdatabase(ean)) ||
    (await lookupUpcitemdb(ean)) ||
    null
  );
}
