/**
 * extract.ts — 从照片提取主色,并派生候选色调
 *
 * 产品逻辑:上传照片后,系统分析它、挑出主色,再由主色派生一组「有观点」的候选,
 * 每条候选喂给 Task 01 生成十阶色阶供用户选。八个固定色调因此被「从这张照片长出来的
 * 一组候选」取代——照片自己决定色调,而不是让用户从预设里猜。
 *
 * 一个必须交代的产品判断:把照片自己的主色再拿去给这张照片调色,效果几乎为零——
 * 照片本来就是那个色调,用它自己的色阶映射它自己等于没变。真正出效果的是换一个色调。
 * 所以提取的价值不在「给正确答案」,而在「给一个有观点的出发点」:
 *   · 原色    —— 强化照片已有的氛围
 *   · 互补色  —— 冷暖对撞,风光调色最经典的手法(暖橙↔青蓝)
 *   · 邻近色  —— 微调氛围,不推翻原色
 *
 * 算法:降采样后在 OKLab 里做 k-means。
 * 为什么是 OKLab 不是 RGB:RGB 聚类被亮度主导,会把天空的浅蓝深蓝归成一类;
 * OKLab 感知均匀,聚出来的才是人眼认可的「几种主色」。
 */

import { srgbToLinear, linearToSrgb, clamp, toHex, type RGB } from '@palette/color';

/* ------------------------------ OKLab ------------------------------ */

function rgbToOklab(c: RGB): [number, number, number] {
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

function oklabToRgb(L: number, A: number, B: number): RGB {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return {
    r: Math.round(linearToSrgb(clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1))),
    g: Math.round(linearToSrgb(clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0, 1))),
    b: Math.round(linearToSrgb(clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s, 0, 1))),
  };
}

/* ---------------------------- k-means ---------------------------- */

type Lab = [number, number, number];

/** 在 OKLab 里对采样点做 k-means,返回按簇大小排序的中心 */
function kmeans(points: Lab[], k: number, iters = 12): { center: Lab; weight: number }[] {
  if (points.length === 0) return [];
  // k-means++ 初始化:第一个随机,之后每个都尽量远离已选中心
  const centers: Lab[] = [points[(Math.random() * points.length) | 0]];
  while (centers.length < k) {
    let best: Lab = points[0], bestD = -1;
    // 稀疏采样候选,避免 O(n·k) 在大图上过慢
    for (let t = 0; t < 64; t++) {
      const p = points[(Math.random() * points.length) | 0];
      let dmin = Infinity;
      for (const c of centers) dmin = Math.min(dmin, dist2(p, c));
      if (dmin > bestD) { bestD = dmin; best = p; }
    }
    centers.push(best);
  }

  const assign = new Int32Array(points.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < points.length; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(points[i], centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      assign[i] = bi;
    }
    const sum: number[][] = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const s = sum[assign[i]], p = points[i];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sum[c][3] > 0) centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
    }
  }

  const weight = new Array(centers.length).fill(0);
  for (let i = 0; i < points.length; i++) weight[assign[i]]++;
  return centers
    .map((center, i) => ({ center, weight: weight[i] }))
    .sort((a, b) => b.weight - a.weight);
}

const dist2 = (a: Lab, b: Lab) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/* ---------------------------- 提取主色 ---------------------------- */

/**
 * 从 ImageData 提取最主要的主色。
 * 采样时跳过接近黑白灰的像素——它们对"色调"没有贡献,却会主导聚类
 * (天空、雪、阴影往往占最大面积但没有色相)。
 */
export function dominantColor(img: ImageData): RGB {
  const d = img.data;
  const points: Lab[] = [];
  const step = Math.max(1, Math.floor(d.length / 4 / 12000)) * 4; // 最多采 ~12000 点

  for (let i = 0; i < d.length; i += step) {
    const rgb = { r: d[i], g: d[i + 1], b: d[i + 2] };
    const lab = rgbToOklab(rgb);
    const chroma = Math.hypot(lab[1], lab[2]);
    // 太灰(无色相)或太暗太亮的点跳过,它们不代表"色调"
    if (chroma < 0.03) continue;
    if (lab[0] < 0.12 || lab[0] > 0.95) continue;
    points.push(lab);
  }

  if (points.length < 8) {
    // 整张几乎无彩色(雪景、雾、黑白),给一个中性色兜底
    return { r: 120, g: 128, b: 136 };
  }

  const clusters = kmeans(points, 4);
  const c = clusters[0].center;
  return oklabToRgb(c[0], c[1], c[2]);
}

/* --------------------------- 派生候选 --------------------------- */

export interface Candidate {
  name: string;
  hex: string;
  rgb: RGB;
  note: string;
}

/** 把 RGB 的色相旋转 deg 度,饱和度亮度大致保持 */
function rotateHue(rgb: RGB, deg: number): RGB {
  const lab = rgbToOklab(rgb);
  const C = Math.hypot(lab[1], lab[2]);
  let h = Math.atan2(lab[2], lab[1]) + (deg * Math.PI) / 180;
  return oklabToRgb(lab[0], C * Math.cos(h), C * Math.sin(h));
}

/** 提高一个色的彩度,让它更适合当主题主色(照片主色往往偏灰) */
function boost(rgb: RGB, factor = 1.35): RGB {
  const lab = rgbToOklab(rgb);
  return oklabToRgb(lab[0], lab[1] * factor, lab[2] * factor);
}

/**
 * 由照片主色派生一组候选色调。
 * 顺序有意为之:原色在前(强化),互补在后(对撞),邻近夹在中间(微调)。
 */
export function candidatesFrom(img: ImageData): Candidate[] {
  const base = boost(dominantColor(img));
  const warm = rotateHue(base, 20);
  const cool = rotateHue(base, -20);
  const comp = rotateHue(base, 180);

  const list: Array<[string, RGB, string]> = [
    ['原色', base, '强化照片本来的氛围'],
    ['偏暖', warm, '把整体往暖里推一点'],
    ['偏冷', cool, '把整体往冷里收一点'],
    ['互补', comp, '冷暖对撞,风光调色最经典的手法'],
  ];

  return list.map(([name, rgb, note]) => ({ name, rgb, hex: toHex(rgb), note }));
}
