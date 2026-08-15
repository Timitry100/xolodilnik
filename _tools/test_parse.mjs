// Тест парсера текста упаковки (parseText.js)
import { parseExpiry, parseProductText } from '../app/src/scanners/parseText.js';

let failed = 0;
function check(label, got, expected) {
  const ok = got === expected;
  if (!ok) {
    failed++;
    console.log(`❌ ${label}: got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`);
  } else {
    console.log(`✅ ${label}`);
  }
}

const tests = [
  ['годен до 25.08.2026', '2026-08-25'],
  ['ГОДЕН ДО 25.08.26', '2026-08-25'],
  ['Годен до 25 августа 2026', '2026-08-25'],
  ['срок годности 6 месяцев', null], // зависит от текущей даты — проверим отдельно
  ['годен 5 суток', null],
  ['срок хранения 12 суток', null],
];

for (const [input] of tests) {
  const r = parseExpiry(input);
  if (input.includes('25.08')) check(`expiry(${input})`, r ? r.date : null, input.includes('2026-08-25') ? r?.date : '2026-08-25');
}

check('exact 1', parseExpiry('годен до 25.08.2026')?.date, '2026-08-25');
check('exact 2', parseExpiry('ГОДЕН ДО 25.08.26')?.date, '2026-08-25');
check('exact 3', parseExpiry('Годен до 25 августа 2026')?.date, '2026-08-25');

const rel6m = parseExpiry('срок годности 6 месяцев');
console.log(`ℹ️ срок годности 6 месяцев → ${rel6m?.date} (зависит от даты)`);
if (!rel6m?.date) { failed++; console.log('❌ rel6m: null'); }

const rel5d = parseExpiry('годен 5 суток');
console.log(`ℹ️ годен 5 суток → ${rel5d?.date}`);
if (!rel5d?.date) { failed++; console.log('❌ rel5d: null'); }

const parsed = parseProductText(
  'Молоко питьевое ультрапастеризованное 3,2%\n' +
    'Торговая марка: Простоквашино\n' +
    'Масса нетто: 900 г\n' +
    'Состав: молоко цельное, молоко обезжиренное\n' +
    'Пищевая ценность на 100 г: белки 3,0 г, жиры 3,2 г, углеводы 4,7 г\n' +
    'Энергетическая ценность 60 ккал\n' +
    'Годен до 25.08.2026'
);
console.log('ℹ️ parseProductText →', JSON.stringify(parsed, null, 2));
check('name', parsed.name, 'Молоко питьевое ультрапастеризованное 3,2%');
check('brand', parsed.brand, 'Простоквашино');
check('volume', parsed.volume, '900 г');
check('protein', String(parsed.protein), '3');
check('fat', String(parsed.fat), '3.2');
check('carbs', String(parsed.carbs), '4.7');
check('kcal', String(parsed.kcal), '60');
check('expiry', parsed.expiry_date, '2026-08-25');

process.exit(failed ? 1 : 0);
