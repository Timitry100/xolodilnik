// Тест личной базы: добавленный товар находится по штрихкоду при повторе
import { addProduct, deleteProduct } from '../server/src/db.js';
import { lookupProduct } from '../server/src/lookup.js';

const p = addProduct(1, {
  name: 'Мой уникальный товар',
  brand: 'Тест',
  category: 'Другое',
  barcode: '4609999999999',
  source: 'manual',
});

const r = await lookupProduct('4609999999999');
console.log('По штрихкоду из личной базы:', r ? r.name + ' (источник: ' + r._source + ')' : 'не найдено');

deleteProduct(p.id, 1);
process.exit(r && r.name === 'Мой уникальный товар' ? 0 : 1);
