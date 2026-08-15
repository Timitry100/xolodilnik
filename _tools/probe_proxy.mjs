// Определение типа прокси и проверка доступа к api.telegram.org через него
import net from 'node:net';

const HOST = '168.81.67.177';
const PORT = 8000;
const USER = 'sC7hpq';
const PASS = 'RaqWe6';
const TARGET_HOST = 'api.telegram.org';
const TARGET_PORT = 443;

function trySocks5() {
  return new Promise((resolve) => {
    const sock = net.connect(PORT, HOST);
    sock.setTimeout(6000);
    sock.on('connect', () => {
      // SOCKS5 greeting: версия 5, 2 метода: 0x02 (user/pass), 0x00 (no auth)
      sock.write(Buffer.from([0x05, 0x02, 0x02, 0x00]));
    });
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length >= 2) {
        if (buf[0] === 0x05) {
          resolve({ ok: true, type: 'SOCKS5', method: buf[1] === 0x02 ? 'auth' : buf[1] === 0x00 ? 'no-auth' : 'method-' + buf[1] });
        } else {
          resolve({ ok: false, reason: 'не SOCKS5 (первый байт ' + buf[0] + ')' });
        }
        sock.destroy();
      }
    });
    sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    sock.on('error', (e) => resolve({ ok: false, reason: e.code || e.message }));
  });
}

function tryHttpProxy() {
  return new Promise((resolve) => {
    const sock = net.connect(PORT, HOST);
    sock.setTimeout(6000);
    sock.on('connect', () => {
      const auth = 'Proxy-Authorization: Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') + '\r\n';
      sock.write(
        `CONNECT ${TARGET_HOST}:${TARGET_PORT} HTTP/1.1\r\nHost: ${TARGET_HOST}:${TARGET_PORT}\r\n${auth}\r\n`
      );
    });
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      if (buf.includes('\r\n\r\n') || buf.includes('\n\n')) {
        const status = buf.match(/HTTP\/1\.[01]\s+(\d{3})/);
        resolve({ ok: status && status[1] === '200', type: 'HTTP', status: status ? status[1] : buf.slice(0, 40) });
        sock.destroy();
      }
    });
    sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    sock.on('error', (e) => resolve({ ok: false, reason: e.code || e.message }));
  });
}

const socks = await trySocks5();
console.log('Тест SOCKS5:', JSON.stringify(socks));

const http = await tryHttpProxy();
console.log('Тест HTTP-прокси:', JSON.stringify(http));

// вывод рекомендации
if (socks.ok) console.log('\n✅ Похоже на SOCKS5 прокси (метод: ' + socks.method + ')');
else console.log('\n❌ SOCKS5 не подтвердился:', socks.reason);
if (http.ok) console.log('✅ Похоже на HTTP прокси — CONNECT к api.telegram.org работает!');
else console.log('❌ HTTP CONNECT не сработал:', http.reason);
process.exit(0);
