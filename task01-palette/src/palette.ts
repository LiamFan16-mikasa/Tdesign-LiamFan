/**
 * palette.ts — 色阶生成
 *
 * 输入任意主色，输出品牌色阶 10 阶 + 中性色阶 14 阶，浅色 / 深色各一套。
 * 零依赖，不碰 DOM，可以直接拷进任何项目。
 *
 * 设计取舍的完整说明在 docs/design.md，这里只记与代码贴身的几条：
 *   · 色相全程锁死，十阶共用输入主色的 CAM16 色相
 *   · 明度台阶是钟形步长（浅端密、中段疏、深端回落），不是等距
 *   · 主色按自己的 L* 落位，不硬塞进固定阶
 *   · 彩度先给足再逐阶裁到 sRGB 色域边界，不设全局上限
 */

import { RGB, parseColor, toHex, clamp } from './color';
import { rgbToHct, hctToRgb, HCT } from './hct';

export type Mode = 'light' | 'dark';

export interface Swatch {
  /** 1–10（浅色阶越大越深；深色阶越大越浅，与 TDesign 约定一致） */
  index: number;
  hex: string;
  rgb: RGB;
  /** CIELab L*，即 HCT 的 tone */
  tone: number;
  /** CAM16 彩度，裁到色域之后的实际值 */
  chroma: number;
}

export interface Palette {
  brand: Swatch[];      // 10 阶
  neutral: Swatch[];    // 14 阶
  /** 输入主色落在品牌色阶的第几阶 */
  anchorIndex: number;
  /**
   * 锚点那一阶实际使用的 L*。正常情况下等于 `input.t`；
   * 纯白纯黑会被夹到 [3, 97]，否则色阶会退化成一整条白或一整条黑。
   */
  anchorTone: number;
  input: { hex: string; h: number; c: number; t: number };
  mode: Mode;
}

/* ------------------------------ 台阶与参数 ------------------------------ */

/**
 * 参考明度台阶。相邻差值是一条平缓的钟形：
 *
 *   ΔL*  6.3  9.1  9.7  10.3  10.6  10.4  9.8  9.4  8.3      起伏 1.7 倍
 *
 * 纸白端步长略小（页面底、hover 底、选中底挤在这一段），中段最大，墨黑端回落。
 * 一路单调增大的曲线会让锚点两侧的步长对不上，接缝处出现断层。
 *
 * 这组数值是**对着 TDesign 官方色阶反推出来的**，不是我们自己推导的。
 * 依据是官方 brand / warning / error 三套色阶的实际 L* 分布几乎完全一致
 * （起伏都是 1.6–1.7 倍），三个不同色相独立调出同一个形状，说明它是通用规律
 * 而不是某个色相的特例。用这条台阶生成的色阶与官方手工调校的结果平均 ΔEab 1.93。
 *
 * 我们最初自己推导的版本是 [97, 93, 85.5, 75, 63, 51, 40, 30.5, 21.8, 14]，
 * 起伏 3.0 倍，浅端过密——最浅两阶都是「几乎白」，浪费了一个名额。
 * 详见 docs/design.md 第三节。
 */
const REF_LIGHT = [96.1, 89.8, 80.7, 70.9, 60.6, 50.1, 39.7, 29.8, 20.5, 12.1];

/**
 * 深色模式不是把浅色台阶反过来用。反转只能换方向，换不了形状：
 * 钟形序列倒过来还是钟形，最小的那一步仍然留在浅色端——而深色模式最需要
 * 密集台阶的地方在暗端（页面底 / 卡片底 / 悬浮层要能分层）。
 *
 * 所以这里用的是**同一条步长曲线，从暗端起铺**，再压缩到 12–93 区间：
 * 最小的那一步落在最暗处，往上逐渐拉开，顶端再回落。
 *
 * 官方深色色板的色值没能检索到，所以这一条是我们自己的推导，
 * 只是让它和浅色台阶共用同一个形状，而不是另拍一组数。
 */
const REF_DARK = [12, 18.1, 26.9, 36.3, 46.2, 56.4, 66.5, 76, 85.1, 93];

const NEUTRAL_LIGHT = [98.5, 96.5, 94, 91, 87, 82, 75, 67, 58, 49, 40, 30, 20, 11];
const NEUTRAL_DARK = [7, 11, 15, 19, 24, 30, 37, 45, 53, 62, 71, 80, 89, 96];

export const CONFIG = {
  /**
   * 浅端彩度衰减指数。越小，最浅几阶越「有颜色」而不发白。
   * 0.35 是对着官方四套色阶（brand / warning / error / success）拟合出来的通用值：
   * 四套的平均 ΔEab 都在 2.5 以内，没有一套被牺牲。
   * 只对着蓝色调参数会得到 0.15——蓝色能压到 0.90，但绿色会炸到 4.14，那是过拟合。
   */
  tintChromaExp: 0.35,
  /**
   * 中性色阶的 CAM16 彩度。取 4 是全色相通用的安全值：
   * 蓝色到 10 还读作灰，绿色到 7 就开始泛青，4 在任何色相上都不抢戏。
   */
  neutralChroma: 4,
  /**
   * 输入彩度低于此值视为中性输入，整套色阶退回纯灰。
   * 纯灰在 CAM16 里色相是未定义的（atan2(0,0) 返回 0，也就是红），
   * 不做这个判断，灰色输入会生成一套带粉调的色阶。
   */
  grayThreshold: 3,
};

/* -------------------------------- 台阶 -------------------------------- */

/** 输入主色的 L* 离哪一阶最近，它就属于那一阶 */
function pickAnchorIndex(tone: number, ref: number[]): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < ref.length; i++) {
    const d = Math.abs(ref[i] - tone);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best + 1;
}

/**
 * 把参考台阶整体拉伸，使第 anchorIndex 阶精确落在主色的 L* 上，两端固定不动。
 * 因为锚点取的是最近的一阶，两侧缩放比只差几个百分点，接缝处的步长跳变可以忽略。
 */
function toneLadder(ref: number[], anchorIndex: number, anchor: number): number[] {
  const k = anchorIndex - 1;
  const last = ref.length - 1;
  const rk = ref[k];
  const upScale = k === 0 ? 1 : (anchor - ref[0]) / (rk - ref[0]);
  const dnScale = k === last ? 1 : (ref[last] - anchor) / (ref[last] - rk);
  return ref.map((r, i) => {
    if (i === k) return anchor;
    return i < k ? ref[0] + (r - ref[0]) * upScale : ref[last] + (r - ref[last]) * dnScale;
  });
}

/**
 * 彩度曲线。
 * 比锚点浅的一侧按到白端的剩余距离衰减 —— 越接近纸白，sRGB 能容纳的彩度越少，
 * 硬要就会被裁得莫名其妙，主动衰减反而更可控，也正好避开「浅色发飘」。
 * 比锚点深的一侧保持主色彩度不动 —— 深端本就贴着色域边界，交给逐阶裁即可，
 * 每一阶都会拿到该明度下 sRGB 能给出的最大彩度，这是「深色不发灰」的关键。
 */
function chromaAt(baseC: number, tone: number, anchor: number): number {
  if (tone <= anchor) return baseC;
  const r = (100 - tone) / Math.max(100 - anchor, 1e-6);
  return baseC * Math.pow(clamp(r, 0, 1), CONFIG.tintChromaExp);
}

/* -------------------------------- 组装 -------------------------------- */

function toSwatches(colors: RGB[]): Swatch[] {
  return colors.map((rgb, i) => {
    const h = rgbToHct(rgb);
    return { index: i + 1, hex: toHex(rgb), rgb, tone: h.t, chroma: h.c };
  });
}

function buildBrand(base: HCT, tones: number[], anchor: number): RGB[] {
  const gray = base.c < CONFIG.grayThreshold;
  return tones.map((t) => hctToRgb(base.h, gray ? 0 : chromaAt(base.c, t, anchor), t).rgb);
}

/** 中性色阶：主色色相不变，彩度压到一个固定的低值，按明度铺 14 阶 */
function buildNeutral(base: HCT, mode: Mode): RGB[] {
  const tones = mode === 'light' ? NEUTRAL_LIGHT : NEUTRAL_DARK;
  const c = base.c < CONFIG.grayThreshold ? 0 : CONFIG.neutralChroma;
  return tones.map((t) => hctToRgb(base.h, c, t).rgb);
}

/* -------------------------------- 主入口 -------------------------------- */

/**
 * 生成一整套色阶。
 *
 * @param input 主色。接受 `#0052D9`、`0052D9`、`rgb(0,82,217)`、`hsl(220 100% 43%)`
 * @param mode  `light`（默认）或 `dark`
 * @returns 解析失败时返回 `null`，不抛异常
 */
export function generatePalette(input: string, mode: Mode = 'light'): Palette | null {
  const rgb = parseColor(input);
  if (!rgb) return null;

  const base = rgbToHct(rgb);
  const ref = mode === 'light' ? REF_LIGHT : REF_DARK;
  const anchorTone = clamp(base.t, 3, 97);
  const anchorIndex = pickAnchorIndex(anchorTone, ref);
  const tones = toneLadder(ref, anchorIndex, anchorTone);

  return {
    brand: toSwatches(buildBrand(base, tones, anchorTone)),
    neutral: toSwatches(buildNeutral(base, mode)),
    anchorIndex,
    anchorTone,
    input: { hex: toHex(rgb), h: base.h, c: base.c, t: base.t },
    mode,
  };
}

export { parseColor, toHex };
