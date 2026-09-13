# 犀牛鸟 2026 · TDesign 项目交付

两个任务，都能直接在浏览器里打开使用，面向电脑端（Chrome / Edge）。

| | 在线体验 | 源码与说明 |
|---|---|---|
| **Task 01** 色阶发生器 | [打开](https://liamfan16-mikasa.github.io/Tdesign-LiamFan/task01-palette/) | [task01-palette](task01-palette/)，[设计说明](task01-palette/docs/design.md) |
| **Task 02** 显影台 | [打开](https://liamfan16-mikasa.github.io/Tdesign-LiamFan/task02-develop/dist/) | [task02-develop](task02-develop/) |

---

## Task 01 — 当一次「调色大师」

**色阶发生器**：输入任意主色，生成 10 阶品牌色阶与 14 阶中性色阶，浅色、深色各一套，
可以在四种色觉障碍下实时预览，并导出为 TDesign 的 Design Token。

**怎么做的。** 色阶铺在 HCT 空间里（CAM16 的色相与彩度，加 CIELab 的明度 `L*`）。

- 明度台阶是钟形步长：浅端略密、中段最疏、深端回落，取自 TDesign 官方色阶的实际分布。
- 主色按自己的 `L*` 落在它天然属于的那一阶，台阶整体拉伸去命中它。
- 色相全程锁死；彩度在浅侧衰减、深侧保持，逐阶单独裁到 sRGB 色域边界，深色不发灰。
- 深色模式是一条独立的非对称台阶，不是把浅色阶反过来。

**效果。** 以 TDesign 官方四套色阶的主色为输入，生成结果与官方手工调校的色阶平均色差 ΔEab 为 1.93，
四套都在 2.5 以内。每个参数的理由、被否掉的方案为什么被否掉，写在[设计说明](task01-palette/docs/design.md)里。

---

## Task 02 — 用 Agent 落地你的产品

**显影台**：用色阶当滤镜的风光摄影调色台。放一张风光照，选一个色调，照片按这条色阶重新上色。

滤镜不是黑盒，是一条能看见、能改、能导出的十阶色阶。色阶由 Task 01 生成；
照片的暗部取色阶深端、高光取浅端（渐变映射），再按混合模式与强度混回原图。

- **调色台**：从照片色彩里提取四条候选色调，也可以自定义主色；调映射区间、混合模式与强度；按住看原图。
  空台面上有六张示例照片，点一张，照片和它的调色参数一起放上台面。
- **灵感、作品集、预设库、我的**：套用范例，存下作品随时还原，把一套色调存成预设换张照片复用，个人设置。
- **色觉友好度检查**，**原图尺寸导出**，**Design Token 导出**。
- **界面跟着照片走**：整页背景就是正在调的这张照片，模糊成一片色彩氛围；开始调色后背景退成接近中性的深色、停止流动，
  免得周围的颜色干扰对照片颜色的判断。
- **数据只留在本机**：没有后端，照片不上传；预设与设置存 localStorage，作品集存 IndexedDB。

技术栈：Vue 3、Vite、TDesign Vue Next。性能取舍、踩过的坑与数据设计见 [task02-develop](task02-develop/)。

---

## 验收

每次上线前后，都对着生产构建和线上地址跑同一套检查。

| 项目 | 检查 | 数量 |
|---|---|---|
| Task 01 | 算法测试：CAM16 参考值、输入解析、色阶不变量、色觉模拟、Token 导出、对照官方色阶 | 293 项断言 |
| Task 02 | 预设库存取逻辑 | 16 项断言 |
| Task 02 | 端到端流程：上传、调色、存取、导出、键盘操作、刷新后数据仍在 | 24 项 |
| Task 02 | 生产构建样式检查 | 6 项 |

## 本地运行

```bash
# Task 01
cd task01-palette && npm install
npm test            # 293 项断言
npm run build       # 产出 dist/色阶发生器.html，双击即可运行

# Task 02（引用 ../task01-palette 的源码，两个目录要放在一起）
cd task02-develop && npm install
npm run dev         # http://localhost:5173
npm test            # 16 项断言
npm run build       # 产物在 dist/，GitHub Pages 直接发布它
```

## 目录

```
task01-palette/   色阶发生器：TypeScript，零运行时依赖
  docs/design.md  设计说明：每个决定与它的代价
task02-develop/   显影台：Vue 3 + Vite + TDesign Vue Next
  e2e/            端到端与生产构建检查
```
