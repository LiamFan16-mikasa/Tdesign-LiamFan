# 犀牛鸟 2026 · 交付

## Task 01 — 当一次「调色大师」

输入任意主色，生成 10 阶品牌色阶与 14 阶中性色阶，浅色 / 深色各一套，并可在四种色觉障碍下实时预览。

**[在线体验](https://liamfan16-mikasa.github.io/Tdesign-LiamFan/task01-palette/)** · [源码与说明](task01-palette/) · [设计说明](task01-palette/docs/design.md)

在 HCT 空间（CAM16 的色相彩度 + CIELab 的 `L*`）里铺色阶。明度台阶是钟形步长——浅端密、中段疏、深端回落，而不是等距或单调递增。主色按自己的 `L*` 落在它天然属于的那一阶；色相全程锁死；彩度在浅侧衰减、深侧保持主色值后逐阶单独裁到 sRGB 色域边界。深色模式是一条独立的非对称台阶，不是把浅色阶反过来。

每个参数的理由、以及被否掉的方案为什么被否掉，都写在 [设计说明](task01-palette/docs/design.md) 里。

---

## Task 02 — CodeBuddy

进行中。
