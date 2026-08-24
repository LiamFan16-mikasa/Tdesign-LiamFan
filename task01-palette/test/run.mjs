/**
 * test/run.mjs — 无依赖测试。`npm test` 会先打包 src 再跑这里。
 *
 * 三组：
 *   1. CAM16 / HCT 对照 Material 公布的参考值，证明色彩空间实现是对的
 *   2. 输入解析
 *   3. 色阶不变量：单调、覆盖、锚点命中、极端输入不崩
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execSync('npx esbuild src/index.ts --bundle --format=esm --platform=node --outfile=dist/lib.mjs', {
  cwd: root, stdio: 'pipe',
});
const lib = await import(path.join(root, 'dist/lib.mjs'));
const { generatePalette, parseColor, toHex, rgbToHct, hctToRgb, simulate } = lib;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ── 1. CAM16 / HCT ─────────────────────────────────────────────── */
console.log('CAM16 / HCT 对照 Material 参考值');
for (const [hex, h, c, t] of [
  ['#0000FF', 282.79, 87.23, 32.30],
  ['#FF0000', 27.41, 113.36, 53.24],
  ['#00FF00', 142.14, 108.41, 87.74],
  ['#FFFFFF', null, null, 100.0],
  ['#000000', null, null, 0.0],
]) {
  const v = rgbToHct(parseColor(hex));
  if (h !== null) {
    ok(`${hex} 色相`, near(v.h, h, 0.1), `${v.h.toFixed(2)} ≠ ${h}`);
    ok(`${hex} 彩度`, near(v.c, c, 0.1), `${v.c.toFixed(2)} ≠ ${c}`);
  }
  ok(`${hex} 明度`, near(v.t, t, 0.05), `${v.t.toFixed(2)} ≠ ${t}`);
}

console.log('HCT 往返转换');
for (const hex of ['#0052D9', '#E34D59', '#00A870', '#7B4FD9', '#FFEB3B', '#123456']) {
  const v = rgbToHct(parseColor(hex));
  ok(`${hex} 往返`, toHex(hctToRgb(v.h, v.c, v.t).rgb) === hex, toHex(hctToRgb(v.h, v.c, v.t).rgb));
}

/* ── 2. 输入解析 ────────────────────────────────────────────────── */
console.log('输入解析');
for (const [input, want] of [
  ['#0052D9', '#0052D9'],
  ['0052d9', '#0052D9'],
  ['#05D', '#0055DD'],
  ['rgb(0, 82, 217)', '#0052D9'],
  ['rgba(0 82 217 / .5)', '#0052D9'],
  ['hsl(0, 0%, 100%)', '#FFFFFF'],
  ['hsl(120 100% 50%)', '#00FF00'],
  ['  #0052D9  ', '#0052D9'],
]) ok(`解析 ${input}`, toHex(parseColor(input)) === want, String(parseColor(input) && toHex(parseColor(input))));

for (const bad of ['', 'nope', '#zz', '#12345', 'rgb(a,b,c)'])
  ok(`拒绝 ${JSON.stringify(bad)}`, parseColor(bad) === null);

/* ── 3. 色阶不变量 ──────────────────────────────────────────────── */
console.log('色阶不变量');
const CASES = ['#0052D9', '#E34D59', '#ED7B2F', '#00A870', '#7B4FD9', '#FFEB3B',
               '#00FFFF', '#111111', '#F5F5F5', '#888888', '#FFFFFF', '#000000'];

for (const hex of CASES) {
  for (const mode of ['light', 'dark']) {
    const p = generatePalette(hex, mode);
    ok(`${hex} ${mode} 生成成功`, !!p);
    if (!p) continue;

    ok(`${hex} ${mode} 十阶`, p.brand.length === 10);
    ok(`${hex} ${mode} 十四阶中性`, p.neutral.length === 14);

    // 明度必须严格单调，方向由模式决定
    const tones = p.brand.map((s) => s.tone);
    const mono = tones.every((v, i) => i === 0 || (mode === 'light' ? v < tones[i - 1] : v > tones[i - 1]));
    ok(`${hex} ${mode} 明度单调`, mono, tones.map((t) => t.toFixed(1)).join(' '));

    // 覆盖范围：首末两阶的明度跨度不能太窄，否则色阶不够用
    ok(`${hex} ${mode} 覆盖跨度`, Math.abs(tones[0] - tones[9]) > 60,
       Math.abs(tones[0] - tones[9]).toFixed(1));

    // 没有两阶塌成同一个色
    ok(`${hex} ${mode} 无重复`, new Set(p.brand.map((s) => s.hex)).size === 10);

    // 锚点那一阶的明度必须等于输入主色的明度
    const anchor = p.brand[p.anchorIndex - 1];
    ok(`${hex} ${mode} 锚点命中`, near(anchor.tone, p.anchorTone, 0.6),
       `${anchor.tone.toFixed(2)} vs ${p.anchorTone.toFixed(2)}`);
    ok(`${hex} ${mode} 锚点夹取合理`, near(p.anchorTone, Math.min(97, Math.max(3, p.input.t)), 0.01));

    // 输出必须是合法的六位十六进制
    ok(`${hex} ${mode} 色值合法`, p.brand.every((s) => /^#[0-9A-F]{6}$/.test(s.hex)));
  }
}

// 中性色阶不能抢戏：任何色相下彩度都得压得住
for (const hex of CASES) {
  const p = generatePalette(hex, 'light');
  ok(`${hex} 中性彩度受控`, p.neutral.every((s) => s.chroma < 6),
     Math.max(...p.neutral.map((s) => s.chroma)).toFixed(1));
}

// 灰色输入必须给灰色色阶，不能因为 atan2(0,0)=0 而带上红调
for (const hex of ['#111111', '#888888', '#CCCCCC']) {
  const p = generatePalette(hex, 'light');
  ok(`${hex} 灰进灰出`, p.brand.every((s) => {
    const c = parseColor(s.hex);
    return c.r === c.g && c.g === c.b;
  }), p.brand.map((s) => s.hex).join(' '));
}

/* ── 4. 色觉模拟 ────────────────────────────────────────────────── */
console.log('色觉模拟');
const p = generatePalette('#0052D9', 'light');
ok('none 原样返回', p.brand.every((s) => toHex(simulate(s.rgb, 'none')) === s.hex));
for (const type of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia']) {
  const sim = p.brand.map((s) => simulate(s.rgb, type));
  ok(`${type} 全部合法`, sim.every((c) => [c.r, c.g, c.b].every((v) => v >= 0 && v <= 255 && Number.isInteger(v))));
  // 关键论点：色阶靠明度拉开，模拟后十阶依然互不相同
  ok(`${type} 十阶仍可分`, new Set(sim.map(toHex)).size === 10, String(new Set(sim.map(toHex)).size));
}
ok('全色盲结果为灰', simulate(parseColor('#0052D9'), 'achromatopsia').r === simulate(parseColor('#0052D9'), 'achromatopsia').b);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
