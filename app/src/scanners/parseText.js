/**
 * Парсинг распознанного текста упаковки:
 * срок годности, КБЖУ, состав, название продукта.
 */

const MONTH_NAMES = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

function toIso(d, m, y) {
  const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
  const day = Math.min(31, Number(d));
  const month = Math.min(12, Number(m));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addFromToday({ days = 0, months = 0, years = 0 }) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setMonth(d.getMonth() + months);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function parseExpiry(text) {
  const t = String(text || '').toLowerCase();

  // «годен до 25.08.2026», «годен до 25.08.26»
  let m = t.match(/год[её]?н[аоы]?\s*(?:до|по)?\s*[: ]*(\d{1,2})[./\s](\d{1,2})[./\s](\d{2,4})/);
  if (m) return { date: toIso(m[1], m[2], m[3]) };

  // «годен до 25 августа 2026»
  m = t.match(/год[её]?н[аоы]?\s*(?:до|по)?\s*[: ]*(\d{1,2})\s+([а-яё]+)\s+(\d{2,4})/);
  if (m && MONTH_NAMES[m[2]]) return { date: toIso(m[1], MONTH_NAMES[m[2]], m[3]) };

  // «годен 5 суток» / «годен 30 дней»
  m = t.match(/год[её]?н[аоы]?\s*(?:до|по)?\s*[: ]*(\d{1,3})\s*(?:сут(?:ок)?|дн(?:ей|я)?)/);
  if (m) return { date: addFromToday({ days: Number(m[1]) }) };

  // «срок годности 6 месяцев», «срок хранения 1 год», «12 суток»
  m = t.match(/(?:срок\s+годности|срок\s+хранения)[^\d]{0,30}(\d{1,3})\s*(месяц[а-я]*|лет|год[а-я]*|сут[а-я]*|дн[а-я]*)/);
  if (m) {
    const unit = m[2];
    const n = Number(m[1]);
    if (/месяц/.test(unit)) return { date: addFromToday({ months: n }) };
    if (/лет|год/.test(unit)) return { date: addFromToday({ years: n }) };
    if (/сут|дн/.test(unit)) return { date: addFromToday({ days: n }) };
  }

  // дата без контекста: 25.08.2026 (если похожа на дату)
  m = t.match(/(?:^|[^\d])(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[^\d]|$)/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    return { date: toIso(m[1], m[2], m[3]) };
  }

  return null;
}

function parseGrams(text, re) {
  const m = text.match(re);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const NAME_SKIP = /^(состав|энергетич|пищев|белк|жир|углевод|срок|годен|хранить|производит|изготовител|бжу|масса|нетто|штрих|адрес|содержит|е\d|б\s*[:\s]|\s*ж\s*[:\s]|у\s*[:\s])/i;

export function parseName(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.length < 3 || line.length > 90) continue;
    if (/\d{8,}/.test(line)) continue;
    if (NAME_SKIP.test(line)) continue;
    const cleaned = line.replace(/[«»"',.!?]+$/, '').trim();
    if (cleaned.length >= 3) return cleaned;
  }
  return '';
}

export function parseComposition(text) {
  const t = String(text || '');
  const m = t.match(/состав\s*[::]?\s*([^\n.]{5,500})/i);
  if (!m) return '';
  return m[1]
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\s*[«"]\s*/, '')
    .slice(0, 500);
}

/** Марка / бренд / производитель. */
export function parseBrand(text) {
  const t = String(text || '');
  const m = t.match(/(?:торговая марка|марка|бренд|производитель|изготовитель)\s*[::]?\s*([^\n]{3,60})/i);
  if (m) return m[1].trim().replace(/[«»"',.!?]+$/, '');
  return '';
}

/** Объём / масса нетто: «масса нетто 900 г», «объем 1 л», «450 мл», «0,5 литра». */
export function parseVolume(text) {
  const t = String(text || '');
  // с меткой: масса нетто / объем / нетто / масса
  let m = t.match(/(?:масса нетто|объем|объём|нетто|масса)\s*[::]?\s*(\d+[.,]?\d*)\s*(мл|литр[а-я]*|л|кг|грамм|г)/i);
  if (m) {
    const num = m[1].replace(',', '.');
    let unit = m[2].toLowerCase();
    if (unit.startsWith('миллилитр') || unit === 'мл') unit = 'мл';
    else if (unit.startsWith('литр')) unit = 'л';
    else if (unit === 'л') unit = 'л';
    else if (unit.startsWith('килог') || unit === 'кг') unit = 'кг';
    else unit = 'г';
    return `${num} ${unit}`;
  }
  // просто объём без метки: «450 мл», «1 л», «1,5 литра»
  m = t.match(/(\d+[.,]?\d*)\s*(мл|литр[а-я]*|л)/i);
  if (m) {
    const num = m[1].replace(',', '.');
    const unit = m[2].toLowerCase().startsWith('литр') ? 'л' : m[2].toLowerCase();
    return `${num} ${unit}`;
  }
  return '';
}

export function parseProductText(text) {
  const t = String(text || '');
  const expiry = parseExpiry(t);
  return {
    name: parseName(t),
    brand: parseBrand(t),
    volume: parseVolume(t),
    kcal: parseGrams(t, /(?:энергетическая ценность|калорийность|ккал|энергия|энерг\.)[^0-9]{0,30}([0-9]+[.,]?[0-9]*)/i),
    protein: parseGrams(t, /белки?[^0-9]{0,20}([0-9]+[.,]?[0-9]*)/i),
    fat: parseGrams(t, /жиры?[^0-9]{0,20}([0-9]+[.,]?[0-9]*)/i),
    carbs: parseGrams(t, /углеводы?[^0-9]{0,20}([0-9]+[.,]?[0-9]*)/i),
    composition: parseComposition(t),
    expiry_date: expiry ? expiry.date : null,
  };
}
