// Запуск start.bat как при двойном клике (stdin пустой) + захват вывода
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const child = spawn('cmd.exe', ['/c', 'start.bat'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });

let out = '';
let ok = false;
let killed = false;
let done = false;

child.stdout.on('data', (d) => (out += d.toString()));
child.stderr.on('data', (d) => (out += d.toString()));
child.stdin.end(); // EOF: set /p сразу получает пустые значения

function finish(code) {
  if (done) return;
  done = true;
  console.log('=== КОД ЗАВЕРШЕНИЯ:', code, '===');
  console.log('=== ВЫВОД ===');
  console.log(out);
  process.exit(code ?? 0);
}

child.on('exit', (code) => {
  if (!killed) finish(code);
});

// сервер после запуска работает бесконечно — завершаем тест через 20 сек
setTimeout(() => {
  ok = out.includes('[api] сервер слушает');
  const badEcho = out.includes('@echo') && out.includes('не является');
  console.log('Сервер поднялся:', ok, '| Ошибка @echo off:', badEcho);
  console.log('Запрошен BOT_TOKEN:', out.includes('Токен бота:'));
  killed = true;
  spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  setTimeout(() => finish(ok && !badEcho ? 0 : 1), 800);
}, 20000);

