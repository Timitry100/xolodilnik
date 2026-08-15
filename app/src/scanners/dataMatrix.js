/**
 * «Честный знак» — Data Matrix на упаковке содержит ссылку вида
 *   http://datamatrix.nalog.ru/1/{GTIN-14}/{серийный}/{код}
 * Иногда встречается GS1-разметка (AI 01 + GTIN).
 * Извлекаем GTIN и приводим его к EAN-13 для поиска в открытых данных.
 */
export function parseGtinFromDataMatrix(raw) {
  const text = String(raw || '');
  let m = text.match(/datamatrix\.nalog\.ru\/[^/]*\/(\d{14})/);
  if (!m) m = text.match(/datamatrix\.nalog\.ru\/[^/]*\/(01)?(\d{14})/);
  if (!m) m = text.match(/(?:^|[^0-9])(\d{14})(?:[^0-9]|$)/);
  if (!m) m = text.match(/(?:^|[^0-9])01(\d{14})(?:[^0-9]|$)/);
  return m ? m[1] : null;
}
