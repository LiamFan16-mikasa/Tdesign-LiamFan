/**
 * app.ts — 界面层
 *
 * 只做三件事：读输入、调生成器、把色阶画成打样条。
 * 色觉模拟是纯展示变换，接在渲染的最后一步，不参与任何被复制出去的值。
 */

import { generatePalette, Palette, Mode, Swatch } from './palette';
import { parseColor, toHex, rgbToLin, RGB } from './color';
import { simulate, CvdType, CVD_LABELS } from './cvd';

const PRESETS = ['#0052D9', '#E34D59', '#ED7B2F', '#00A870', '#7B4FD9', '#0594FA'];

interface State { input: string; mode: Mode; cvd: CvdType }
const state: State = { input: '#0052D9', mode: 'light', cvd: 'none' };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** 在这个底色上，白字和黑字哪个更清楚 */
function readableInk(rgb: RGB): string {
  const l = rgbToLin(rgb);
  const y = 0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b;
  return (y + 0.05) / 0.05 >= 1.05 / (y + 0.05) ? '#000000' : '#FFFFFF';
}

/* ------------------------------- 渲染 ------------------------------- */

function renderStrip(host: HTMLElement, swatches: Swatch[], label: string) {
  const cells = swatches.map((s) => {
    const shown = simulate(s.rgb, state.cvd);
    const hex = toHex(shown);
    return `<button class="seg-cell" role="listitem" data-copy="${s.hex}"
              style="--c:${hex};--fg:${readableInk(shown)}"
              aria-label="${label}第 ${s.index} 阶 ${s.hex}，点击复制">
              <span class="val">${s.hex}</span>
            </button>`;
  });
  host.innerHTML = cells.join('');
}

function renderCaption(p: Palette) {
  const dir = p.mode === 'light' ? '1 → 10 由浅到深' : '1 → 10 由深到浅';
  $('caption').innerHTML = [
    `主色落在第 <b>${p.anchorIndex}</b> 阶`,
    `L* <b>${p.input.t.toFixed(1)}</b>`,
    `色相 <b>${p.input.h.toFixed(0)}°</b>`,
    `<b>${dir}</b>`,
    `点击任一段复制色值`,
  ].map((x) => `<span>${x}</span>`).join('');
}

function render() {
  const p = generatePalette(state.input, state.mode);
  const entry = $('entry');
  const hint = $('hint');

  if (!p) {
    entry.classList.add('bad');
    hint.textContent = '认不出这个颜色。试试 #0052D9、rgb(0,82,217) 或 hsl(220 100% 43%)。';
    return;
  }
  entry.classList.remove('bad');
  hint.textContent = '';

  renderStrip($('brand'), p.brand, '品牌色阶');
  renderStrip($('neutral'), p.neutral, '中性色阶');
  renderCaption(p);

  $('pick').style.setProperty('--sw', p.input.hex);
  document.documentElement.setAttribute('data-mode', state.mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.mode === 'light' ? '#E9ECEE' : '#111417');
}

/* ------------------------------- 复制 ------------------------------- */

let toastTimer = 0;
function toast(msg: string) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('on'), 1500);
}

function copy(text: string) {
  const ok = () => toast(`已复制 ${text}`);
  const manual = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); ok(); } catch { toast(text); }
    ta.remove();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, manual);
  else manual();
}

/* ------------------------------- 装配 ------------------------------- */

function pressGroup(host: HTMLElement, key: string, value: string) {
  host.querySelectorAll<HTMLButtonElement>(`[data-${key}]`).forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset[key] === value))
  );
}

function init() {
  const input = $<HTMLInputElement>('hex');
  input.value = state.input;

  $('presets').innerHTML = PRESETS.map(
    (h) => `<button data-set="${h}" style="background:${h}" title="${h}" aria-label="使用 ${h}"></button>`
  ).join('');

  $('cvd').innerHTML = (Object.keys(CVD_LABELS) as CvdType[])
    .map((k) => `<button data-cvd="${k}" aria-pressed="${k === 'none'}">${CVD_LABELS[k]}</button>`)
    .join('');

  input.addEventListener('input', () => {
    state.input = input.value;
    render();
  });

  // 系统取色器：藏起来的原生 input，由色块代为触发
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
  document.body.appendChild(picker);
  picker.addEventListener('input', () => {
    state.input = picker.value.toUpperCase();
    input.value = state.input;
    render();
  });
  $('pick').addEventListener('click', () => {
    const rgb = parseColor(state.input);
    picker.value = rgb ? toHex(rgb).toLowerCase() : '#0052d9';
    picker.click();
  });

  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-copy],[data-set],[data-mode],[data-cvd]');
    if (!el) return;
    if (el.dataset.copy) copy(el.dataset.copy);
    else if (el.dataset.set) {
      state.input = el.dataset.set;
      input.value = state.input;
      render();
    } else if (el.dataset.mode) {
      state.mode = el.dataset.mode as Mode;
      pressGroup(document.body, 'mode', state.mode);
      render();
    } else if (el.dataset.cvd) {
      state.cvd = el.dataset.cvd as CvdType;
      pressGroup($('cvd'), 'cvd', state.cvd);
      render();
    }
  });

  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
