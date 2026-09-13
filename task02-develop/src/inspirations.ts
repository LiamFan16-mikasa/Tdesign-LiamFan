/**
 * inspirations.ts — 内置灵感库
 *
 * 开箱即有的精选调色范例,解决"空产品"的冷启动:用户第一次打开就有东西可看、可套用。
 * 对应"看别人的足迹",但没有真社区——是官方精选案例,纯前端、无后端。
 *
 * 每条范例 = 一张风光照 + 一套调好的参数 + 一句说明。用户点"套用"后,
 * 这套参数被搬到调色台,作用到用户自己的照片上。
 *
 * 配图:照片放在 src/assets/covers/<id>.jpg,构建时自动接上,缺图时回退成生成的 SVG 占位。
 * 封面按 4:3 裁切,竖拍的照片用 coverPosition 指定裁切焦点,免得主体被切掉。
 * 说明文案里提到的混合模式、映射区间、色调,要和同一条的参数保持一致。
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
  cover: string;        // 封面:src/assets/covers/<id>.jpg 存在就用照片，否则用 SVG 占位
  coverPosition?: string; // 封面裁切焦点(CSS object-position),不填为居中
}

/* --- 封面:有真实照片用照片,没有就用生成的 SVG 意象图占位 --- */

/**
 * 构建时扫描 src/assets/covers/,文件名(不含扩展名)等于范例 id 的照片自动接上。
 * 换图只需要把照片放进目录,不用改这里的代码;命名规则见该目录下的 README.md。
 */
const COVER_FILES = import.meta.glob('./assets/covers/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function coverFor(id: string, fallbackStops: string[]): string {
  const hit = Object.entries(COVER_FILES).find(([file]) => (file.split('/').pop() ?? '').split('.')[0] === id);
  return hit ? hit[1] : svgCover(fallbackStops);
}

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
    id: 'insp-sunset', title: '镜湖倒影', scene: '山间湖的倒影',
    hex: '#0E7C86', blend: 'softLight', strength: 55, range: [1, 10],
    note: '峰顶的一点暖光配满湖青蓝，柔光加青色把冷暖拉开，全幅映射保住倒影的反差。',
    cover: coverFor('insp-sunset', ['#F6D9A0', '#E8A060', '#C86840', '#5A6E88', '#2A3A55']),
  },
  {
    id: 'insp-fog', title: '松林湖畔', scene: '晴天的松林湖',
    hex: '#2F6B4F', blend: 'softLight', strength: 40, range: [3, 9],
    note: '松绿收住满眼的绿色，窄幅映射提亮暗部，树影和水草不至于压成一团黑。',
    cover: coverFor('insp-fog', ['#DDE5DC', '#AEC0B0', '#7E9580', '#4E6654', '#2C3E32']),
  },
  {
    id: 'insp-goldenwheat', title: '金色草原', scene: '草原上的野牛',
    hex: '#B8791F', blend: 'overlay', strength: 50, range: [1, 9],
    note: '叠加模式加暖金，草原的金黄更浓，野牛的毛色和峰顶的晨光也跟着暖起来。',
    cover: coverFor('insp-goldenwheat', ['#F5E3B0', '#E0B860', '#C08838', '#8A5A28', '#4E3418']),
    // 竖图:居中裁切会切掉野牛,焦点往下移,留下雾里的山脚、树林和野牛
    coverPosition: '50% 80%',
  },
  {
    id: 'insp-bluehour', title: '冰川湖', scene: '夏天的冰川湖',
    hex: '#1D4E89', blend: 'softLight', strength: 60, range: [1, 10],
    note: '深蓝柔光把湖水和雪线往冷里收，岩壁更沉，整张照片更清冽。',
    cover: coverFor('insp-bluehour', ['#C4D4E8', '#8AA4C8', '#4E6E9C', '#2E4670', '#1A2A48']),
  },
  {
    id: 'insp-fadedfilm', title: '褪色秋林', scene: '秋天的白杨林',
    hex: '#8C7B6B', blend: 'softLight', strength: 45, range: [4, 8],
    note: '暖灰降饱和、窄幅映射压反差，满山的橙黄不再刺眼，像一卷放久了的老胶片。',
    cover: coverFor('insp-fadedfilm', ['#E4DDD2', '#C4B8A8', '#A0917E', '#78685A', '#4E4238']),
  },
  {
    id: 'insp-canyon', title: '赭石温泉', scene: '热泉边的矿物滩',
    hex: '#9C4A2F', blend: 'overlay', strength: 48, range: [1, 9],
    note: '叠加赭红压进暗部，矿物滩的橙红更厚重，和中间的蓝绿泉水拉开层次。',
    cover: coverFor('insp-canyon', ['#E6C8A8', '#D08858', '#A85838', '#743420', '#421C10']),
  },
];
