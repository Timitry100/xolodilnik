// Тест парсинга barcodespider и upcdatabase напрямую
import { lookupBarcodespider, lookupUpcdatabase } from '../server/src/lookup.js';

const codes = ['7622210449283', '4607086560356', '4001731047078'];
for (const code of codes) {
  const bs = await lookupBarcodespider(code);
  console.log('barcodespider', code, '→', bs ? `${bs.name} / ${bs.brand} / ${bs.volume}` : 'нет');
  const upc = await lookupUpcdatabase(code);
  console.log('upcdatabase  ', code, '→', upc ? `${upc.name} / ${upc.brand} / ${upc.volume}` : 'нет');
}
process.exit(0);
