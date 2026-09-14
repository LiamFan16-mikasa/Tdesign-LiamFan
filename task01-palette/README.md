# 色阶发生器

输入任意主色，生成 **10 阶品牌色阶** 与 **14 阶中性色阶**，浅色 / 深色各一套，并可在四种色觉障碍下实时预览。

```bash
npm install
npm run build     # 产出 dist/色阶发生器.html —— 双击即可运行的单文件
npm run dev       # 本地开发服务器
npm run typecheck # tsc --strict
npm test          # 293 项断言：CAM16 参考值、输入解析、色阶不变量、色觉模拟、Token 导出、对照官方色阶
```

不想装依赖的话，直接打开 `dist/色阶发生器.html`。

---

## 用法

```ts
import { generatePalette } from './src/palette';

const p = generatePalette('#0052D9', 'light');

p.brand;        // 10 阶：{ index, hex, rgb, tone, chroma }
p.neutral;      // 14 阶中性色
p.anchorIndex;  // 输入主色落在第几阶
p.anchorTone;   // 锚点实际使用的 L*
p.input;        // { hex, h, c, t } —— 输入色的 CAM16 分量
```

`generatePalette` 接受 `#0052D9`、`0052D9`、`#05D`、`rgb(0,82,217)`、`hsl(220 100% 43%)`，解析失败返回 `null`，不抛异常。

导出成 TDesign 的 Design Token：

```ts
import { toCssVariables, toTokenJson, applyTokens } from './src/tokens';

toCssVariables(p);   // ':root {\n  --td-brand-color-1: #F6F5FF;\n  … }'
toTokenJson(p);      // { '--td-brand-color-1': '#F6F5FF', … } 共 24 项
applyTokens(p);      // 运行时写进 document.documentElement，整站立刻换肤
```

TDesign 的语义 token（`--td-brand-color`、`--td-bg-color-page`、`--td-border-level-1-color` 等）的值都是 `var(--td-数字-token)`，所以**只覆盖数字 token 就够了**，语义层会自动跟着变。两处例外：文字颜色走 `--td-font-gray-1..4`（黑色加透明度，不走灰阶），`--td-bg-color-container` 在浅色主题下硬编码为 `#fff`。

色觉模拟单独一个纯函数：

```ts
import { simulate } from './src/cvd';
simulate(rgb, 'deuteranopia');  // 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia' | 'none'
```

生成器零运行时依赖，不碰 DOM，可以整个目录拷进任何项目。

---

## 算法一句话版

在 **HCT**（CAM16 的色相彩度 + CIELab 的 `L*`）里，沿一条**钟形步长**的明度台阶铺十阶——浅端略密、中段最疏、深端回落。主色按自己的 `L*` 落在它天然属于的那一阶，台阶整体拉伸去命中它。色相全程锁死；彩度在浅侧衰减、深侧保持主色值，然后**逐阶单独**裁到 sRGB 色域边界。深色模式是一条独立的非对称台阶（暗端密），不是把浅色阶反过来。

每一个决定的理由、代价，以及被否掉的方案为什么被否掉，写在 **[docs/design.md](docs/design.md)**。

### 和 TDesign 官方色阶对照

明度台阶取自 TDesign 官方色阶的实际 `L*` 分布——依据是官方 brand / warning / error 三套的分布几乎完全一致（起伏 1.6–1.7 倍），三个不同色相独立调出同一个形状，说明是通用规律而非蓝色特例。

以官方各套的主色为输入，生成结果与官方手工调校的色阶相比：

| | brand | warning | error | success | 平均 |
|---|---|---|---|---|---|
| 平均 ΔEab | 1.49 | 1.59 | 2.24 | 2.39 | **1.93** |

四套全部在 2.5 以内。这项对照写进了测试（`test/run.mjs`），改动算法参数会立刻发现回归。

---

## 关于三条验收标准

| | 怎么处理的 |
|---|---|
| **突然断层** | 步长做成连续变化的钟形，而不是单调递增——单调递增会让锚点两侧的步长对不上，接缝处出现跳变 |
| **深色发灰** | 深端保持主色彩度，逐阶单独裁到色域边界，每一阶都拿到该明度下 sRGB 能给的最大彩度 |
| **浅色发飘** | 浅端按到白端的剩余距离主动衰减彩度（指数 0.35），而不是硬要一个会被裁得莫名其妙的值 |
| **极端主色** | 不硬塞进固定阶。`L*=92` 的亮黄天然落在第 2 阶，界面如实说明 |

---

## 文件

```
src/color.ts     输入解析、sRGB ↔ 线性 ↔ XYZ、L* ↔ Y、色域判定
src/hct.ts       CAM16 正逆变换与 HCT 求解器
src/palette.ts   色阶生成（主交付物）
src/cvd.ts       色觉障碍模拟（Machado 2009）
src/tokens.ts    导出为 TDesign Design Token
src/app.ts       界面层
src/index.ts     库入口
index.html       结构与样式
docs/design.md   设计说明：每个决定与它的代价
test/run.mjs     算法测试
test/ui.mjs      界面冒烟测试
```
