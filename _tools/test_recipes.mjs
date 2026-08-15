// Тест локальной базы рецептов (без ИИ)
import { generateLocal } from '../server/src/recipes.js';

const products = [
  { name: 'Молоко 3,2%', category: 'Молочное' },
  { name: 'Яйца куриные', category: 'Молочное' },
  { name: 'Сыр российский', category: 'Молочное' },
  { name: 'Курица охлаждённая', category: 'Мясо и птица' },
  { name: 'Картофель', category: 'Овощи и фрукты' },
  { name: 'Рис', category: 'Бакалея' },
];

const own = generateLocal(products, 'own', 'fast');
console.log(`\n[fast / own] рецептов: ${own.recipes.length}`);
for (const r of own.recipes) {
  console.log(`- ${r.name} (совпадений: ${r.matchedCount}) есть=[${r.have.join(', ') || '—'}]`);
}
if (own.recipes.length < 1) throw new Error('нет быстрых рецептов для этих продуктов');

const medium = generateLocal(products, 'suggest', 'medium');
console.log(`\n[medium / suggest] рецептов: ${medium.recipes.length}`);
for (const r of medium.recipes.slice(0, 3)) {
  console.log(`- ${r.name} докупить=[${r.shopping.join(', ') || '—'}]`);
}
if (medium.recipes.length < 1) throw new Error('нет рецептов среднего уровня');

const gourmet = generateLocal(products, 'own', 'gourmet');
console.log(`\n[gourmet / own] рецептов: ${gourmet.recipes.length}`);
if (gourmet.recipes.length < 1) throw new Error('нет рецептов гурмэ-уровня');

console.log('\n✅ ТЕСТ РЕЦЕПТОВ ПРОЙДЕН');
process.exit(0);
