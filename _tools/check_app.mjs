// Проверка https://app.bobkoved.ru — готов ли сайт для Telegram
import https from 'node:https';

function get(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request(
      { host: u.hostname, path: u.pathname, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const cert = res.socket.getPeerCertificate();
          resolve({
            status: res.statusCode,
            title: (text.match(/<title>(.*?)<\/title>/i) || [])[1] || '',
            hasRoot: text.includes('id="root"'),
            cn: cert?.subject?.CN || '—',
            issuer: cert?.issuer?.CN || '—',
            san: (cert?.subjectaltname || '').replace(/\n/g, ', ') || '—',
            size: text.length,
          });
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, title: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, title: 'ОШИБКА: ' + e.message }));
    req.end();
  });
}

const r = await get('https://app.bobkoved.ru');
console.log('HTTPS статус:', r.status);
console.log('Заголовок:', r.title || '—');
console.log('Наше приложение (id="root"):', r.hasRoot ? 'ДА ✅' : 'нет');
console.log('Сертификат CN:', r.cn, '| Issuer:', r.issuer);
console.log('SAN:', r.san);
console.log('Размер HTML:', r.size);
process.exit(0);
