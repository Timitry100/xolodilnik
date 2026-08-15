/**
 * Проверка и настройка прокси для Telegram-бота.
 *
 * Запускается из start.bat перед запуском сервера.
 *  - Читает TG_PROXY из server/.env, проверяет доступ к api.telegram.org через него;
 *  - если прокси нет/не работает — просит вставить новый в формате:
 *      логин:пароль@хост:порт   (можно с протоколом socks5:// или http://)
 *  - определяет тип прокси (SOCKS5 / HTTP) и сохраняет рабочий в server/.env как TG_PROXY.
 *
 * Использование:
 *   node _tools/check_proxy.js                  — интерактивно (спросит, если нужно)
 *   node _tools/check_proxy.js "логин:пароль@хост:порт"  — неинтерактивно
 */
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import process from 'node:process';

const ROOT = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const ENV_FILE = path.join(ROOT, 'server', '.env');
const TARGET_HOST = 'api.telegram.org';
const TARGET_PORT = 443;
const MAX_ATTEMPTS = 3;

/* ---------- работа с server/.env ---------- */

function readEnv() {
  try {
    const out = {};
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

function writeEnv(key, value) {
  let lines = [];
  try {
    lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  } catch {}
  lines = lines.filter((l) => !new RegExp(`^${key}=`).test(l));
  lines.push(`${key}=${value}`);
  fs.writeFileSync(ENV_FILE, lines.join('\r\n'));
}

/* ---------- парсинг ввода ---------- */

function parseProxy(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  let type = null;
  let m = s.match(/^(socks5|socks4|https?):\/\/(.+)$/i);
  if (m) {
    type = m[1].toLowerCase() === 'socks4' ? 'socks4' : m[1].toLowerCase().startsWith('http') ? 'http' : 'socks5';
    s = m[2];
  }
  let user = '';
  let pass = '';
  let hostPort = s;
  const at = s.lastIndexOf('@');
  if (at !== -1) {
    const auth = s.slice(0, at);
    hostPort = s.slice(at + 1);
    const colon = auth.indexOf(':');
    if (colon !== -1) {
      user = auth.slice(0, colon);
      pass = auth.slice(colon + 1);
    } else {
      user = auth;
    }
  }
  let host = hostPort;
  let port = 0;
  const colon = hostPort.lastIndexOf(':');
  if (colon !== -1) {
    host = hostPort.slice(0, colon);
    port = Number(hostPort.slice(colon + 1));
  }
  if (!host || !port) return null;
  return { type, user, pass, host, port };
}

/* ---------- проверка SOCKS5 ---------- */

function testSocks(p) {
  return new Promise((resolve) => {
    const sock = net.connect(p.port, p.host);
    sock.setTimeout(10000);
    let step = 0;
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(r);
    };
    const doConnect = () => {
      const hostB = Buffer.from(TARGET_HOST);
      const portB = Buffer.from([(TARGET_PORT >> 8) & 0xff, TARGET_PORT & 0xff]);
      sock.write(Buffer.from([0x05, 0x01, 0x00, 0x03, hostB.length, ...hostB, ...portB]));
    };
    sock.on('connect', () => {
      // предлагаем методы: 0x02 (auth), 0x00 (без auth)
      sock.write(Buffer.from([0x05, 0x02, 0x02, 0x00]));
    });
    sock.on('data', (d) => {
      if (step === 0 && d[0] === 0x05) {
        const method = d[1];
        if (method === 0x02 && p.user) {
          step = 1;
          const u = Buffer.from(p.user);
          const pw = Buffer.from(p.pass || '');
          sock.write(Buffer.from([0x01, u.length, ...u, pw.length, ...pw]));
        } else if (method === 0x00 && !p.user) {
          step = 2;
          doConnect();
        } else {
          finish({ ok: false, statusText: 'несовместимая авторизация' });
        }
      } else if (step === 1 && d[0] === 0x01) {
        if (d[1] === 0x00) {
          step = 2;
          doConnect();
        } else {
          finish({ ok: false, statusText: 'неверный логин/пароль' });
        }
      } else if (step === 2 && d[0] === 0x05) {
        finish(d[1] === 0x00 ? { ok: true, type: 'socks5' } : { ok: false, statusText: 'отказ соединения (' + d[1] + ')' });
      } else {
        finish({ ok: false, statusText: 'протокол SOCKS не распознан' });
      }
    });
    sock.on('timeout', () => finish({ ok: false, statusText: 'таймаут' }));
    sock.on('error', (e) => finish({ ok: false, statusText: e.code || e.message }));
  });
}

/* ---------- проверка HTTP-прокси ---------- */

function testHttp(p) {
  return new Promise((resolve) => {
    const sock = net.connect(p.port, p.host);
    sock.setTimeout(10000);
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(r);
    };
    sock.on('connect', () => {
      const auth = p.user
        ? 'Proxy-Authorization: Basic ' + Buffer.from(`${p.user}:${p.pass}`).toString('base64') + '\r\n'
        : '';
      sock.write(`CONNECT ${TARGET_HOST}:${TARGET_PORT} HTTP/1.1\r\nHost: ${TARGET_HOST}:${TARGET_PORT}\r\n${auth}\r\n`);
    });
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      if (buf.includes('\r\n\r\n') || buf.includes('\n\n')) {
        const status = buf.match(/HTTP\/1\.[01]\s+(\d{3})/);
        finish(status && status[1] === '200' ? { ok: true, type: 'http' } : { ok: false, statusText: 'HTTP ' + (status ? status[1] : '?') });
      }
    });
    sock.on('timeout', () => finish({ ok: false, statusText: 'таймаут' }));
    sock.on('error', (e) => finish({ ok: false, statusText: e.code || e.message }));
  });
}

/* ---------- сборка URL и проверка ---------- */

function buildUrl(p) {
  const auth = p.user ? `${encodeURIComponent(p.user)}:${encodeURIComponent(p.pass)}@` : '';
  const type = p.type && p.type === 'http' ? 'http' : 'socks5';
  return `${type}://${auth}${p.host}:${p.port}`;
}

async function testProxy(p) {
  let res = null;
  if (!p.type || p.type === 'socks5') {
    res = await testSocks(p);
    if (res.ok) return res;
  }
  if (!p.type || p.type === 'http') {
    res = await testHttp(p);
    if (res.ok) return res;
  }
  return res || { ok: false, statusText: 'не удалось проверить' };
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/* ---------- главная логика ---------- */

async function main() {
  let proxy = process.argv[2] || readEnv().TG_PROXY || '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!proxy) {
      const answer = await ask(
        '\n[прокси] Вставь прокси для Telegram-бота (или нажми Enter, чтобы пропустить)\n' +
        'Формат:  логин:пароль@хост:порт\n' +
        'Например: sC7hpq:RaqWe6@168.81.67.177:8000\n' +
        'Прокси: '
      );
      proxy = answer.trim();
      if (!proxy) {
        console.log('[прокси] Пропущено. Бот может не работать, пока не будет рабочего прокси.');
        process.exit(0);
      }
    }

    const p = parseProxy(proxy);
    if (!p) {
      console.log('[прокси] ❌ Неверный формат. Нужно: логин:пароль@хост:порт');
      proxy = '';
      continue;
    }

    console.log(`[прокси] Проверяю ${p.host}:${p.port} → ${TARGET_HOST}...`);
    const res = await testProxy(p);
    if (res.ok) {
      const url = buildUrl(p);
      writeEnv('TG_PROXY', url);
      console.log(`[прокси] ✅ Прокси работает (${res.type}). Сохранён в server/.env: TG_PROXY=${url}`);
      process.exit(0);
    }

    console.log(`[прокси] ❌ Прокси не работает: ${res.statusText}`);
    if (process.argv[2]) process.exit(1); // неинтерактивный режим — не спрашиваем повторно
    proxy = '';
  }

  console.log('[прокси] Не удалось настроить рабочий прокси за ' + MAX_ATTEMPTS + ' попытки. Бот может не работать.');
  process.exit(1);
}

main();

