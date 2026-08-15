// Замер скорости /api/search через запуск apiApp
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { jfetch } from './jfetch.mjs';

process.env.PORT = '3002';
const root = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const { apiApp } = await import(pathToFileURL(path.join(root, 'server', 'src', 'api.js')).href);

const server = apiApp.listen(3002, async () => {
  for (const q of ['молоко', 'кефир', 'сыр']) {
    const start = Date.now();
    try {
      const res = await jfetch(`http://localhost:3002/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const ms = Date.now() - start;
      console.log(`Поиск "${q}" → ${res.status} за ${ms} мс, результатов: ${Array.isArray(data) ? data.length : JSON.stringify(data).slice(0, 80)}`);
    } catch (e) {
      console.log(`Поиск "${q}" → ОШИБКА: ${e.message}`);
    }
  }
  server.close(() => process.exit(0));
});
