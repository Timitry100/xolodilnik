// Служебный скрипт: npm install в server и app.
// Пути строятся из USERPROFILE, чтобы не передавать кириллицу через cmd.
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik');
const folders = process.argv.slice(2);
const targets = folders.length ? folders : ['server', 'app'];

for (const folder of targets) {
  const dir = path.join(root, folder);
  console.log(`\n=== npm install in ${dir} ===`);
  execSync('npm install --no-audit --no-fund', { cwd: dir, stdio: 'inherit' });
}
console.log('\nDONE');
