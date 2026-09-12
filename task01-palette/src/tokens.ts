/**
 * tokens.ts — 把色阶导出成 TDesign 的 Design Token
 *
 * TDesign 的色彩体系是两层：
 *   数字 token —— --td-brand-color-1..10、--td-gray-color-1..14，就是色阶本身
 *   语义 token —— --td-brand-color、--td-bg-color-page、--td-border-level-1-color 等，
 *                 它们的值是 var(--td-数字-token)，指向上面那一层
 *
 * 所以**只需要覆盖数字 token**，语义 token 会自动跟着变，不用手动映射。
 * 这是从 tdesign-common/style/web/theme/_light.less 读出来的，不是猜的。
 *
 * 两处例外，用的时候要知道：
 *   · 文字颜色走 --td-font-gray-1..4，是黑色加透明度，不走灰阶。
 *     换中性色阶不会改变文字颜色——这既是限制，也保证了文字对比度不会被搞坏。
 *   · --td-bg-color-container 在浅色主题下硬编码为 #fff，不走灰阶。
 *     所以页面底会跟着我们的灰阶走，卡片底仍是纯白。这个层次关系是 TDesign 有意为之。
 *
 * 顺带记一条：--td-brand-color 指向的是第 7 阶。
 * 网上流传的文章有说第 8 阶的，那是 2022 年的旧版本，现在的源码是 7。
 */

import { Palette } from './palette';

export interface TokenOptions {
  /** 变量前缀，默认 `td`。改成别的就是给自己的设计系统用 */
  prefix?: string;
  /** CSS 选择器。不传则按 palette 的模式取：浅色 `:root`，深色 `:root[theme-mode='dark']` */
  selector?: string;
}

const DEFAULT_PREFIX = 'td';

function selectorFor(p: Palette, opts?: TokenOptions): string {
  if (opts?.selector) return opts.selector;
  return p.mode === 'dark' ? ":root[theme-mode='dark']" : ':root';
}

/**
 * 导出成键值对。键不带 `--` 前缀之外的任何修饰，值是 `#RRGGBB`。
 *
 * ```
 * { '--td-brand-color-1': '#F6F5FF', …, '--td-gray-color-14': '#1D1D21' }
 * ```
 */
export function toTokenJson(p: Palette, opts?: TokenOptions): Record<string, string> {
  const prefix = opts?.prefix ?? DEFAULT_PREFIX;
  const out: Record<string, string> = {};
  p.brand.forEach((s) => { out[`--${prefix}-brand-color-${s.index}`] = s.hex; });
  p.neutral.forEach((s) => { out[`--${prefix}-gray-color-${s.index}`] = s.hex; });
  return out;
}

/**
 * 导出成可以直接写进 `.css` 文件的文本。
 *
 * ```css
 * :root {
 *   --td-brand-color-1: #F6F5FF;
 *   …
 * }
 * ```
 */
export function toCssVariables(p: Palette, opts?: TokenOptions): string {
  const body = Object.entries(toTokenJson(p, opts))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `${selectorFor(p, opts)} {\n${body}\n}\n`;
}

/**
 * 运行时直接写到 DOM 上，整站立刻换肤。这是 Task 02 用的那个。
 *
 * 深色模式会同时把 `theme-mode="dark"` 写到元素上——TDesign 的深色主题样式
 * 是挂在 `:root[theme-mode='dark']` 上的，不设这个属性，组件不会切到深色。
 *
 * @param el 默认 `document.documentElement`
 */
export function applyTokens(p: Palette, el?: HTMLElement, opts?: TokenOptions): void {
  const target = el ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) throw new Error('applyTokens 需要一个 DOM 元素；在 Node 里请改用 toCssVariables');

  const tokens = toTokenJson(p, opts);
  for (const [k, v] of Object.entries(tokens)) target.style.setProperty(k, v);

  if (p.mode === 'dark') target.setAttribute('theme-mode', 'dark');
  else target.removeAttribute('theme-mode');
}

/** 撤销 applyTokens 写入的所有变量 */
export function clearTokens(el?: HTMLElement, opts?: TokenOptions): void {
  const target = el ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) return;
  const prefix = opts?.prefix ?? DEFAULT_PREFIX;
  for (let i = 1; i <= 10; i++) target.style.removeProperty(`--${prefix}-brand-color-${i}`);
  for (let i = 1; i <= 14; i++) target.style.removeProperty(`--${prefix}-gray-color-${i}`);
  target.removeAttribute('theme-mode');
}
