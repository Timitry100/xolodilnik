// Полная проверка SOCKS5: auth + CONNECT к api.telegram.org
import net from 'node:net';

const HOST = '168.81.67.177';
const PORT = 8000;
const USER = Buffer.from('sC7hpq');
const PASS = Buffer.from('RaqWe6');
const TARGET = 'api.telegram.org';
const TPORT = 443;

function fullSocks5() {
  return new Promise((resolve) => {
    const sock = net.connect(PORT, HOST);
    sock.setTimeout(10000);
    const steps = ['greeting', 'auth', 'connect'];
    let step = 0;
    sock.on('connect', () => {
      sock.write(Buffer.from([0x05, 0x01, 0x02])); // greeting, метод auth
    });
    sock.on('data', (d) => {
      if (step === 0 && d[0] === 0x05 && d[1] === 0x02) {
        step = 1;
        sock.write(Buffer.from([0x01, USER.length, ...USER, PASS.length, ...PASS])); // auth
      } else if (step === 1 && d[0] === 0x01 && d[1] === 0x00) {
        step = 2;
        const hostB = Buffer.from(TARGET);
        const portB = Buffer.from([(TPORT >> 8) & 0xff, TPORT & 0xff]); // 443 = [0x01, 0xBB]
        sock.write(Buffer.from([0x05, 0x01, 0x00, 0x03, hostB.length, ...hostB, ...portB])); // CONNECT
      } else if (step === 2 && d[0] === 0x05) {
        const ok = d[1] === 0x00;
        resolve({ ok, reply: d[1], statusText: ok ? 'туннель установлен' : 'отказ (' + d[1] + ')' });
        sock.destroy();
      } else {
        resolve({ ok: false, reply: d.toString('hex').slice(0, 30), step });
        sock.destroy();
      }
    });
    sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, statusText: 'timeout на шаге ' + step }); });
    sock.on('error', (e) => resolve({ ok: false, statusText: e.code || e.message }));
  });
}

const r = await fullSocks5();
console.log('SOCKS5 CONNECT к api.telegram.org:', JSON.stringify(r));
if (r.ok) console.log('\n✅ Прокси работает: Telegram доступен через SOCKS5!');
else console.log('\n❌ Через прокси Telegram недоступен:', r.statusText);
process.exit(0);
