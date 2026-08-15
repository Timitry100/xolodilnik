// Сертификат на app.bobkoved.ru (без проверки подлинности)
import https from 'node:https';

function inspect(host) {
  return new Promise((resolve) => {
    const req = https.request(
      { host, path: '/', method: 'GET', rejectUnauthorized: false, timeout: 8000 },
      (res) => {
        const cert = res.socket.getPeerCertificate();
        resolve({
          status: res.statusCode,
          location: res.headers.location || '',
          cn: cert?.subject?.CN || '—',
          issuer: cert?.issuer?.CN || '—',
          san: (cert?.subjectaltname || '').replace(/\n/g, ', ') || '—',
          valid_from: cert?.valid_from || '—',
          valid_to: cert?.valid_to || '—',
        });
        res.resume();
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, cn: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, cn: 'ОШИБКА: ' + e.message }));
    req.end();
  });
}

for (const host of ['app.bobkoved.ru', 'bobkoved.ru']) {
  const r = await inspect(host);
  console.log(`\n=== ${host} ===`);
  console.log('HTTPS:', r.status, '| редирект на:', r.location || '—');
  console.log('CN:', r.cn, '| Issuer:', r.issuer);
  console.log('SAN:', r.san);
  console.log('Срок:', r.valid_from, '→', r.valid_to);
}
process.exit(0);
