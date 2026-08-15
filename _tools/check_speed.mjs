// Замер скорости загрузки https://app.bobkoved.ru и telegram-web-app.js
import https from 'node:https';
import http from 'node:http';

function timeFetch(url, { allowUntrusted = false } = {}) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const start = Date.now();
    const opts = { host: url.replace(/^https?:\/\//, '').split('/')[0], path: '/', method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 };
    if (allowUntrusted) opts.rejectUnauthorized = false;
    const req = mod.request(opts, (res) => {
      const ttfb = Date.now() - start;
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ ttfb, total: Date.now() - start, status: res.statusCode, bytes: Buffer.concat(chunks).length });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ttfb: 0, total: Date.now() - start, status: 0, bytes: 0, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ttfb: 0, total: Date.now() - start, status: 0, bytes: 0, error: e.message }));
    req.end();
  });
}

const app = await timeFetch('https://app.bobkoved.ru/', { allowUntrusted: true });
console.log('https://app.bobkoved.ru/ →', app.status, '| TTFB:', app.ttfb, 'мс | всего:', app.total, 'мс | байт:', app.bytes, app.error ? '| ОШИБКА: ' + app.error : '');

const tg = await timeFetch('https://telegram.org/js/telegram-web-app.js');
console.log('https://telegram.org/js/telegram-web-app.js →', tg.status, '| TTFB:', tg.ttfb, 'мс | всего:', tg.total, 'мс | байт:', tg.bytes, tg.error ? '| ОШИБКА: ' + tg.error : '');
process.exit(0);
