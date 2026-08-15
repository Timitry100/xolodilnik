/**
 * Автообновление проекта с GitHub/GitLab.
 *
 * Что делает:
 *  - запускает сервер как дочерний процесс;
 *  - каждые AUTO_UPDATE_INTERVAL мс (по умолчанию 2 минуты) проверяет Git:
 *      git fetch origin → сравнение HEAD с origin/<ветка>;
 *  - если на GitHub появились новые коммиты — подтягивает изменения:
 *      git pull → npm install (если менялся package.json) → npm run build (если менялся app/)
 *      → перезапуск сервера.
 *
 * Запускается из start.bat (папка проекта = рабочая папка).
 * Если незакоммиченные изменения — обновление пропускается (чтобы не ломать работу).
 */
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SERVER_DIR = path.join(ROOT, 'server');
const APP_DIR = path.join(ROOT, 'app');
const CHECK_INTERVAL_MS = Number(process.env.AUTO_UPDATE_INTERVAL || 120000);

let serverChild = null;
let warnedNoRemote = false;

function git(cmd, quiet = false) {
  try {
    const out = execSync(`git ${cmd}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe'],
    });
    return out.trim();
  } catch {
    return '';
  }
}

function hasUncommitted() {
  return git('status --porcelain', true).split('\n').filter(Boolean).length > 0;
}

function run(cmd, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code));
    child.on('error', () => resolve(1));
  });
}

function startServer() {
  if (serverChild) {
    try {
      serverChild.kill();
    } catch {}
    serverChild = null;
  }
  console.log('[auto-update] ▶ Запускаю сервер…');
  serverChild = spawn(process.execPath, ['src/index.js'], { cwd: SERVER_DIR, stdio: 'inherit' });
  serverChild.on('exit', (code) => {
    if (serverChild) {
      console.log('[auto-update] Сервер остановлен (код', code, ')');
      serverChild = null;
    }
  });
}

async function checkUpdates() {
  const branch = git('symbolic-ref --short HEAD') || 'main';
  const remote = git('remote get-url origin');
  if (!remote) {
    if (!warnedNoRemote) {
      console.log('[auto-update] ⚠ Нет удалённого репозитория (git remote origin).');
      console.log('[auto-update]   Загрузи проект на GitHub и выполни:');
      console.log(`[auto-update]   git remote add origin <URL_репозитория>`);
      console.log(`[auto-update]   git push -u origin ${branch}`);
      warnedNoRemote = true;
    }
    return;
  }
  if (!git('fetch origin', true)) return; // сеть недоступна — тихо ждём дальше

  const local = git('rev-parse HEAD');
  const remoteHead = git(`rev-parse origin/${branch}`);
  if (!local || !remoteHead || local === remoteHead) return;

  if (hasUncommitted()) {
    console.log('[auto-update] ⚠ Есть незакоммиченные изменения — обновление пропущено.');
    console.log('[auto-update]   Закоммить их или выполни git stash, затем жди следующей проверки.');
    return;
  }

  console.log('[auto-update] 🚀 На GitHub появились новые изменения. Обновляюсь…');
  const changed = git(`diff --name-only ${local} ${remoteHead}`)
    .split('\n')
    .filter(Boolean);

  if (!git(`pull --ff-only origin ${branch}`, true)) {
    console.log('[auto-update] ❌ git pull не удался. Пропускаю.');
    return;
  }
  console.log('[auto-update] ✅ Изменения подтянуты.');

  if (changedFiles.some((f) => f === 'server/package.json' || f === 'server/package-lock.json')) {
    console.log('[auto-update] Обновляю зависимости сервера…');
    await run('npm install --no-audit --no-fund', SERVER_DIR);
  }
  if (changedFiles.some((f) => f === 'app/package.json' || f === 'app/package-lock.json')) {
    console.log('[auto-update] Обновляю зависимости приложения…');
    await run('npm install --no-audit --no-fund', APP_DIR);
  }
  if (changed.some((f) => f.startsWith('app/'))) {
    console.log('[auto-update] Собираю фронтенд…');
    await run('npm run build', APP_DIR);
  }
  console.log('[auto-update] 🔄 Перезапускаю сервер…');
  startServer();
}

console.log(`[auto-update] Джоб запущен. Проверяю обновления каждые ${Math.round(CHECK_INTERVAL_MS / 1000)} сек.`);

// Всегда проверяем/ставим зависимости при старте (server и app) —
// чтобы сервер не падал, если в новом коде появились новые пакеты.
async function initDeps() {
  console.log('[auto-update] Проверяю зависимости...');
  await run('npm install --no-audit --no-fund', SERVER_DIR);
  await run('npm install --no-audit --no-fund', APP_DIR);
}

initDeps().then(() => {
  startServer();
});
setInterval(checkUpdates, CHECK_INTERVAL_MS);

function shutdown() {
  if (serverChild) {
    try {
      serverChild.kill();
    } catch {}
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
