// Создание репозитория на GitHub и push проекта.
// Токен читается из _tools/github_token.txt (файл в .gitignore, в Git не попадёт).
// Токен не логируется и не попадает в командную строку (askpass-скрипт).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const REPO_NAME = 'xolodilnik';
// Публичный: в репозитории нет секретов (server/.env в .gitignore),
// а джоб автообновления на сервере сможет пуллить без авторизации.
const PRIVATE = false;

function readToken() {
  try {
    return fs.readFileSync(path.join(ROOT, '_tools', 'github_token.txt'), 'utf8').trim();
  } catch {
    return '';
  }
}

function ghApi(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent': 'xolodilnik-setup',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {}
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const token = readToken();
if (!token) {
  console.log('❌ Нет токена в _tools/github_token.txt');
  process.exit(1);
}

// 1) Авторизация — определяем логин
const me = await ghApi('GET', 'https://api.github.com/user', token);
if (me.status !== 200 || !me.json?.login) {
  console.log('❌ Токен не работает:', me.status, me.json?.message || '');
  process.exit(1);
}
const login = me.json.login;
console.log('✅ Авторизация: @' + login);

// 2) Создание репозитория (или подключение к существующему)
const create = await ghApi('POST', 'https://api.github.com/user/repos', token, {
  name: REPO_NAME,
  private: PRIVATE,
  description: 'Xolodilnik — Telegram Mini App: учёт продуктов, сроки годности, рецепты ИИ',
});
if (create.status === 201) {
  console.log('✅ Репозиторий создан:', create.json.full_name);
} else if (create.status === 422) {
  console.log('ℹ️ Репозиторий уже существует: ' + login + '/' + REPO_NAME);
} else {
  console.log('❌ Ошибка создания:', create.status, create.json?.message || '');
  process.exit(1);
}

// 2.1) Выставить видимость (публичный/приватный)
const patch = await ghApi('PATCH', `https://api.github.com/repos/${login}/${REPO_NAME}`, token, { private: PRIVATE });
if (patch.status === 200) {
  console.log('ℹ️ Видимость репозитория:', PRIVATE ? 'приватный' : 'публичный');
} else {
  console.log('⚠️ Не удалось изменить видимость:', patch.status, patch.json?.message || '');
}

// 3) remote origin
const remote = `https://github.com/${login}/${REPO_NAME}.git`;
spawnSync('git', ['remote', 'remove', 'origin'], { cwd: ROOT, stdio: 'ignore' });
spawnSync('git', ['remote', 'add', 'origin', remote], { cwd: ROOT, stdio: 'ignore' });
console.log('✅ remote origin:', remote);

// 4) push (токен передаётся через askpass, не в командной строке)
const askpass = path.join(ROOT, '_tools', '_askpass.cmd');
fs.writeFileSync(askpass, '@echo off\r\necho ' + token + '\r\n', 'utf8');
const env = { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0' };
const push = spawnSync(
  'git',
  ['-c', 'credential.helper=', 'push', '-u', 'origin', 'main'],
  { cwd: ROOT, env, encoding: 'utf8' }
);
console.log('--- git push ---');
console.log(push.stdout || push.stderr || '');
console.log('push exit:', push.status);
try {
  fs.unlinkSync(askpass);
} catch {}

if (push.status !== 0) {
  console.log('❌ Push не удался.');
  process.exit(1);
}
console.log('\n🎉 Проект загружен на GitHub: https://github.com/' + login + '/' + REPO_NAME);
process.exit(0);
