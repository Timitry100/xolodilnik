// Быстрая проверка autoupdate: npm install при старте + запуск сервера (без сборки фронтенда)
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const child = spawn(process.execPath, ['_tools/autoupdate.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });

let out = '';
let done = false;
child.stdout.on('data', (d) => (out += d.toString()));
child.stderr.on('data', (d) => (out += d.toString()));

function finish(code) {
  if (done) return;
  done = true;
  console.log(out);
  console.log('=== КОД:', code, '===');
  process.exit(code ?? 0);
}

const timer = setTimeout(() => {
  const ok = out.includes('[api] сервер слушает');
  const proxyOk = out.includes('используется прокси');
  console.log('Сервер:', ok, '| Прокси:', proxyOk);
  child.on('exit', () => finish(ok ? 0 : 1));
  spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  setTimeout(() => finish(ok ? 0 : 1), 800);
}, 25000);
timer.unref();
