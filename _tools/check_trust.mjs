// Полная проверка сертификата app.bobkoved.ru: доверенный ли он
import https from 'node:https';

function check(host) {
  return new Promise((resolve) => {
    const req = https.request(
      { host, path: '/', method: 'GET', rejectUnauthorized: true, timeout: 8000 },
      (res) => {
        resolve({ trusted: true, status: res.statusCode });
        res.resume();
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ trusted: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ trusted: false, error: e.message }));
    req.end();
  });
}

// 1) Доверен ли сертификат стандартной проверкой
const r = await check('app.bobkoved.ru');
console.log('Стандартная проверка (как в браузере):', r.trusted ? '✅ ДОВЕРЕННЫЙ' : '❌ НЕДОВЕРЕННЫЙ');
if (!r.trusted) console.log('Причина:', r.error);

// 2) Полная цепочка сертификата
const chain = await new Promise((resolve) => {
  const req = https.request({ host: 'app.bobkoved.ru', path: '/', method: 'GET', rejectUnauthorized: false, timeout: 8000 }, (res) => {
    const certs = res.socket.getPeerCertificate(true);
    const list = certs.map((c) => `  ${c.subject?.CN || '?'}  ← выдан: ${c.issuer?.CN || '?'}`);
    resolve(list);
    res.resume();
  });
  req.on('error', () => resolve([]));
  req.end();
});
console.log('\nЦепочка сертификата:');
console.log(chain.join('\n') || '  (не удалось получить)');
process.exit(0);
