// Тест поиска по названию (Open Food Facts)
import { searchProducts } from '../server/src/lookup.js';

for (const q of ['молоко', 'кефир']) {
  const r = await searchProducts(q);
  console.log(`Поиск "${q}" → ${r.length} результатов`);
  for (const p of r.slice(0, 3)) {
    console.log(`  ${p.code || '—'} | ${p.name} | ${p.brand || ''} | ккал: ${p.kcal ?? '—'}`);
  }
}
process.exit(0);
