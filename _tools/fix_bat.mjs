// Починка start.bat: CRLF переводы строк (для cmd.exe)
// BOM убираем — он ломает первую строку @echo off в cmd.exe.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const file = path.join(process.env.USERPROFILE, 'Desktop', 'Xolodilnik', 'start.bat');

let content = fs.readFileSync(file, 'utf8');
// убрать BOM, если есть
if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
// нормализуем переводы строк к LF, затем к CRLF
content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
fs.writeFileSync(file, Buffer.from(content, 'utf8'));

// проверка
const buf = fs.readFileSync(file);
console.log('BOM:', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf);
console.log('CRLF:', buf.includes(Buffer.from('\r\n')));
console.log('Размер:', buf.length);
