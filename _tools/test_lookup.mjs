// Тест серверного поиска товара по штрихкоду (OFF + upcitemdb)
import { lookupProduct } from '../server/src/lookup.js';

const codes = ['7622210449283', '4607086560356', '4001731047078', '4607086560301'];
for (const code of codes) {
  try {
    const p = await lookupProduct(code);
    console.log(code, '→', p ? p.name + (p.brand ? ' / ' + p.brand : '') : 'не найден');
  } catch (e) {
    console.log(code, '→ ОШИБКА:', e.message);
  }
}
process.exit(0);
