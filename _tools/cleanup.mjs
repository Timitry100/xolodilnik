// Удаление временных файлов-проб и диагностики
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik', '_tools');
const toRemove = [
  'probe_apis.mjs',
  'probe_apis2.mjs',
  'check_site.mjs',
  'check_cert.mjs',
  '_askpass.cmd',
  'ghcheck.mjs',
  'ghcheck2.mjs',
  'showenv.mjs',
  'inspect_bat.mjs',
  'check_port.mjs',
  'probe_off.mjs',
  'probe_dns.mjs',
  'probe_honest.mjs',
  'probe_sqlite.js',
  'probe_fetch.js',
  '_fix_fetch.mjs',
  '_probe.db',
  '_probe2.db',
  '_probe.db-journal',
  '_probe2.db-journal',
];

let removed = 0;
for (const name of toRemove) {
  try {
    fs.unlinkSync(path.join(root, name));
    removed++;
  } catch {}
}
console.log(`Удалено файлов: ${removed}`);
