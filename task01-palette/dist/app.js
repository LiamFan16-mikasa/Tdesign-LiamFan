"use strict";
(() => {
  // src/color.ts
  var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var sign = (v) => v < 0 ? -1 : v > 0 ? 1 : 0;
  var hexToRgb = (s) => {
    let h = s.replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    const n = parseInt(h, 16);
    return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
  };
  var num = String.raw`(-?[\d.]+)\s*%?`;
  var RE_RGB = new RegExp(`^rgba?\\(\\s*${num}[\\s,]+${num}[\\s,]+${num}`, "i");
  var RE_HSL = new RegExp(`^hsla?\\(\\s*${num}(?:deg)?[\\s,]+${num}[\\s,]+${num}`, "i");
  function hslToRgb(h, s, l) {
    h = (h % 360 + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(h / 60 % 2 - 1));
    const m = l - c / 2;
    const seg = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return {
      r: Math.round((seg[0] + m) * 255),
      g: Math.round((seg[1] + m) * 255),
      b: Math.round((seg[2] + m) * 255)
    };
  }
  function parseColor(input) {
    const s = input.trim();
    if (!s) return null;
    const hex = hexToRgb(s);
    if (hex) return hex;
    const rgb = RE_RGB.exec(s);
    if (rgb) {
      const v = [rgb[1], rgb[2], rgb[3]].map(
        (x, i) => s.includes("%") ? parseFloat(x) / 100 * 255 : parseFloat(x)
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
  function toHex({ r, g, b }) {
    const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
  }
  var srgbToLinear = (c) => {
    const v = c / 255;
    return v <= 0.040449936 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  var linearToSrgb = (v) => {
    const c = v <= 31308e-7 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return c * 255;
  };
  var rgbToLin = (c) => ({
    r: srgbToLinear(c.r),
    g: srgbToLinear(c.g),
    b: srgbToLinear(c.b)
  });
  var linToRgb = (c) => ({
    r: linearToSrgb(c.r),
    g: linearToSrgb(c.g),
    b: linearToSrgb(c.b)
  });
  var quantize = (lin) => {
    const c = linToRgb({ r: clamp(lin.r, 0, 1), g: clamp(lin.g, 0, 1), b: clamp(lin.b, 0, 1) });
    return { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) };
  };
  var inGamut = (c, eps = 1e-3) => c.r >= -eps && c.r <= 1 + eps && c.g >= -eps && c.g <= 1 + eps && c.b >= -eps && c.b <= 1 + eps;
  var linToXyz = (c) => ({
    x: (0.41233895 * c.r + 0.35762064 * c.g + 0.18051042 * c.b) * 100,
    y: (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * 100,
    z: (0.01932141 * c.r + 0.11916382 * c.g + 0.95034478 * c.b) * 100
  });
  var xyzToLin = (v) => {
    const x = v.x / 100, y = v.y / 100, z = v.z / 100;
    return {
      r: 3.2413774792388685 * x - 1.5376652402851851 * y - 0.49885366846268053 * z,
      g: -0.9691452513005321 * x + 1.8758853451067872 * y + 0.04156585616912061 * z,
      b: 0.05562093689691305 * x - 0.20395524564742123 * y + 1.0571799111220335 * z
    };
  };
  var rgbToXyz = (c) => linToXyz(rgbToLin(c));
  var E = 216 / 24389;
  var K = 24389 / 27;
  var lstarFromY = (y) => {
    const t = y / 100;
    return t > E ? 116 * Math.cbrt(t) - 16 : K * t;
  };
  var yFromLstar = (l) => {
    const f = (l + 16) / 116;
    return 100 * (f * f * f > E ? f * f * f : (116 * f - 16) / K);
  };

  // src/hct.ts
  var ViewingConditions = class {
    constructor(whitePoint, adaptingLuminance, backgroundLstar, surround) {
      const rW = whitePoint.x * 0.401288 + whitePoint.y * 0.650173 + whitePoint.z * -0.051461;
      const gW = whitePoint.x * -0.250268 + whitePoint.y * 1.204414 + whitePoint.z * 0.045854;
      const bW = whitePoint.x * -2079e-6 + whitePoint.y * 0.048952 + whitePoint.z * 0.953127;
      const f = 0.8 + surround / 10;
      this.c = f >= 0.9 ? lerp(0.59, 0.69, (f - 0.9) * 10) : lerp(0.525, 0.59, (f - 0.8) * 10);
      this.nc = f;
      let d = f * (1 - 1 / 3.6 * Math.exp((-adaptingLuminance - 42) / 92));
      d = clamp(d, 0, 1);
      this.rgbD = [
        100 / rW * d + 1 - d,
        100 / gW * d + 1 - d,
        100 / bW * d + 1 - d
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
        Math.pow(this.fl * this.rgbD[0] * rW / 100, 0.42),
        Math.pow(this.fl * this.rgbD[1] * gW / 100, 0.42),
        Math.pow(this.fl * this.rgbD[2] * bW / 100, 0.42)
      ];
      const rgbA = rgbAFactors.map((v) => 400 * v / (v + 27.13));
      this.aw = (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]) * this.nbb;
    }
  };
  var lerp = (a, b, t) => a + (b - a) * t;
  var SRGB_VC = new ViewingConditions(
    { x: 95.047, y: 100, z: 108.883 },
    200 / Math.PI * yFromLstar(50) / 100,
    50,
    2
  );
  function xyzToCam16(v, vc = SRGB_VC) {
    const rC = 0.401288 * v.x + 0.650173 * v.y - 0.051461 * v.z;
    const gC = -0.250268 * v.x + 1.204414 * v.y + 0.045854 * v.z;
    const bC = -2079e-6 * v.x + 0.048952 * v.y + 0.953127 * v.z;
    const rD = vc.rgbD[0] * rC, gD = vc.rgbD[1] * gC, bD = vc.rgbD[2] * bC;
    const adapt = (x) => {
      const f = Math.pow(vc.fl * Math.abs(x) / 100, 0.42);
      return sign(x) * 400 * f / (f + 27.13);
    };
    const rA = adapt(rD), gA = adapt(gD), bA = adapt(bD);
    const a = (11 * rA - 12 * gA + bA) / 11;
    const b = (rA + gA - 2 * bA) / 9;
    const u = (20 * rA + 20 * gA + 21 * bA) / 20;
    const p2 = (40 * rA + 20 * gA + bA) / 20;
    let hue = Math.atan2(b, a) * 180 / Math.PI;
    if (hue < 0) hue += 360;
    const ac = p2 * vc.nbb;
    const J = 100 * Math.pow(ac / vc.aw, vc.c * vc.z);
    const huePrime = hue < 20.14 ? hue + 360 : hue;
    const eHue = 0.25 * (Math.cos(huePrime * Math.PI / 180 + 2) + 3.8);
    const p1 = 5e4 / 13 * eHue * vc.nc * vc.ncb;
    const t = p1 * Math.hypot(a, b) / (u + 0.305);
    const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, vc.n), 0.73);
    const C = alpha * Math.sqrt(J / 100);
    return { J, C, h: hue };
  }
  function cam16ToXyz(J, C, h, vc = SRGB_VC) {
    const alpha = C === 0 || J === 0 ? 0 : C / Math.sqrt(J / 100);
    const t = Math.pow(alpha / Math.pow(1.64 - Math.pow(0.29, vc.n), 0.73), 1 / 0.9);
    const hRad = h * Math.PI / 180;
    const eHue = 0.25 * (Math.cos(hRad + 2) + 3.8);
    const ac = vc.aw * Math.pow(J / 100, 1 / (vc.c * vc.z));
    const p1 = eHue * (5e4 / 13) * vc.nc * vc.ncb;
    const p2 = ac / vc.nbb;
    const hSin = Math.sin(hRad), hCos = Math.cos(hRad);
    const gamma = 23 * (p2 + 0.305) * t / (23 * p1 + 11 * t * hCos + 108 * t * hSin);
    const a = gamma * hCos;
    const b = gamma * hSin;
    const rA = (460 * p2 + 451 * a + 288 * b) / 1403;
    const gA = (460 * p2 - 891 * a - 261 * b) / 1403;
    const bA = (460 * p2 - 220 * a - 6300 * b) / 1403;
    const unadapt = (x) => {
      const base = Math.max(0, 27.13 * Math.abs(x) / (400 - Math.abs(x)));
      return sign(x) * (100 / vc.fl) * Math.pow(base, 1 / 0.42);
    };
    const rF = unadapt(rA) / vc.rgbD[0];
    const gF = unadapt(gA) / vc.rgbD[1];
    const bF = unadapt(bA) / vc.rgbD[2];
    return {
      x: 1.86206786 * rF - 1.01125463 * gF + 0.14918677 * bF,
      y: 0.38752654 * rF + 0.62144744 * gF - 897398e-8 * bF,
      z: -0.0158415 * rF - 0.03412294 * gF + 1.04996444 * bF
    };
  }
  function rgbToHct(c) {
    const xyz = rgbToXyz(c);
    const cam = xyzToCam16(xyz);
    return { h: cam.h, c: cam.C, t: lstarFromY(xyz.y) };
  }
  function linAtTone(h, chroma, tone) {
    if (chroma < 1e-6) {
      const y = yFromLstar(tone) / 100;
      return { r: y, g: y, b: y };
    }
    let lo = 0.05, hi = 100, best = null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const xyz = cam16ToXyz(mid, chroma, h);
      if (!isFinite(xyz.y)) return null;
      const l = lstarFromY(Math.max(xyz.y, 0));
      best = xyzToLin(xyz);
      if (Math.abs(l - tone) < 1e-4) break;
      if (l < tone) lo = mid;
      else hi = mid;
    }
    return best;
  }
  function hctToRgb(h, chroma, tone) {
    const t = clamp(tone, 0, 100);
    if (t <= 0) return { rgb: { r: 0, g: 0, b: 0 }, chroma: 0 };
    if (t >= 100) return { rgb: { r: 255, g: 255, b: 255 }, chroma: 0 };
    const direct = linAtTone(h, chroma, t);
    if (direct && inGamut(direct, 1e-3)) return { rgb: quantize(direct), chroma };
    let lo = 0, hi = Math.max(chroma, 1);
    let bestLin = linAtTone(h, 0, t);
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const lin = linAtTone(h, mid, t);
      if (lin && inGamut(lin, 1e-3)) {
        lo = mid;
        bestLin = lin;
      } else hi = mid;
    }
    return { rgb: quantize(bestLin), chroma: lo };
  }

  // src/palette.ts
  var REF_LIGHT = [97, 93, 85.5, 75, 63, 51, 40, 30.5, 21.8, 14];
  var REF_DARK = [12, 15.5, 20.5, 27.5, 36.5, 47, 58.5, 70, 81.5, 93];
  var NEUTRAL_LIGHT = [98.5, 96.5, 94, 91, 87, 82, 75, 67, 58, 49, 40, 30, 20, 11];
  var NEUTRAL_DARK = [7, 11, 15, 19, 24, 30, 37, 45, 53, 62, 71, 80, 89, 96];
  var CONFIG = {
    /** 浅端彩度衰减指数。越小，最浅几阶越「有颜色」而不发白 */
    tintChromaExp: 0.55,
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
    grayThreshold: 3
  };
  function pickAnchorIndex(tone, ref) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < ref.length; i++) {
      const d = Math.abs(ref[i] - tone);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best + 1;
  }
  function toneLadder(ref, anchorIndex, anchor) {
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
  function chromaAt(baseC, tone, anchor) {
    if (tone <= anchor) return baseC;
    const r = (100 - tone) / Math.max(100 - anchor, 1e-6);
    return baseC * Math.pow(clamp(r, 0, 1), CONFIG.tintChromaExp);
  }
  function toSwatches(colors) {
    return colors.map((rgb, i) => {
      const h = rgbToHct(rgb);
      return { index: i + 1, hex: toHex(rgb), rgb, tone: h.t, chroma: h.c };
    });
  }
  function buildBrand(base, tones, anchor) {
    const gray = base.c < CONFIG.grayThreshold;
    return tones.map((t) => hctToRgb(base.h, gray ? 0 : chromaAt(base.c, t, anchor), t).rgb);
  }
  function buildNeutral(base, mode) {
    const tones = mode === "light" ? NEUTRAL_LIGHT : NEUTRAL_DARK;
    const c = base.c < CONFIG.grayThreshold ? 0 : CONFIG.neutralChroma;
    return tones.map((t) => hctToRgb(base.h, c, t).rgb);
  }
  function generatePalette(input, mode = "light") {
    const rgb = parseColor(input);
    if (!rgb) return null;
    const base = rgbToHct(rgb);
    const ref = mode === "light" ? REF_LIGHT : REF_DARK;
    const anchorTone = clamp(base.t, 3, 97);
    const anchorIndex = pickAnchorIndex(anchorTone, ref);
    const tones = toneLadder(ref, anchorIndex, anchorTone);
    return {
      brand: toSwatches(buildBrand(base, tones, anchorTone)),
      neutral: toSwatches(buildNeutral(base, mode)),
      anchorIndex,
      anchorTone,
      input: { hex: toHex(rgb), h: base.h, c: base.c, t: base.t },
      mode
    };
  }

  // src/cvd.ts
  var CVD_LABELS = {
    none: "\u6B63\u5E38\u89C6\u89C9",
    protanopia: "\u7EA2\u8272\u76F2",
    deuteranopia: "\u7EFF\u8272\u76F2",
    tritanopia: "\u84DD\u9EC4\u8272\u76F2",
    achromatopsia: "\u5168\u8272\u76F2"
  };
  var MATRICES = {
    protanopia: [
      0.152286,
      1.052583,
      -0.204868,
      0.114503,
      0.786281,
      0.099216,
      -3882e-6,
      -0.048116,
      1.051998
    ],
    deuteranopia: [
      0.367322,
      0.860646,
      -0.227968,
      0.280085,
      0.672501,
      0.047413,
      -0.01182,
      0.04294,
      0.968881
    ],
    tritanopia: [
      1.255528,
      -0.076749,
      -0.178779,
      -0.078411,
      0.930809,
      0.147602,
      4733e-6,
      0.691367,
      0.3039
    ]
  };
  function toGray(lin) {
    const y = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
    return { r: y, g: y, b: y };
  }
  function apply(lin, m) {
    return {
      r: m[0] * lin.r + m[1] * lin.g + m[2] * lin.b,
      g: m[3] * lin.r + m[4] * lin.g + m[5] * lin.b,
      b: m[6] * lin.r + m[7] * lin.g + m[8] * lin.b
    };
  }
  function simulate(rgb, type) {
    if (type === "none") return { ...rgb };
    const lin = rgbToLin(rgb);
    const out = type === "achromatopsia" ? toGray(lin) : apply(lin, MATRICES[type]);
    return quantize({
      r: clamp(out.r, 0, 1),
      g: clamp(out.g, 0, 1),
      b: clamp(out.b, 0, 1)
    });
  }

  // src/app.ts
  var PRESETS = ["#0052D9", "#E34D59", "#ED7B2F", "#00A870", "#7B4FD9", "#0594FA"];
  var state = { input: "#0052D9", mode: "light", cvd: "none" };
  var $ = (id) => document.getElementById(id);
  function readableInk(rgb) {
    const l = rgbToLin(rgb);
    const y = 0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b;
    return (y + 0.05) / 0.05 >= 1.05 / (y + 0.05) ? "#000000" : "#FFFFFF";
  }
  function renderStrip(host, swatches, label) {
    const cells = swatches.map((s) => {
      const shown = simulate(s.rgb, state.cvd);
      const hex = toHex(shown);
      return `<button class="seg-cell" role="listitem" data-copy="${s.hex}"
              style="--c:${hex};--fg:${readableInk(shown)}"
              aria-label="${label}\u7B2C ${s.index} \u9636 ${s.hex}\uFF0C\u70B9\u51FB\u590D\u5236">
              <span class="val">${s.hex}</span>
            </button>`;
    });
    host.innerHTML = cells.join("");
  }
  function renderCaption(p) {
    const dir = p.mode === "light" ? "1 \u2192 10 \u7531\u6D45\u5230\u6DF1" : "1 \u2192 10 \u7531\u6DF1\u5230\u6D45";
    $("caption").innerHTML = [
      `\u4E3B\u8272\u843D\u5728\u7B2C <b>${p.anchorIndex}</b> \u9636`,
      `L* <b>${p.input.t.toFixed(1)}</b>`,
      `\u8272\u76F8 <b>${p.input.h.toFixed(0)}\xB0</b>`,
      `<b>${dir}</b>`,
      `\u70B9\u51FB\u4EFB\u4E00\u6BB5\u590D\u5236\u8272\u503C`
    ].map((x) => `<span>${x}</span>`).join("");
  }
  function render() {
    const p = generatePalette(state.input, state.mode);
    const entry = $("entry");
    const hint = $("hint");
    if (!p) {
      entry.classList.add("bad");
      hint.textContent = "\u8BA4\u4E0D\u51FA\u8FD9\u4E2A\u989C\u8272\u3002\u8BD5\u8BD5 #0052D9\u3001rgb(0,82,217) \u6216 hsl(220 100% 43%)\u3002";
      return;
    }
    entry.classList.remove("bad");
    hint.textContent = "";
    renderStrip($("brand"), p.brand, "\u54C1\u724C\u8272\u9636");
    renderStrip($("neutral"), p.neutral, "\u4E2D\u6027\u8272\u9636");
    renderCaption(p);
    $("pick").style.setProperty("--sw", p.input.hex);
    document.documentElement.setAttribute("data-mode", state.mode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", state.mode === "light" ? "#E9ECEE" : "#111417");
  }
  var toastTimer = 0;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove("on"), 1500);
  }
  function copy(text) {
    var _a;
    const ok = () => toast(`\u5DF2\u590D\u5236 ${text}`);
    const manual = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-100px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        ok();
      } catch {
        toast(text);
      }
      ta.remove();
    };
    if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) navigator.clipboard.writeText(text).then(ok, manual);
    else manual();
  }
  function pressGroup(host, key, value) {
    host.querySelectorAll(`[data-${key}]`).forEach(
      (b) => b.setAttribute("aria-pressed", String(b.dataset[key] === value))
    );
  }
  function init() {
    const input = $("hex");
    input.value = state.input;
    $("presets").innerHTML = PRESETS.map(
      (h) => `<button data-set="${h}" style="background:${h}" title="${h}" aria-label="\u4F7F\u7528 ${h}"></button>`
    ).join("");
    $("cvd").innerHTML = Object.keys(CVD_LABELS).map((k) => `<button data-cvd="${k}" aria-pressed="${k === "none"}">${CVD_LABELS[k]}</button>`).join("");
    input.addEventListener("input", () => {
      state.input = input.value;
      render();
    });
    const picker = document.createElement("input");
    picker.type = "color";
    picker.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none";
    document.body.appendChild(picker);
    picker.addEventListener("input", () => {
      state.input = picker.value.toUpperCase();
      input.value = state.input;
      render();
    });
    $("pick").addEventListener("click", () => {
      const rgb = parseColor(state.input);
      picker.value = rgb ? toHex(rgb).toLowerCase() : "#0052d9";
      picker.click();
    });
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-copy],[data-set],[data-mode],[data-cvd]");
      if (!el) return;
      if (el.dataset.copy) copy(el.dataset.copy);
      else if (el.dataset.set) {
        state.input = el.dataset.set;
        input.value = state.input;
        render();
      } else if (el.dataset.mode) {
        state.mode = el.dataset.mode;
        pressGroup(document.body, "mode", state.mode);
        render();
      } else if (el.dataset.cvd) {
        state.cvd = el.dataset.cvd;
        pressGroup($("cvd"), "cvd", state.cvd);
        render();
      }
    });
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
