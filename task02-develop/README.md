# 显影台

用色阶当滤镜的风光摄影调色台。犀牛鸟 2026 · Task 02。

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物在 dist/，会被提交，GitHub Pages 直接发布它
npm run typecheck
npm test           # 预设库存取逻辑，16 项断言
```

演示地址：`https://liamfan16-mikasa.github.io/Tdesign-LiamFan/task02-develop/dist/`

`dist/` **要提交**。Pages 发布的是仓库里的静态文件，不跑构建；`vite.config.ts` 里的
`base` 也是按这个路径写的。改路径的话两处要一起改。

## 当前进度

调色台与预设库已经能用。传一张风光照，选一个色调，照片按这个色调重新上色，
界面也同时穿上这个色调；调好的配置可以存进预设库复用。

```bash
npm test        # 预设库存取逻辑，16 项断言
npm run typecheck
```

## 怎么做的

**渐变映射**：把照片的明度当索引，去一条由浅到深的色阶上取色——暗部取深端，高光取浅端。
色阶来自 Task 01，所以「滤镜」就是一条你能看见、能改、能导出的十阶色阶。

**性能**。第一版按设计文档写（256 项查找表 + OKLab 插值），1600×1200 单帧仍要 25–49ms，
超出 16ms 的一帧预算两到三倍——瓶颈是混合函数里的除法和 `Math.sqrt`。三轮优化：

- 混合函数烤成 256×256 的查表，像素循环里三次乘除开方变成三次数组索引
- 明度索引改成纯查表，每像素只剩四次数组读取两次加法
- 插值改定点数，整数移位代替浮点乘

45ms 降到 20.8ms。仍然超，所以**预览长边定在 1280**（实测四种混合模式都在 13ms 内），
导出时用原图重跑一遍，成品不受影响。

**混合在 gamma 空间做**，不是线性光。这一条和 Task 01 的色域映射相反——那边必须在线性光里算，
但混合模式要跟 Photoshop 的观感一致，摄影师的手感是被 PS 训练出来的。

**预设存 localStorage**。这个应用没有后端也不该有——调色是本地行为，
把用户的照片传到服务器只为了存三个数字，不划算也不该做。

## 和 Task 01 的关系

`vite.config.ts` 里把 `@palette` 别名指向 `../task01-palette/src`，直接引用源码，
不复制一份——复制会漂移，改了 Task 01 忘了同步，最后交上去两份不一致。

换肤的全部机制只有两行：

```ts
const p = generatePalette('#0052D9', 'dark');
applyTokens(p);   // 写 24 个 CSS 变量到 :root，并设置 theme-mode="dark"
```

不需要手动映射语义 token。TDesign 的 `--td-brand-color`、`--td-bg-color-page`、
`--td-component-stroke` 这些的值都是 `var(--td-数字-token)`，覆盖数字层，语义层自动跟着变。

## 没有覆盖的东西

`warning` / `error` / `success` 三套功能色阶保持 TDesign 默认值。
功能色的语义（红＝失败、绿＝成功）不该跟着品牌色跑。
