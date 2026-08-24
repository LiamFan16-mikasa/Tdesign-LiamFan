/**
 * hct.ts — CAM16 色貌模型与 HCT（Hue / Chroma / Tone）色彩空间
 *
 * 为什么需要它：TDesign 官方色彩体系明确说明「色阶的制定采用了 HCT 色彩空间，
 * 结合不同色相下饱和度及亮度插值拟合出优化曲线」。HCT 的两个部件是
 *   H、C ← CAM16 的色相与彩度（考虑了观察条件与色貌现象）
 *   T    ← CIELab 的 L*（与 WCAG 对比度直接挂钩）
 * 因此按 T 等距铺点，既能得到感知均匀的明度台阶，又能直接推算对比度是否达标。
 *
 * 实现参考 CIE CAM16 的标准公式；求解器用「彩度二分 + 明度 J 二分」的写法，
 * 比 Material 的解析解慢，但短且数值稳健，一次色阶只有几十次求解，完全够用。
 */

import {
  XYZ, LinRGB, RGB, clamp, inGamut, xyzToLin, rgbToXyz, quantize,
  lstarFromY, yFromLstar, sign,
} from './color';

export interface HCT { h: number; c: number; t: number }

/* ------------------------------- 观察条件 ------------------------------- */

class ViewingConditions {
  n!: number; aw!: number; nbb!: number; ncb!: number; c!: number; nc!: number;
  rgbD!: [number, number, number]; fl!: number; flRoot!: number; z!: number;

  constructor(whitePoint: XYZ, adaptingLuminance: number, backgroundLstar: number, surround: number) {
    const rW = whitePoint.x * 0.401288 + whitePoint.y * 0.650173 + whitePoint.z * -0.051461;
    const gW = whitePoint.x * -0.250268 + whitePoint.y * 1.204414 + whitePoint.z * 0.045854;
    const bW = whitePoint.x * -0.002079 + whitePoint.y * 0.048952 + whitePoint.z * 0.953127;

    const f = 0.8 + surround / 10;
    this.c = f >= 0.9 ? lerp(0.59, 0.69, (f - 0.9) * 10) : lerp(0.525, 0.59, (f - 0.8) * 10);
    this.nc = f;

    let d = f * (1 - (1 / 3.6) * Math.exp((-adaptingLuminance - 42) / 92));
    d = clamp(d, 0, 1);
    this.rgbD = [
      (100 / rW) * d + 1 - d,
      (100 / gW) * d + 1 - d,
      (100 / bW) * d + 1 - d,
    ];

    const k = 1 / (5 * adaptingLuminance + 1);
    const k4 = k * k * k * k;
    const k4F = 1 - k4;
    this.fl = k4 * adaptingLuminance + 0.1 * k4F * k4F * Math.cbrt(5 * adaptingLuminance);
    this.flRoot = Math.pow(this.fl, 0.25);

    const bgY = yFromLstar(backgroundLstar);
    this.n = bgY / whitePoint.y;
    this.z = 1.48 + Math.sqrt(this.n);
    this.nbb = 0.725 / Math.pow(this.n, 0.2);
    this.ncb = this.nbb;

    const rgbAFactors = [
      Math.pow((this.fl * this.rgbD[0] * rW) / 100, 0.42),
      Math.pow((this.fl * this.rgbD[1] * gW) / 100, 0.42),
      Math.pow((this.fl * this.rgbD[2] * bW) / 100, 0.42),
    ];
    const rgbA = rgbAFactors.map((v) => (400 * v) / (v + 27.13));
    this.aw = (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]) * this.nbb;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** sRGB 标准观察条件（D65、背景 L*=50、平均环境） */
export const SRGB_VC = new ViewingConditions(
  { x: 95.047, y: 100.0, z: 108.883 },
  (200 / Math.PI) * yFromLstar(50) / 100,
  50,
  2
);

/* ------------------------------ CAM16 正变换 ------------------------------ */

interface Cam16 { J: number; C: number; h: number }

export function xyzToCam16(v: XYZ, vc = SRGB_VC): Cam16 {
  const rC = 0.401288 * v.x + 0.650173 * v.y - 0.051461 * v.z;
  const gC = -0.250268 * v.x + 1.204414 * v.y + 0.045854 * v.z;
  const bC = -0.002079 * v.x + 0.048952 * v.y + 0.953127 * v.z;

  const rD = vc.rgbD[0] * rC, gD = vc.rgbD[1] * gC, bD = vc.rgbD[2] * bC;

  const adapt = (x: number) => {
    const f = Math.pow((vc.fl * Math.abs(x)) / 100, 0.42);
    return (sign(x) * 400 * f) / (f + 27.13);
  };
  const rA = adapt(rD), gA = adapt(gD), bA = adapt(bD);

  const a = (11 * rA - 12 * gA + bA) / 11;
  const b = (rA + gA - 2 * bA) / 9;
  const u = (20 * rA + 20 * gA + 21 * bA) / 20;
  const p2 = (40 * rA + 20 * gA + bA) / 20;

  let hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (hue < 0) hue += 360;

  const ac = p2 * vc.nbb;
  const J = 100 * Math.pow(ac / vc.aw, vc.c * vc.z);

  const huePrime = hue < 20.14 ? hue + 360 : hue;
  const eHue = 0.25 * (Math.cos((huePrime * Math.PI) / 180 + 2) + 3.8);
  const p1 = ((50000 / 13) * eHue * vc.nc * vc.ncb);
  const t = (p1 * Math.hypot(a, b)) / (u + 0.305);
  const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, vc.n), 0.73);
  const C = alpha * Math.sqrt(J / 100);

  return { J, C, h: hue };
}

/* ------------------------------ CAM16 逆变换 ------------------------------ */

export function cam16ToXyz(J: number, C: number, h: number, vc = SRGB_VC): XYZ {
  const alpha = C === 0 || J === 0 ? 0 : C / Math.sqrt(J / 100);
  const t = Math.pow(alpha / Math.pow(1.64 - Math.pow(0.29, vc.n), 0.73), 1 / 0.9);
  const hRad = (h * Math.PI) / 180;

  const eHue = 0.25 * (Math.cos(hRad + 2) + 3.8);
  const ac = vc.aw * Math.pow(J / 100, 1 / (vc.c * vc.z));
  const p1 = eHue * (50000 / 13) * vc.nc * vc.ncb;
  const p2 = ac / vc.nbb;

  const hSin = Math.sin(hRad), hCos = Math.cos(hRad);
  const gamma = (23 * (p2 + 0.305) * t) / (23 * p1 + 11 * t * hCos + 108 * t * hSin);
  const a = gamma * hCos;
  const b = gamma * hSin;

  const rA = (460 * p2 + 451 * a + 288 * b) / 1403;
  const gA = (460 * p2 - 891 * a - 261 * b) / 1403;
  const bA = (460 * p2 - 220 * a - 6300 * b) / 1403;

  const unadapt = (x: number) => {
    const base = Math.max(0, (27.13 * Math.abs(x)) / (400 - Math.abs(x)));
    return sign(x) * (100 / vc.fl) * Math.pow(base, 1 / 0.42);
  };
  const rF = unadapt(rA) / vc.rgbD[0];
  const gF = unadapt(gA) / vc.rgbD[1];
  const bF = unadapt(bA) / vc.rgbD[2];

  return {
    x: 1.86206786 * rF - 1.01125463 * gF + 0.14918677 * bF,
    y: 0.38752654 * rF + 0.62144744 * gF - 0.00897398 * bF,
    z: -0.0158415 * rF - 0.03412294 * gF + 1.04996444 * bF,
  };
}

/* --------------------------------- HCT ---------------------------------- */

export function rgbToHct(c: RGB): HCT {
  const xyz = rgbToXyz(c);
  const cam = xyzToCam16(xyz);
  return { h: cam.h, c: cam.C, t: lstarFromY(xyz.y) };
}

/** 给定色相与彩度，二分求出 tone 命中目标的 CAM16 明度 J，返回线性 RGB */
function linAtTone(h: number, chroma: number, tone: number): LinRGB | null {
  if (chroma < 1e-6) {
    const y = yFromLstar(tone) / 100;
    return { r: y, g: y, b: y };
  }
  let lo = 0.05, hi = 100, best: LinRGB | null = null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const xyz = cam16ToXyz(mid, chroma, h);
    if (!isFinite(xyz.y)) return null;
    const l = lstarFromY(Math.max(xyz.y, 0));
    best = xyzToLin(xyz);
    if (Math.abs(l - tone) < 1e-4) break;
    if (l < tone) lo = mid; else hi = mid;
  }
  return best;
}

/**
 * HCT → sRGB。彩度先按请求值试，越界则二分降到色域边界。
 * 「深色不发灰」正是靠这一步：暗端总是取到该 tone 下 sRGB 能给出的最大彩度。
 */
export function hctToRgb(h: number, chroma: number, tone: number): { rgb: RGB; chroma: number } {
  const t = clamp(tone, 0, 100);
  if (t <= 0) return { rgb: { r: 0, g: 0, b: 0 }, chroma: 0 };
  if (t >= 100) return { rgb: { r: 255, g: 255, b: 255 }, chroma: 0 };

  const direct = linAtTone(h, chroma, t);
  if (direct && inGamut(direct, 1e-3)) return { rgb: quantize(direct), chroma };

  let lo = 0, hi = Math.max(chroma, 1);
  let bestLin: LinRGB = linAtTone(h, 0, t)!;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const lin = linAtTone(h, mid, t);
    if (lin && inGamut(lin, 1e-3)) { lo = mid; bestLin = lin; } else hi = mid;
  }
  return { rgb: quantize(bestLin), chroma: lo };
}

/** 该 tone / hue 下 sRGB 能达到的最大彩度 */
export function maxChromaAt(h: number, tone: number): number {
  return hctToRgb(h, 200, tone).chroma;
}
