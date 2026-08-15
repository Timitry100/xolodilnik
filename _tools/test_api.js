// Интеграционный тест API (в одном процессе): авторизация initData, CRUD, изоляция пользователей.
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const TOKEN = 'test_token_123';
process.env.BOT_TOKEN = TOKEN;
process.env.PORT = '3001';
// в API-тесте проверяем авторизацию с initData, поэтому гость отключён
process.env.ALLOW_GUEST = 'false';

import { jfetch } from './jfetch.mjs';

const root = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const { apiApp } = await import(pathToFileURL(path.join(root, 'server', 'src', 'api.js')).href);

function makeInitData(telegramId) {
  const user = { id: telegramId, first_name: 'Тест', username: 'test' };
  const fields = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['query_id', 'AAHTest'],
    ['user', JSON.stringify(user)],
  ];
  const checkString = fields
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  return fields.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') + `&hash=${hash}`;
}

const BASE = 'http://localhost:3001';
const H1 = { 'X-Init-Data': makeInitData(123456), 'Content-Type': 'application/json' };
const H2 = { 'X-Init-Data': makeInitData(999999), 'Content-Type': 'application/json' };

async function main() {
  let r = await jfetch(`${BASE}/api/me`);
  if (r.status !== 401) throw new Error('ожидался 401 без initData, получен ' + r.status);
  console.log('1) /api/me без initData → 401 ✅');

  r = await jfetch(`${BASE}/api/me`, { headers: H1 });
  const me = await r.json();
  console.log('2) /api/me с initData →', r.status, `(user id=${me.telegram_id})`);
  if (r.status !== 200) throw new Error('ошибка авторизации');

  r = await jfetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: H1,
    body: JSON.stringify({
      name: 'Молоко 3,2%',
      brand: 'Простоквашино',
      category: 'Молочное',
      kcal: 60,
      protein: 3,
      fat: 3.2,
      carbs: 4.7,
      expiry_date: '2026-09-01',
      barcode: '4607086560356',
      source: 'barcode',
    }),
  });
  const product = await r.json();
  console.log('3) создание продукта →', r.status, `"${product.name}" id=${product.id}`);
  if (!product.id) throw new Error('продукт не создан');

  r = await jfetch(`${BASE}/api/products`, { headers: H1 });
  const list = await r.json();
  console.log('4) список продуктов →', r.status, `кол-во: ${list.length}`);
  if (list.length !== 1) throw new Error('ожидался 1 продукт');

  r = await jfetch(`${BASE}/api/stats`, { headers: H1 });
  console.log('5) stats →', r.status, JSON.stringify(await r.json()));

  r = await jfetch(`${BASE}/api/products`, { headers: H2 });
  const list2 = await r.json();
  console.log('6) список второго пользователя →', r.status, `кол-во: ${list2.length}`);
  if (list2.length !== 0) throw new Error('пользователи видят чужие продукты!');

  r = await jfetch(`${BASE}/api/products/${product.id}`, {
    method: 'PUT',
    headers: H1,
    body: JSON.stringify({ expiry_date: '2026-12-31' }),
  });
  const updated = await r.json();
  console.log('7) обновление срока →', r.status, updated.expiry_date);
  if (updated.expiry_date !== '2026-12-31') throw new Error('срок не обновился');

  r = await jfetch(`${BASE}/api/products/${product.id}`, { method: 'DELETE', headers: H1 });
  console.log('8) удаление →', r.status);

  r = await jfetch(`${BASE}/api/products`, { headers: H1 });
  console.log('9) список после удаления →', (await r.json()).length);

  // тест «Я съел»
  r = await jfetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: H1,
    body: JSON.stringify({ name: 'Хлеб бородинский', quantity: 2, source: 'manual' }),
  });
  const cprod = await r.json();
  r = await jfetch(`${BASE}/api/products/${cprod.id}/consume`, { method: 'POST', headers: H1 });
  const c1 = await r.json();
  console.log('10) «Я съел»: количество 2 →', c1.product ? c1.product.quantity : 'удалён', '→', r.status);
  if (!c1.product || c1.product.quantity !== 1) throw new Error('количество не уменьшилось');

  r = await jfetch(`${BASE}/api/products/${cprod.id}/consume`, { method: 'POST', headers: H1 });
  const c2 = await r.json();
  console.log('11) «Я съел»: количество 1 →', c2.deleted ? 'удалён ✅' : 'ошибка', '→', r.status);
  if (!c2.deleted) throw new Error('продукт должен удалиться при нуле');

  r = await jfetch(`${BASE}/api/products`, { headers: H1 });
  const finalCount = (await r.json()).length;
  console.log('12) итоговый список →', finalCount);
  if (finalCount !== 0) throw new Error('после тестов остались продукты');

  console.log('\n✅ ВСЕ ПРОВЕРКИ API ПРОЙДЕНЫ');
  process.exitCode = 0;
  server.close();
  server.closeAllConnections?.();
}

const server = apiApp.listen(3001, () => {
  main().catch((e) => {
    console.error('❌ ОШИБКА ТЕСТА:', e.message);
    process.exitCode = 1;
    server.close();
    server.closeAllConnections?.();
  });
});

