// 把打包后的 JS 内联进 HTML，产出一个双击即可运行的单文件。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
const out = html.replace('<script src="./dist/app.js"></script>', `<script>\n${js}\n</script>`);
const target = path.join(root, 'dist/色阶发生器.html');
fs.writeFileSync(target, out);
console.log(`${path.basename(target)}  ${(fs.statSync(target).size / 1024).toFixed(1)} kB`);
