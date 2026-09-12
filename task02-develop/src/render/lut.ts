/**
 * lut.ts — 渐变映射的查找表
 *
 * 渐变映射的定义：把照片的明度当索引，去一条由浅到深的色阶上取色。
 * 暗部取色阶的深端，高光取浅端。
 *
 * 朴素写法是逐像素算明度、逐像素在色阶上插值取色。一张 1600×1200 的图有 192 万像素，
 * 每个像素做一次 sRGB → 线性 → OKLab 的往返，浏览器会卡死。
 *
 * 所以这里预计算：色阶只在用户换色调时变，那就在它变的时候算一张 **256 项的表**，
 * 之后逐像素只做一次数组读取。四百万像素也能实时。
 *
 * 两个必须做对的地方：
 *   · 明度用 CIELab 的 L*，不是 RGB 平均值，也不是 HSL 的 L —— 后两者不是感知亮度，
 *     用它们当索引，天空和云会糊成一片
 *   · 色阶插值在 OKLab 里做 —— 在 sRGB 里线性插值会经过灰点，中间色发脏
 */

import type { Swatch } from '@palette/palette';
import { srgbToLinear, linearToSrgb, lstarFromY, clamp, type RGB } from '@palette/color';

/** 三个通道各 256 项，下标是明度索引 */
export interface Lut {
  r: Uint8ClampedArray;
  g: Uint8ClampedArray;
  b: Uint8ClampedArray;
}

/* ------------------------- OKLab（只要这两个方向） ------------------------- */

function toOklab(c: RGB): [number, number, number] {
  const r = srgbToLinear(c.r), g = srgbToLinear(c.g), b = srgbToLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function fromOklab(L: number, A: number, B: number): RGB {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return {
    r: linearToSrgb(clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1)),
    g: linearToSrgb(clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0, 1)),
    b: linearToSrgb(clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s, 0, 1)),
  };
}

/* --------------------------- 8 位灰度 → L* 的表 --------------------------- */

/**
 * 逐像素算 L* 也很贵（一次 cbrt）。所以把它也烤成表。
 *
 * 三张权重表把「sRGB 分量 → 加权线性光」一步做完，相加后直接得到 0–1023 的索引，
 * 再查一张 Uint8 表拿到 0–255 的明度索引。像素循环里只剩 4 次数组读取和 2 次加法。
 *
 * 灰度用 Rec.709 权重在**线性光**里算，这一步不能在 gamma 空间做——
 * 在 gamma 空间加权会让饱和的蓝天算出偏亮的明度。
 */
const W_R = new Float32Array(256);
const W_G = new Float32Array(256);
const W_B = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const lin = srgbToLinear(i) * 1023;
  W_R[i] = 0.2126 * lin;
  W_G[i] = 0.7152 * lin;
  W_B[i] = 0.0722 * lin;
}

/** 加权线性光索引（0–1023）→ 明度索引（0–255） */
const LSTAR_INDEX = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) {
  LSTAR_INDEX[i] = Math.min(255, Math.round(lstarFromY((i / 1023) * 100) * 2.55));
}

/** 像素 → 感知明度索引 0–255。热路径，只有四次数组读取和两次加法。 */
export function lightnessIndex(r: number, g: number, b: number): number {
  return LSTAR_INDEX[(W_R[r] + W_G[g] + W_B[b]) | 0];
}

/* ------------------------------- 构建查找表 ------------------------------- */

/**
 * 由一条色阶构建 256 项查找表。
 *
 * @param ramp  Task 01 生成的色阶。第 1 阶最浅，最后一阶最深
 * @param from  用色阶的第几阶作为高光端（1 起）
 * @param to    用色阶的第几阶作为暗部端
 *
 * `from`–`to` 不是可有可无的选项，它是风光调色里最核心的一个手法。
 * 全幅度（1–10）映射会把照片最暗处推到近黑、最亮处推到近白，对比度拉满；
 * 窄幅（比如 4–7）则让暗部停在中深色、高光停在中浅色——
 * 也就是提亮的黑场加压低的高光，哑光与褪色胶片质感的技术定义。
 * Photoshop 里这叫「输出色阶」，Lightroom 里是曲线的黑白场。
 */
export function buildLut(ramp: Swatch[], from = 1, to = ramp.length): Lut {
  // 反着传、越界、两端相等都要能活下来——插值至少需要两个色标
  const len = ramp.length;
  const start = Math.min(from, to), end = Math.max(from, to);
  const lo = Math.min(Math.max(start, 1), len - 1);
  const hi = Math.min(Math.max(end, lo + 1), len);
  const slice = ramp.slice(lo - 1, hi);
  const n = slice.length;
  // 先把每一阶转到 OKLab，插值在这里做
  const stops = slice.map((s) => toOklab(s.rgb));
  stops.reverse(); // 索引 0 是最暗，对应所选区间里最深的一端

  const r = new Uint8ClampedArray(256);
  const g = new Uint8ClampedArray(256);
  const b = new Uint8ClampedArray(256);

  for (let i = 0; i < 256; i++) {
    const pos = (i / 255) * (n - 1);
    const lo = Math.min(Math.floor(pos), n - 2);
    const t = pos - lo;
    const a = stops[lo], c = stops[lo + 1];
    const out = fromOklab(
      a[0] + (c[0] - a[0]) * t,
      a[1] + (c[1] - a[1]) * t,
      a[2] + (c[2] - a[2]) * t
    );
    r[i] = out.r;
    g[i] = out.g;
    b[i] = out.b;
  }

  return { r, g, b };
}
