/**
 * 显影台端到端功能验证。
 * 覆盖「浏览器全量验证」清单里不需要人眼判断的部分:流程能不能走通、数据能不能存住、URL 与键盘通路。
 * 观感(好不好看、参数合不合适)仍需人来看。
 *
 *   npm run dev,另开终端 npm run e2e        测本地开发服务器(5173)
 *   npm run build && npx vite preview,另开终端 npm run e2e:preview   测生产构建
 *   npm run e2e:live                         部署后测 GitHub Pages 线上
 *   node e2e/run.cjs <地址>                   测任意地址
 *
 * 依赖本机 Chrome(CHROME 环境变量可改路径);测试照片默认取 Windows 自带壁纸(PHOTO 可改)。
 * 截图与报告写到 e2e/out/(OUT 可改),已被 .gitignore 忽略。
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || process.env.BASE || 'http://localhost:5173/';
// 用系统自带的壁纸当测试照片,挑第一张存在的
const PHOTO = process.env.PHOTO || [
  'C:/Windows/Web/Wallpaper/Lenovo/2.jpg',
  'C:/Windows/Web/Wallpaper/Lenovo/3.jpg',
  'C:/Windows/Web/Wallpaper/Lenovo/LenovoWallPaper.jpg',
  'C:/Windows/Web/4K/Wallpaper/Windows/img0_1920x1200.jpg',
].find((f) => fs.existsSync(f));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, process.env.OUT || 'out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
async function step(name, fn) {
  try {
    const note = await fn();
    results.push(['PASS', name, note || '']);
  } catch (e) {
    results.push(['FAIL', name, String((e && e.message) || e).split('\n')[0].slice(0, 200)]);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

  const toast = (text) => page.locator('.t-message', { hasText: text }).first().waitFor({ timeout: 8000 });
  const activeTab = async () => (await page.locator('nav.tabs a.on').textContent()).trim();
  const reading = async (label) => (await page.locator('.grp-h', { hasText: label }).locator('.grp-v').textContent()).trim();
  const go = async (hash) => {
    await page.locator(`nav.tabs a[href="#${hash}"]`).click();
    await page.waitForFunction((h) => location.hash === '#' + h, hash);
  };
  const closeDrawer = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const btn = page.locator('.t-drawer--open .t-drawer__close-btn');
    if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(400); }
  };

  /* ───────────── 调色台 ───────────── */

  await step('打开首页,默认在调色台', async () => {
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      try { await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 }); ok = true; }
      catch { await page.waitForTimeout(1000); }
    }
    assert(ok, '页面打不开');
    assert((await page.locator('h1').textContent()).trim() === '显影台', 'h1 不对');
    assert((await activeTab()).startsWith('调色台'), '默认面板是 ' + (await activeTab()));
  });

  await step('跳过导航链接:聚焦 main 且不改 URL', async () => {
    await page.keyboard.press('Tab');
    // Chromium 刚加载完的页面,第一次 Tab 可能先落在 body 上(自动化环境的怪癖,真人按 Tab 不会)
    if (await page.evaluate(() => document.activeElement === document.body)) await page.keyboard.press('Tab');
    const first = await page.evaluate(() => {
      const e = document.activeElement;
      return { skip: !!e?.classList.contains('skip'), desc: e ? `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}` : 'null' };
    });
    assert(first.skip, '第一个 Tab 落在 ' + first.desc);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => ({ id: document.activeElement?.id, hash: location.hash }));
    assert(s.id === 'main', '焦点落在 ' + s.id);
    assert(s.hash === '' || s.hash === '#studio', 'URL 被改成 ' + s.hash);
  });

  await step('只用键盘能到达上传控件', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    for (let i = 1; i <= 20; i++) {
      await page.keyboard.press('Tab');
      const hit = await page.evaluate(() => document.activeElement?.matches('.drop input[type=file]'));
      if (hit) {
        const ring = await page.locator('.drop').evaluate((el) => getComputedStyle(el).outlineStyle);
        assert(ring !== 'none', '聚焦时上传区没有焦点框');
        return `第 ${i} 次 Tab 到达,有焦点框`;
      }
    }
    throw new Error('20 次 Tab 内到不了上传控件');
  });

  await step('上传照片,出现候选色调', async () => {
    await page.locator('.drop input[type=file]').setInputFiles(PHOTO);
    await page.locator('canvas.shot').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('.tones .tone').first().waitFor({ timeout: 15000 });
    const n = await page.locator('.tones .tone').count();
    return `${n} 条候选;${await page.locator('.readout').getAttribute('aria-label')}`;
  });

  await step('切换候选色调,画布描述随之更新', async () => {
    const tones = page.locator('.tones .tone');
    const target = tones.nth(Math.min(1, (await tones.count()) - 1));
    const before = await page.locator('canvas.shot').getAttribute('aria-label');
    await target.click();
    await page.waitForTimeout(300);
    assert(await target.evaluate((el) => el.classList.contains('on')), '点击后没有选中');
    const after = await page.locator('canvas.shot').getAttribute('aria-label');
    assert(after !== before, '画布描述没变');
    return after;
  });

  await step('区间预设「褪色」→ 4–8,刻度压暗 5 阶', async () => {
    await page.locator('.chips .chip', { hasText: '褪色' }).click();
    const v = await reading('映射区间');
    assert(v === '4–8', '读数是 ' + v);
    // 4–8 含 5 阶,区间外是 1 2 3 9 10,共 5 阶
    const off = await page.locator('.scale-bar .tick.off').count();
    assert(off === 5, '压暗台阶 ' + off);
  });

  await step('色值框输入非法值时标红,改回后恢复', async () => {
    const hex = page.locator('input.hex');
    const orig = await hex.inputValue();
    await hex.fill('zzz');
    assert((await hex.getAttribute('aria-invalid')) === 'true', '非法值没有 aria-invalid');
    await hex.fill(orig);
    assert((await hex.getAttribute('aria-invalid')) === null, '恢复后仍标红');
  });

  await step('键盘按住「看原图」:强度临时归零,松开恢复', async () => {
    const btn = page.locator('.stage-foot button.ghost');
    const s0 = await reading('强度');
    await btn.focus();
    await page.keyboard.down(' ');
    const during = (await btn.textContent()).trim();
    const sDuring = await reading('强度');
    await page.keyboard.up(' ');
    const after = (await btn.textContent()).trim();
    const s1 = await reading('强度');
    assert(during === '原图' && sDuring === '0', `按下时 ${during} / 强度 ${sDuring}`);
    assert(after === '按住看原图' && s1 === s0, `松开后 ${after} / 强度 ${s1}`);
  });

  await page.screenshot({ path: path.join(OUT, 'studio-photo.png') });

  await step('存入作品集,导航角标变 1', async () => {
    await page.getByRole('button', { name: '存入作品集' }).click();
    await toast('已存入作品集');
    const badge = (await page.locator('nav.tabs a[href="#gallery"] .count').textContent()).trim();
    assert(badge === '1', '角标 ' + badge);
  });

  await step('存为预设', async () => {
    await page.getByRole('button', { name: '存为预设' }).click();
    const input = page.locator('.t-dialog input');
    await input.waitFor();
    await input.fill('测试预设');
    await page.getByRole('button', { name: '存下' }).click();
    await toast('已存进预设库');
  });

  await step('色觉检查:抽屉里五张模拟图都有内容', async () => {
    await page.getByRole('button', { name: '色觉友好度检查' }).click();
    const cvs = page.locator('.t-drawer figure canvas');
    await cvs.first().waitFor({ state: 'visible' });
    await page.waitForTimeout(1000);
    const w = await cvs.evaluateAll((els) => els.map((e) => e.width));
    assert(w.length === 5 && w.every((x) => x > 0), '画布宽度 ' + w.join(','));
    await page.screenshot({ path: path.join(OUT, 'cvd.png') });
    await closeDrawer();
    return `模拟图宽 ${w[0]}px`;
  });

  await step('导出:CSS/JSON Token 正确,照片按原图尺寸下载', async () => {
    await page.getByRole('button', { name: '导出', exact: true }).click();
    const code = page.locator('pre.code');
    await code.waitFor({ state: 'visible' });
    assert((await code.textContent()).includes('--td-brand-color'), 'CSS 里没有 --td-brand-color');
    await page.locator('.t-drawer--open').getByText('JSON', { exact: true }).click();
    await page.waitForTimeout(300);
    JSON.parse(await code.textContent());
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.getByRole('button', { name: '导出照片' }).click(),
    ]);
    const file = path.join(OUT, 'export.jpg');
    await dl.saveAs(file);
    const kb = Math.round(fs.statSync(file).size / 1024);
    await closeDrawer();
    return `JSON 可解析;${dl.suggestedFilename()} ${kb}KB`;
  });

  /* ───────────── 预设库 ───────────── */

  await step('预设库:搜索、重命名、删除', async () => {
    await go('library');
    const cards = page.locator('.lib .card');
    await cards.first().waitFor();
    assert((await cards.count()) === 1, '预设数 ' + (await cards.count()));

    const search = page.locator('.lib-bar input');
    await search.fill('不存在的名字');
    await page.waitForTimeout(300);
    assert((await cards.count()) === 0, '搜索不存在的名字仍显示 ' + (await cards.count()));
    await search.fill('');
    await page.waitForTimeout(300);
    assert((await cards.count()) === 1, '清空搜索后 ' + (await cards.count()));

    await cards.first().locator('button.name').click();
    const input = cards.first().locator('input');
    await input.fill('改过的名字');
    await input.press('Enter');
    await page.waitForTimeout(300);
    const name = (await cards.first().locator('button.name').textContent()).trim();
    assert(name === '改过的名字', '重命名后是 ' + name);
    await page.screenshot({ path: path.join(OUT, 'library.png') });

    await cards.first().getByRole('button', { name: '删除' }).click();
    await page.getByRole('button', { name: /^(确定|确认)$/ }).last().click();
    await page.waitForTimeout(500);
    assert((await cards.count()) === 0, '删除后还剩 ' + (await cards.count()));
  });

  /* ───────────── URL 路由 ───────────── */

  await step('面板进 URL:点击切换、浏览器后退', async () => {
    await go('gallery');
    await go('library');
    await page.goBack();
    await page.waitForFunction(() => location.hash === '#gallery');
    assert((await activeTab()).startsWith('作品集'), '后退后面板是 ' + (await activeTab()));
    assert((await page.locator('nav.tabs a.on').getAttribute('aria-current')) === 'page', '缺 aria-current');
  });

  await step('刷新后仍停在作品集,作品还在(IndexedDB 持久化)', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    assert((await activeTab()).startsWith('作品集'), '刷新后面板是 ' + (await activeTab()));
    await page.locator('.gallery .work').first().waitFor({ timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, 'gallery.png') });
    return `${await page.locator('.gallery .work').count()} 张作品`;
  });

  await step('点作品还原参数,跳回调色台', async () => {
    await page.locator('.gallery .work .frame').first().click();
    await page.waitForFunction(() => location.hash === '#studio');
    await toast('已还原');
    const v = await reading('映射区间');
    assert(v === '4–8', '还原后的区间是 ' + v);
  });

  /* ───────────── 灵感 ───────────── */

  await step('灵感:套用范例,参数带回调色台', async () => {
    await go('inspire');
    await page.screenshot({ path: path.join(OUT, 'inspire.png') });
    const card = page.locator('.insp .card').nth(1);
    const label = await card.locator('.ramp').getAttribute('aria-label');
    const [, a, b] = label.match(/(\d+) 到 (\d+)/);
    const title = (await card.locator('h3').textContent()).trim();
    await card.getByRole('button', { name: '套用到我的照片' }).click();
    await page.waitForFunction(() => location.hash === '#studio');
    const v = await reading('映射区间');
    assert(v === `${a}–${b}`, `「${title}」应为 ${a}–${b},实际 ${v}`);
    return `「${title}」${v}`;
  });

  /* ───────────── 我的 ───────────── */

  await step('我的:昵称与头像刷新后仍在', async () => {
    await go('me');
    await page.locator('.profile input').fill('测试摄影师');
    await page.locator('.glyph[aria-label="山"]').click();
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' });
    assert((await page.locator('.profile input').inputValue()) === '测试摄影师', '昵称没存住');
    assert((await page.locator('.who strong').textContent()).trim() === '测试摄影师', '头图名字没更新');
    assert((await page.locator('.glyph[aria-label="山"]').getAttribute('aria-checked')) === 'true', '头像没存住');
    await page.screenshot({ path: path.join(OUT, 'me.png') });
  });

  /* ───────────── 真 390px 视口(不受无头窗口最小宽度限制) ───────────── */

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mobile.newPage();
  for (const hash of ['studio', 'inspire', 'gallery', 'library', 'me']) {
    await step(`390px 无横向溢出:${hash}`, async () => {
      await mp.goto(BASE + '#' + hash, { waitUntil: 'networkidle' });
      await mp.waitForTimeout(500);
      const r = await mp.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        const wide = [...document.querySelectorAll('body *')]
          .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().right > vw + 1)
          .slice(0, 5)
          .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}(${Math.round(e.getBoundingClientRect().right)})`);
        return { vw, sw, wide };
      });
      if (hash === 'studio') await mp.screenshot({ path: path.join(OUT, 'mobile-studio.png'), fullPage: true });
      assert(r.sw <= r.vw, `页面宽 ${r.sw} > 视口 ${r.vw};越界:${r.wide.join(' ')}`);
    });
  }

  await browser.close();

  /* ───────────── 报告 ───────────── */

  const pass = results.filter((r) => r[0] === 'PASS').length;
  for (const [s, n, note] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${n}${note ? '  — ' + note : ''}`);
  console.log(`\n${pass}/${results.length} 通过`);
  const uniq = [...new Set(errors)];
  console.log(uniq.length ? `\n控制台错误 ${uniq.length} 条:\n  ` + uniq.slice(0, 10).join('\n  ') : '\n控制台无错误');
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, results, errors: uniq }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})();
