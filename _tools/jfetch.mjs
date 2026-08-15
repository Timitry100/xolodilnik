// Мини-fetch на node:http с отключённым keep-alive
// (используется только в тестах, чтобы сокеты не держали процесс на Windows)
import http from 'node:http';
import { URL } from 'node:url';

const agent = new http.Agent({ keepAlive: false });

export function jfetch(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request(
      {
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: { ...headers, ...(data ? { 'Content-Length': data.length } : {}) },
        agent,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            async text() {
              return buf.toString('utf8');
            },
            async json() {
              try {
                return JSON.parse(buf.toString('utf8'));
              } catch {
                return {};
              }
            },
          });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
