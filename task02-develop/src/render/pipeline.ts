/**
 * pipeline.ts — 逐像素渲染
 *
 * 混合在 **gamma 空间**（0–255 的 sRGB 数值）做，不是线性光。
 * 这一条和 Task 01 的色域映射相反——那边必须在线性光里算，
 * 但混合模式要跟 Photoshop 的观感一致，而 PS 默认就在 gamma 空间混合。
 * 摄影师的手感是被 PS 训练出来的，跟着它走。
 *
 * 关于性能：第一版把柔光公式直接写在像素循环里，1600×1200 一帧要 45ms，
 * 超出一帧预算三倍——瓶颈是每像素三通道各做一次除法、乘法和 Math.sqrt。
 * 现在混合函数本身也烤成 256×256 的表（64 KB），像素循环里只剩数组索引和整数运算。
 */

import { lightnessIndex, type Lut } from './lut';

export type BlendMode = 'normal' | 'softLight' | 'overlay' | 'luminosity';

export const BLEND_LABELS: Record<BlendMode, string> = {
  normal: '正常',
  softLight: '柔光',
  overlay: '叠加',
  luminosity: '明度',
};

/* --------------------------- 混合公式（0–255） --------------------------- */

/** W3C / Photoshop 的柔光公式 */
function softLightF(base: number, blend: number): number {
  const b = base / 255, s = blend / 255;
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  const out = s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (d - b);
  return out * 255;
}

function overlayF(base: number, blend: number): number {
  const b = base / 255, s = blend / 255;
  const out = b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
  return out * 255;
}

/** 把二元混合函数烤成 256×256 的表，下标 `base << 8 | blend`。只在首次用到时构建。 */
function bake(fn: (b: number, s: number) => number): Uint8ClampedArray {
  const t = new Uint8ClampedArray(65536);
  for (let b = 0; b < 256; b++) {
    const row = b << 8;
    for (let s = 0; s < 256; s++) t[row + s] = fn(b, s) + 0.5;
  }
  return t;
}

const BLEND_TABLES: Partial<Record<BlendMode, Uint8ClampedArray>> = {};

function tableFor(mode: BlendMode): Uint8ClampedArray | null {
  if (mode === 'normal' || mode === 'luminosity') return null;
  if (!BLEND_TABLES[mode]) BLEND_TABLES[mode] = bake(mode === 'softLight' ? softLightF : overlayF);
  return BLEND_TABLES[mode]!;
}

/* --------------------------------- 渲染 --------------------------------- */

export interface RenderOptions {
  lut: Lut;
  blend: BlendMode;
  /** 0–1。0 是原图，1 是完全套用 */
  strength: number;
}

/**
 * 把 `src` 渲染到 `dst`。两者必须同尺寸。
 *
 * 复用同一块 `dst` 而不是每次新建 ImageData —— 拖动强度滑块时每帧都会调用，
 * 反复分配几 MB 的 buffer 会触发 GC 卡顿。
 */
export function render(src: ImageData, dst: ImageData, opts: RenderOptions): void {
  const s = src.data, d = dst.data;
  const { lut, blend } = opts;
  const lr = lut.r, lg = lut.g, lb = lut.b;
  const k = opts.strength < 0 ? 0 : opts.strength > 1 ? 1 : opts.strength;

  // 强度为 0 时直接拷贝，省掉整趟像素循环
  if (k === 0) { d.set(s); return; }

  // 定点数插值：用 0–256 的整数权重代替浮点乘法
  const ki = (k * 256 + 0.5) | 0;
  const n = s.length;

  if (blend === 'luminosity') {
    // 映射色减去它自己的明度、再加上原图明度。
    // 查找表每一项的明度是固定的，预先算好这 256 个差值，循环里不重复算。
    const shiftOf = new Int16Array(256);
    for (let i = 0; i < 256; i++) shiftOf[i] = i - lightnessIndex(lr[i], lg[i], lb[i]);

    for (let i = 0; i < n; i += 4) {
      const r0 = s[i], g0 = s[i + 1], b0 = s[i + 2];
      const idx = lightnessIndex(r0, g0, b0);
      const sh = shiftOf[idx];
      d[i]     = r0 + (((lr[idx] + sh - r0) * ki) >> 8);
      d[i + 1] = g0 + (((lg[idx] + sh - g0) * ki) >> 8);
      d[i + 2] = b0 + (((lb[idx] + sh - b0) * ki) >> 8);
      d[i + 3] = s[i + 3];
    }
    return;
  }

  const table = tableFor(blend);

  if (table === null) {
    // 正常混合：直接在原图与映射色之间插值
    for (let i = 0; i < n; i += 4) {
      const r0 = s[i], g0 = s[i + 1], b0 = s[i + 2];
      const idx = lightnessIndex(r0, g0, b0);
      d[i]     = r0 + (((lr[idx] - r0) * ki) >> 8);
      d[i + 1] = g0 + (((lg[idx] - g0) * ki) >> 8);
      d[i + 2] = b0 + (((lb[idx] - b0) * ki) >> 8);
      d[i + 3] = s[i + 3];
    }
    return;
  }

  // 柔光 / 叠加：查混合表，再按强度插值
  for (let i = 0; i < n; i += 4) {
    const r0 = s[i], g0 = s[i + 1], b0 = s[i + 2];
    const idx = lightnessIndex(r0, g0, b0);
    d[i]     = r0 + (((table[(r0 << 8) + lr[idx]] - r0) * ki) >> 8);
    d[i + 1] = g0 + (((table[(g0 << 8) + lg[idx]] - g0) * ki) >> 8);
    d[i + 2] = b0 + (((table[(b0 << 8) + lb[idx]] - b0) * ki) >> 8);
    d[i + 3] = s[i + 3];
  }
}
