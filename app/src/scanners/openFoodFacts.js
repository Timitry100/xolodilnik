/**
 * Поиск товара в открытых данных — Open Food Facts.
 * Запрос выполняется прямо из браузера (CORS разрешён).
 */
export function normalizeToEan(code) {
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

export async function enrichFromBarcode(code) {
  const ean = normalizeToEan(code);
  if (ean.length !== 13) return {};
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${ean}.json` +
    `?fields=product_name,product_name_ru,generic_name,brands,nutriments,` +
    `ingredients_text,ingredients_text_ru,categories,categories_ru,image_front_small_url,quantity`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return {};
    const data = await res.json();
    if (!data.product) return {};
    const p = data.product;
    const n = p.nutriments || {};
    const cat = String(p.categories_ru || p.categories || '').split(',')[0].trim();
    return {
      name: p.product_name_ru || p.product_name || p.generic_name || '',
      brand: p.brands || '',
      category: cat && cat.length > 1 ? cat : 'Другое',
      kcal: n['energy-kcal_100g'] ?? undefined,
      protein: n.proteins_100g ?? undefined,
      fat: n.fat_100g ?? undefined,
      carbs: n.carbohydrates_100g ?? undefined,
      composition: p.ingredients_text_ru || p.ingredients_text || '',
      image_url: p.image_front_small_url || '',
    };
  } catch {
    return {};
  }
}
