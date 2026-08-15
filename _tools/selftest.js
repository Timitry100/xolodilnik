// Самопроверка (в одном процессе): API защищён + статика раздаётся.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { jfetch } from './jfetch.mjs';

process.env.PORT = '3000';

const root = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const { apiApp } = await import(pathToFileURL(path.join(root, 'server', 'src', 'api.js')).href);

const server = apiApp.listen(3000, async () => {
  try {
    let res = await jfetch('http://localhost:3000/api/stats');
    console.log(`[selftest] GET /api/stats без авторизации → ${res.status}`);
    if (res.status !== 401) throw new Error('ожидался 401 без initData');

    res = await jfetch('http://localhost:3000/');
    const html = await res.text();
    if (res.status === 200 && html.includes('id="root"') && html.includes('Холодильник')) {
      console.log(`[selftest] ✅ статика раздаётся (${res.status}, ${html.length} байт)`);
    } else {
      throw new Error('статики нет: ' + res.status);
    }

    console.log('[selftest] ✅ ВСЁ ОК');
    process.exitCode = 0;
    server.close();
    server.closeAllConnections?.();
  } catch (e) {
    console.error('[selftest] ❌', e.message);
    process.exitCode = 1;
    server.close();
    server.closeAllConnections?.();
  }
});




