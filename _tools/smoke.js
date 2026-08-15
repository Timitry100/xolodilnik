// Смоук-тест: полный запуск сервера (бот + API + scheduler)
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const serverDir = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik', 'server');
const child = spawn(process.execPath, ['src/index.js'], { cwd: serverDir, stdio: ['ignore', 'pipe', 'pipe'] });

let out = '';
child.stdout.on('data', (d) => (out += d.toString()));
child.stderr.on('data', (d) => (out += d.toString()));

const timer = setTimeout(() => {
  const ok = out.includes('[api] сервер слушает');
  if (ok) console.log('✅ сервер запустился целиком (бот + api + scheduler)');
  else console.log('❌ сервер не поднялся. Логи:\n' + out);
  child.on('exit', () => process.exit(ok ? 0 : 1));
  child.kill();
}, 4500);
timer.unref();
