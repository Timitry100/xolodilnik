// Push на GitHub с таймаутом и без интерактивных запросов.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const r = spawnSync('git', ['push', 'origin', 'main'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 60000,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
});
console.log('exit:', r.status);
console.log(r.stdout || '');
console.log(r.stderr || '');
process.exit(r.status === 0 ? 0 : 1);
