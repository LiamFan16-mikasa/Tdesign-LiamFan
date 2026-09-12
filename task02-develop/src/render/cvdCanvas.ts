/**
 * cvdCanvas.ts — 把色觉障碍模拟套到整块画布上
 *
 * Task 01 的 cvd.ts 是逐个颜色模拟的（simulate(rgb, type)），
 * 用它逐像素跑一张一百多万像素的图会很慢。这里的思路和渐变映射一样：
 * 模拟是一个「RGB → RGB」的确定映射，但输入空间太大（1600 万种颜色）没法整表预算。
 *
 * 折中：模拟作用在每个通道近似独立的假设通常不成立（色觉矩阵会混通道），
 * 所以这里直接对整块 ImageData 逐像素调 simulate，但只在「用户主动打开检查」时跑一次，
 * 不进实时渲染循环。检查是一个静态的旁路视图，不是常驻滤镜。
 */

import { simulate, type CvdType } from '@palette/cvd';

/** 把 src 按色觉类型模拟后写进 dst。两者同尺寸。type 为 none 时直接拷贝。 */
export function simulateImage(src: ImageData, dst: ImageData, type: CvdType): void {
  const s = src.data, d = dst.data;
  if (type === 'none') { d.set(s); return; }
  const px = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < s.length; i += 4) {
    px.r = s[i]; px.g = s[i + 1]; px.b = s[i + 2];
    const o = simulate(px, type);
    d[i] = o.r; d[i + 1] = o.g; d[i + 2] = o.b; d[i + 3] = s[i + 3];
  }
}
