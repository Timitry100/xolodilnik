// Тест модуля «Честного знака»: resolveHonestSign + verifyCode (без крашей)
import { resolveHonestSign, verifyCode } from '../server/src/honestSign.js';

// 1) verifyCode — публичный сервис ФНС (может быть недоступен из-за DNS/региона — не должно падать)
const v = await verifyCode({ gtin: '04650000000001', serial: '000000000000000001' });
console.log('verifyCode →', v.status, v.json ? JSON.stringify(v.json).slice(0, 120) : '(недоступен)');

// 2) resolveHonestSign по реальному GTIN (фолбэк Open Food Facts)
const gtin = '7622210449283';
const r = await resolveHonestSign(gtin);
console.log('resolveHonestSign → source:', r.source, '| crptConfigured:', r.crptConfigured);
if (r.product) console.log('   товар:', r.product.name, '| бренд:', r.product.brand || '—');
else console.log('   товар по GTIN не найден (или сеть недоступна)');

console.log('\n✅ ТЕСТ HONEST-SIGN ПРОЙДЕН (без падений)');
process.exit(0);
