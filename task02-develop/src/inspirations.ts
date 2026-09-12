/**
 * inspirations.ts — 内置灵感库
 *
 * 开箱即有的精选调色范例,解决"空产品"的冷启动:用户第一次打开就有东西可看、可套用。
 * 对应"看别人的足迹",但没有真社区——是官方精选案例,纯前端、无后端。
 *
 * 每条范例 = 一张风光照 + 一套调好的参数 + 一句说明。用户点"套用"后,
 * 这套参数被搬到调色台,作用到用户自己的照片上。
 *
 * ⚠️ 关于配图:cover 字段目前是内联 SVG 意象图(占位)。
 * 正式版应替换为真实风光照(自己拍摄或 CC0 授权,如 Unsplash / Pexels)。
 * 替换方式:把 cover 换成图片 URL 或 import 的静态资源,其余字段不动。
 */

import type { BlendMode } from './render/pipeline';

export interface Inspiration {
  id: string;
  title: string;
  scene: string;        // 场景描述
  hex: string;          // 色调主色
  blend: BlendMode;
  strength: number;
  range: [number, number];
  note: string;         // 这套调色在讲什么
  cover: string;        // 封面:当前为 SVG dataURL 占位,正式版换真实照片
}

/* --- 生成 SVG 意象图占位。正式版删掉这段,cover 直接用真实照片 --- */

function svgCover(stops: string[]): string {
  const bands = stops.map((c, i) => {
    const y = (i / stops.length) * 100;
    const h = 100 / stops.length + 0.5;
    return `<rect x="0" y="${y}" width="160" height="${h}" fill="${c}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">${bands}<rect width="160" height="120" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient></defs></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const INSPIRATIONS: Inspiration[] = [
  {
    id: 'insp-sunset', title: '落日海岸', scene: '日落时的海面',
    hex: '#0E7C86', blend: 'softLight', strength: 55, range: [1, 10],
    note: '暖橙的天配青蓝的海,冷暖对撞是日落海岸最稳的解法。',
    cover: svgCover(['#F6D9A0', '#E8A060', '#C86840', '#5A6E88', '#2A3A55']),
  },
  {
    id: 'insp-fog', title: '晨雾松林', scene: '清晨的松林',
    hex: '#2F6B4F', blend: 'softLight', strength: 40, range: [3, 9],
    note: '窄幅映射提亮黑场,雾气不至于压成死黑,松绿也收得住。',
    cover: svgCover(['#DDE5DC', '#AEC0B0', '#7E9580', '#4E6654', '#2C3E32']),
  },
  {
    id: 'insp-goldenwheat', title: '暮色麦田', scene: '黄昏的田野',
    hex: '#B8791F', blend: 'overlay', strength: 50, range: [1, 9],
    note: '叠加模式加暖金,让黄昏的暖光更浓,麦浪更透。',
    cover: svgCover(['#F5E3B0', '#E0B860', '#C08838', '#8A5A28', '#4E3418']),
  },
  {
    id: 'insp-bluehour', title: '蓝色时刻', scene: '日落后的雪山',
    hex: '#1D4E89', blend: 'softLight', strength: 60, range: [1, 10],
    note: '日落后二十分钟的冷调,雪山与天空同色,静。',
    cover: svgCover(['#C4D4E8', '#8AA4C8', '#4E6E9C', '#2E4670', '#1A2A48']),
  },
  {
    id: 'insp-fadedfilm', title: '褪色胶片', scene: '阴天,任何题材',
    hex: '#8C7B6B', blend: 'softLight', strength: 45, range: [4, 8],
    note: '整体降饱和、压反差,阴天雾天也不发灰,老胶片的味道。',
    cover: svgCover(['#E4DDD2', '#C4B8A8', '#A0917E', '#78685A', '#4E4238']),
  },
  {
    id: 'insp-canyon', title: '峡谷赭石', scene: '正午的红土',
    hex: '#9C4A2F', blend: 'overlay', strength: 48, range: [1, 9],
    note: '赭红压进暗部,峡谷的红土更厚重,层次更分明。',
    cover: svgCover(['#E6C8A8', '#D08858', '#A85838', '#743420', '#421C10']),
  },
];
