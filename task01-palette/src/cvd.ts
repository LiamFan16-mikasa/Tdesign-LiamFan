/**
 * cvd.ts — 色觉障碍模拟
 *
 * 用来回答一个色阶生成器通常不会自问的问题：
 * 这十阶在色觉障碍者眼里还分得开吗？
 *
 * 约 8% 的男性有红绿色觉障碍。一套主要靠色相拉开的色板，在他们眼里会塌成一团；
 * 而本项目的色阶是靠明度台阶拉开的，色相全程锁死——所以理论上模拟之后
 * 十阶的层次应当基本不受影响。这个模块就是把这句话变成可以当场验证的事。
 *
 * 变换矩阵取自 Machado, Oliveira & Fernandes (2009)，severity = 1.0。
 * 必须作用在**线性光**上；直接乘 sRGB 数值是常见错误，会让结果整体偏暗。
 */

import { RGB, LinRGB, rgbToLin, quantize, clamp } from './color';

export type CvdType = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

export const CVD_LABELS: Record<CvdType, string> = {
  none: '正常视觉',
  protanopia: '红色盲',
  deuteranopia: '绿色盲',
  tritanopia: '蓝黄色盲',
  achromatopsia: '全色盲',
};

type Matrix = readonly [number, number, number, number, number, number, number, number, number];

const MATRICES: Partial<Record<CvdType, Matrix>> = {
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.011820, 0.042940, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.303900,
  ],
};

/** 全色盲：只剩亮度通道，用 Rec.709 权重在线性光里取灰 */
function toGray(lin: LinRGB): LinRGB {
  const y = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
  return { r: y, g: y, b: y };
}

function apply(lin: LinRGB, m: Matrix): LinRGB {
  return {
    r: m[0] * lin.r + m[1] * lin.g + m[2] * lin.b,
    g: m[3] * lin.r + m[4] * lin.g + m[5] * lin.b,
    b: m[6] * lin.r + m[7] * lin.g + m[8] * lin.b,
  };
}

/**
 * 把一个颜色变换成指定色觉类型下的观感等效色。
 * `none` 原样返回。这是纯展示层的变换，不应该影响任何被复制出去的真实色值。
 */
export function simulate(rgb: RGB, type: CvdType): RGB {
  if (type === 'none') return { ...rgb };
  const lin = rgbToLin(rgb);
  const out = type === 'achromatopsia' ? toGray(lin) : apply(lin, MATRICES[type]!);
  return quantize({
    r: clamp(out.r, 0, 1),
    g: clamp(out.g, 0, 1),
    b: clamp(out.b, 0, 1),
  });
}
