/**
 * 生产构建样式验收:打包后 TDesign 的全局 token 与组件样式是否真的生效。
 * 这个 bug 在 dev 下看不出来(dev 会预打包整个库),只能对着构建产物测。
 *   npm run build && npx vite preview,另开终端 npm run e2e:preview
 *   npm run e2e:live                              部署后测线上
 *   node e2e/prodcheck.cjs <地址>                  测任意地址
 */
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || process.env.BASE || 'http://localhost:4173/Tdesign-LiamFan/task02-develop/dist/';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const bad = [];
  p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await p.goto(BASE + '#studio', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const clear = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    const q = (s) => document.querySelector(s);
    const bg = (s) => (q(s) ? getComputedStyle(q(s)).backgroundColor : 'rgba(0, 0, 0, 0)');
    const body = getComputedStyle(document.body).backgroundColor;
    const rail = q('.t-slider__rail');
    // TDesign 下拉框的箭头是 svg.t-fake-arrow,不是 .t-icon;
    // 之前查 .t-icon 拿到的是隐藏对话框里的关闭按钮(0x0),dev 和生产都会误报
    const arrow = q('.t-select__wrap .t-fake-arrow') || q('.t-fake-arrow');
    return {
      '根元素定义了 --td-brand-color': !!getComputedStyle(document.documentElement).getPropertyValue('--td-brand-color').trim(),
      '页面底色由色阶驱动(非透明、非纯白)': !clear(body) && body !== 'rgb(255, 255, 255)',
      '主按钮有背景色': !clear(bg('.t-button--theme-primary')),
      '选中的区间预设有背景色': !clear(bg('.chip.on')),
      '滑块轨道可见': !!rail && rail.getBoundingClientRect().height > 0,
      '下拉框箭头可见': !!arrow && arrow.getBoundingClientRect().width > 0,
    };
  });
  let ok = true;
  for (const [k, v] of Object.entries(r)) { console.log((v ? '✓ ' : '✗ ') + k); ok = ok && v; }
  console.log('HTTP>=400:', bad.length ? bad.join(' | ') : '无');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
