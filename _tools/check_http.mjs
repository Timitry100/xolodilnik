// Проверка http://app.bobkoved.ru — работает ли ACME-папка (порт 80)
import http from 'node:http';

function get(path) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: 'app.bobkoved.ru', path, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location || '', body: Buffer.concat(chunks).toString('utf8').slice(0, 100) }));
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, body: 'ОШИБКА: ' + e.message }));
    req.end();
  });
}

const r1 = await get('/');
console.log('http://app.bobkoved.ru/ →', r1.status, r1.location ? '→ ' + r1.location : '', '|', r1.body.replace(/\n/g, ' '));

const r2 = await get('/.well-known/acme-challenge/test.txt');
console.log('http://app.bobkoved.ru/.well-known/acme-challenge/test.txt →', r2.status, r2.location ? '→ ' + r2.location : '', '| Содержимое:', JSON.stringify(r2.body));

// Что это значит
if (r2.status === 200) {
  console.log('\n✅ ФАЙЛ ОТДАЁТСЯ! nginx отдаёт папку. win-acme пройдёт — запускай от администратора.');
} else if (r2.status === 404 && !r2.location) {
  console.log('\n❌ nginx отдаёт 404 на существующий файл — root в конфиге указывает не туда. Пришли фрагмент блока app.bobkoved.ru из nginx.conf.');
} else if (r2.location) {
  console.log('\n❌ Запрос уходит на ' + r2.location + ' — Блок 1 не активен.');
}
process.exit(0);
