/**
 * color.ts — 色彩空间基础件
 *
 * 只保留这个项目真正用得到的部分：
 *   输入解析（hex / rgb() / hsl()）
 *   sRGB ↔ 线性光 ↔ CIE XYZ(D65)
 *   Y ↔ L*    —— L* 是 HCT 的 tone 分量，色阶的明度台阶就铺在它上面
 *   色域判定  —— 「深色不发灰」靠的是逐阶裁到这条边界
 */

export interface RGB { r: number; g: number; b: number }   // 0–255
export interface LinRGB { r: number; g: number; b: number } // 0–1，线性光
export interface XYZ { x: number; y: number; z: number }    // 0–100，D65

export const D65: XYZ = { x: 95.047, y: 100.0, z: 108.883 };

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const sign = (v: number) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/* ------------------------------- 输入解析 ------------------------------- */

const hexToRgb = (s: string): RGB | null => {
  let h = s.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const num = String.raw`(-?[\d.]+)\s*%?`;
const RE_RGB = new RegExp(`^rgba?\\(\\s*${num}[\\s,]+${num}[\\s,]+${num}`, 'i');
const RE_HSL = new RegExp(`^hsla?\\(\\s*${num}(?:deg)?[\\s,]+${num}[\\s,]+${num}`, 'i');

function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg: [number, number, number] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return {
    r: Math.round((seg[0] + m) * 255),
    g: Math.round((seg[1] + m) * 255),
    b: Math.round((seg[2] + m) * 255),
  };
}

/**
 * 解析用户输入。接受 `#0052D9`、`0052D9`、`rgb(0,82,217)`、`hsl(220 100% 43%)`。
 * 解析不出来返回 null —— 调用方据此决定是否把输入框标红，不抛异常。
 */
export function parseColor(input: string): RGB | null {
  const s = input.trim();
  if (!s) return null;

  const hex = hexToRgb(s);
  if (hex) return hex;

  const rgb = RE_RGB.exec(s);
  if (rgb) {
    const v = [rgb[1], rgb[2], rgb[3]].map((x, i) =>
      s.includes('%') ? (parseFloat(x) / 100) * 255 : parseFloat(x)
    );
    if (v.some(isNaN)) return null;
    return { r: clamp(Math.round(v[0]), 0, 255), g: clamp(Math.round(v[1]), 0, 255), b: clamp(Math.round(v[2]), 0, 255) };
  }

  const hsl = RE_HSL.exec(s);
  if (hsl) {
    const h = parseFloat(hsl[1]), sa = parseFloat(hsl[2]), l = parseFloat(hsl[3]);
    if ([h, sa, l].some(isNaN)) return null;
    return hslToRgb(h, sa / 100, l / 100);
  }

  return null;
}

export function toHex({ r, g, b }: RGB): string {
  const h = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/* ------------------------------ 传输函数 ------------------------------ */

export const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.040449936 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

export const linearToSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
};

export const rgbToLin = (c: RGB): LinRGB => ({
  r: srgbToLinear(c.r), g: srgbToLinear(c.g), b: srgbToLinear(c.b),
});

export const linToRgb = (c: LinRGB): RGB => ({
  r: linearToSrgb(c.r), g: linearToSrgb(c.g), b: linearToSrgb(c.b),
});

/** 把线性光量化回 0–255 整数，越界的分量先夹住 */
export const quantize = (lin: LinRGB): RGB => {
  const c = linToRgb({ r: clamp(lin.r, 0, 1), g: clamp(lin.g, 0, 1), b: clamp(lin.b, 0, 1) });
  return { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) };
};

/** 线性 RGB 是否落在 sRGB 色域内。留一点容差，避免二分在边界上抖 */
export const inGamut = (c: LinRGB, eps = 1e-3): boolean =>
  c.r >= -eps && c.r <= 1 + eps && c.g >= -eps && c.g <= 1 + eps && c.b >= -eps && c.b <= 1 + eps;

/* --------------------------------- XYZ --------------------------------- */

export const linToXyz = (c: LinRGB): XYZ => ({
  x: (0.41233895 * c.r + 0.35762064 * c.g + 0.18051042 * c.b) * 100,
  y: (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * 100,
  z: (0.01932141 * c.r + 0.11916382 * c.g + 0.95034478 * c.b) * 100,
});

export const xyzToLin = (v: XYZ): LinRGB => {
  const x = v.x / 100, y = v.y / 100, z = v.z / 100;
  return {
    r: 3.2413774792388685 * x - 1.5376652402851851 * y - 0.49885366846268053 * z,
    g: -0.9691452513005321 * x + 1.8758853451067872 * y + 0.04156585616912061 * z,
    b: 0.05562093689691305 * x - 0.20395524564742123 * y + 1.0571799111220335 * z,
  };
};

export const rgbToXyz = (c: RGB) => linToXyz(rgbToLin(c));

/* -------------------------------- 明度 L* -------------------------------- */

const E = 216 / 24389, K = 24389 / 27;

/** Y(0–100) → L*。这就是 HCT 的 tone。 */
export const lstarFromY = (y: number): number => {
  const t = y / 100;
  return t > E ? 116 * Math.cbrt(t) - 16 : K * t;
};

/** L* → Y(0–100) */
export const yFromLstar = (l: number): number => {
  const f = (l + 16) / 116;
  return 100 * (f * f * f > E ? f * f * f : (116 * f - 16) / K);
};
