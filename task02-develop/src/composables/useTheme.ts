/**
 * useTheme.ts — 把 Task 01 的色阶接进 TDesign
 *
 * 换肤的全部机制就这么点：
 *   generatePalette(主色, 模式) → applyTokens() 写 24 个 CSS 变量到 :root
 *
 * 不需要手动映射语义 token。TDesign 的 --td-brand-color、--td-bg-color-page、
 * --td-component-stroke 这些的值都是 var(--td-数字-token)，覆盖数字层，语义层自动跟着变。
 * 深色模式还要把 theme-mode="dark" 写到根元素上，applyTokens 里一并做了。
 */

import { ref, watchEffect } from 'vue';
import { generatePalette, type Palette, type Mode } from '@palette/palette';
import { applyTokens } from '@palette/tokens';
import { parseColor, rgbToLin, type RGB } from '@palette/color';

const STORAGE_KEY = 'xianyingtai:theme';

/** 没有照片时的默认主色,用产品品牌青。有照片后会被提取的候选覆盖。 */
const DEFAULT_HUE = '#0E7C86';

export function useTheme() {
  const raw = ref(DEFAULT_HUE);
  const mode = ref<Mode>('light');

  // 恢复上次的选择
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const v = JSON.parse(saved);
      if (typeof v.raw === 'string') raw.value = v.raw;
      // 顶栏的浅/深色切换已移除，站点固定浅色，不再恢复历史选择
    }
  } catch { /* 读不到就用默认值 */ }

  const palette = ref<Palette | null>(generatePalette(raw.value, mode.value));

  /**
   * 当前输入的主色能不能解析。
   *
   * 不能写成 computed(() => palette.value !== null):输入非法时 palette 会刻意保留上一套色阶,
   * 永远不会回到 null,于是 valid 除了启动那一刻恒为真——输入框从不标红,
   * 色值选择器还会被喂进乱码。所以要在每次生成时单独记下这次的结果。
   */
  const valid = ref(palette.value !== null);

  watchEffect(() => {
    const p = generatePalette(raw.value, mode.value);
    valid.value = p !== null;
    // 输入不合法时保留上一套色阶，不要让整站闪成默认色
    if (!p) return;
    palette.value = p;
    applyTokens(p);
    // 页面底色随色阶变,浏览器 UI 的配色也跟上(移动端地址栏、PWA 标题栏)。
    // --td-bg-color-page 指向中性色第 2 阶,和 checkContrast 里取的是同一个。
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.neutral[1].hex);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ raw: raw.value, mode: mode.value }));
    } catch { /* 隐私模式下写不了，无所谓 */ }
  });

  return { raw, mode, palette, valid };
}

/* ------------------------- 对比度自检 ------------------------- */

function luminance(c: RGB): number {
  const l = rgbToLin(c);
  return 0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b;
}

/** 把 rgba 文字色按 alpha 合成到背景上，再算对比度 */
function composite(fg: RGB, alpha: number, bg: RGB): RGB {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}

function ratio(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export interface ContrastCheck {
  label: string;
  value: number;
  need: number;
  pass: boolean;
}

/**
 * 检查几组关键的前景/背景组合。
 *
 * 这一步不是装饰。Phase 1 的完成标准是「没有一处文字对比度不足」——
 * 靠肉眼扫一遍不算数，尤其深色模式下的边界情况。
 *
 * TDesign 的文字色不走灰阶，走 --td-font-gray-1..4 / --td-font-white-1..4，
 * 是黑白加透明度，所以这里要先按 alpha 合成再算。
 */
export function checkContrast(p: Palette): ContrastCheck[] {
  const dark = p.mode === 'dark';
  const brand = p.brand;
  const gray = p.neutral;

  const white: RGB = { r: 255, g: 255, b: 255 };
  const black: RGB = { r: 0, g: 0, b: 0 };

  // --td-bg-color-page 指向 gray-2；container 浅色下硬编码 #fff，深色下走 gray-2
  const page = gray[1].rgb;
  const container = dark ? gray[1].rgb : white;

  // 文字色：浅色主题是黑色 90% / 60%，深色主题是白色 90% / 55%
  const textBase = dark ? white : black;
  const primaryA = 0.9;
  const secondaryA = dark ? 0.55 : 0.6;

  const brandToken = brand[6].rgb;            // --td-brand-color 指向第 7 阶
  const btnText = dark ? black : white;       // 主按钮上的文字

  const checks: Array<[string, RGB, RGB, number]> = [
    ['正文 / 页面底', composite(textBase, primaryA, page), page, 4.5],
    ['正文 / 容器底', composite(textBase, primaryA, container), container, 4.5],
    ['次要文字 / 容器底', composite(textBase, secondaryA, container), container, 4.5],
    ['主按钮文字 / 主色', btnText, brandToken, 4.5],
    ['品牌文字 / 容器底', brand[6].rgb, container, 4.5],
    ['分隔线 / 容器底', gray[2].rgb, container, 1.2],
  ];

  return checks.map(([label, fg, bg, need]) => {
    const value = ratio(fg, bg);
    return { label, value, need, pass: value >= need };
  });
}

export { parseColor };
