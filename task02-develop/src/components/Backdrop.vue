<script setup lang="ts">
/**
 * Backdrop.vue — 整页流动的色彩背景
 *
 * 背景就是「正在调色的那张照片」:
 *   没放照片时,把示例照片一张张轮播(约 9 秒换一张,淡入淡出);
 *   放上照片后,调色画布每渲染一次就同步过来,换色调、拖强度,整页的氛围跟着变。
 *
 * 只画到一张 96×60 的小画布上,再用 CSS 放大、强模糊、提饱和——
 * 看不出照片内容,只留颜色氛围;小画布同步一次几乎不花时间,不拖慢调色渲染。
 * 系统开启「减少动态效果」时,停止漂移和轮播,只留静止背景。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  /** 调色台上正在渲染的画布;放上照片后背景从这里取色 */
  source: HTMLCanvasElement | null;
  /** 画布每渲染一次加一,背景据此同步 */
  version: number;
  /** 是否已经放上照片 */
  photo: boolean;
  /** 没放照片时轮播的示例图地址 */
  samples: string[];
  /**
   * 工作状态:照片已在调色台上。
   * 调色时周围的颜色会改变人对照片颜色的感知,所以背景要退成接近中性的深色、停止漂移;
   * 离开调色台或还没放照片时回到鲜艳流动的展示状态。
   */
  working: boolean;
}>();

const W = 96;
const H = 60;
const SLIDE_MS = 9000;
const FADE_MS = 1200;

const canvas = ref<HTMLCanvasElement | null>(null);
const sampleIndex = ref(0);
const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const slideshowOn = computed(() => !props.photo && !reduced && props.samples.length > 1);

/* ------------------------------ 绘制 ------------------------------ */

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

function ctx2d(): CanvasRenderingContext2D | null {
  return canvas.value?.getContext('2d', { willReadFrequently: true }) ?? null;
}

/** 按 cover 方式铺满小画布 */
function cover(c: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, alpha: number) {
  if (!sw || !sh) return;
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s;
  const dh = sh * s;
  c.globalAlpha = alpha;
  c.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  c.globalAlpha = 1;
}

/* ---------------------------- 示例轮播 ---------------------------- */

let timer = 0;
let fadeFrame = 0;
/** 淡入时先把当前画面存一份,每帧先画旧图、再按比例叠新图 */
const prev = document.createElement('canvas');
prev.width = W;
prev.height = H;

async function showSample(i: number, fade: boolean) {
  const url = props.samples[i];
  if (!url) return;
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    return;
  }
  const c = ctx2d();
  if (!c || props.photo) return;

  sampleIndex.value = i;
  cancelAnimationFrame(fadeFrame);
  if (!fade) {
    c.clearRect(0, 0, W, H);
    cover(c, img, img.naturalWidth, img.naturalHeight, 1);
    return;
  }

  const pc = prev.getContext('2d')!;
  pc.clearRect(0, 0, W, H);
  pc.drawImage(canvas.value!, 0, 0);
  const t0 = performance.now();
  const step = (now: number) => {
    if (props.photo) return;
    const t = Math.min(1, (now - t0) / FADE_MS);
    c.clearRect(0, 0, W, H);
    c.drawImage(prev, 0, 0);
    cover(c, img, img.naturalWidth, img.naturalHeight, t);
    if (t < 1) fadeFrame = requestAnimationFrame(step);
  };
  fadeFrame = requestAnimationFrame(step);
}

function stopSlideshow() {
  if (timer) {
    window.clearInterval(timer);
    timer = 0;
  }
  cancelAnimationFrame(fadeFrame);
}

function startSlideshow() {
  stopSlideshow();
  if (!slideshowOn.value) return;
  timer = window.setInterval(() => showSample((sampleIndex.value + 1) % props.samples.length, true), SLIDE_MS);
}

/* ---------------------------- 跟随调色 ---------------------------- */

function syncPhoto() {
  const c = ctx2d();
  const s = props.source;
  if (!c || !s || !props.photo) return;
  c.clearRect(0, 0, W, H);
  cover(c, s, s.width, s.height, 1);
}

watch(() => props.version, syncPhoto);
watch(
  () => props.photo,
  (on) => {
    if (on) {
      stopSlideshow();
      syncPhoto();
    } else {
      showSample(0, false);
      startSlideshow();
    }
  },
);

onMounted(() => {
  if (props.photo) syncPhoto();
  else {
    showSample(0, false);
    startSlideshow();
  }
});
onBeforeUnmount(stopSlideshow);
</script>

<template>
  <div class="backdrop-wrap" :class="{ working: props.working }" aria-hidden="true">
    <canvas
      ref="canvas" class="backdrop" :width="W" :height="H"
      :data-source="props.photo ? 'photo' : 'samples'"
      :data-sample-index="sampleIndex"
      :data-slideshow="slideshowOn ? 'on' : 'off'"
      :data-mode="props.working ? 'working' : 'showcase'"
    />
    <div class="scrim" />
  </div>
</template>

<style scoped>
.backdrop-wrap {
  position: fixed; inset: 0; z-index: -1; overflow: hidden;
  background: #1b1e24;
}

/* 小画布放大到比视口还大一圈:模糊后边缘不会露出底色 */
.backdrop {
  position: absolute; left: -12%; top: -12%; width: 124%; height: 124%;
  filter: blur(56px) saturate(1.35);
  transform-origin: 50% 50%;
  animation: drift 40s ease-in-out infinite alternate;
  transition: filter .8s ease;
}

/* 工作状态:去掉大部分饱和度并压暗,台面四周接近中性;漂移原地暂停,不会跳回起点 */
.working .backdrop {
  filter: blur(56px) saturate(.25) brightness(.55);
  animation-play-state: paused;
}

/* 流动感:缓慢放大并平移,一个来回约 40 秒 */
@keyframes drift {
  from { transform: scale(1) translate3d(0, 0, 0); }
  to { transform: scale(1.12) translate3d(-3%, 2%, 0); }
}

/* 暗色遮罩:页头与导航所在的顶部更暗,保证白字清楚;往下渐浅,让颜色透出来 */
.scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg,
    rgba(8, 10, 14, .64) 0,
    rgba(8, 10, 14, .56) 280px,
    rgba(8, 10, 14, .36) 560px,
    rgba(8, 10, 14, .30) 100%);
}
.working .scrim { background: rgba(8, 10, 14, .72); }

@media (prefers-reduced-motion: reduce) {
  .backdrop { animation: none; }
}
</style>
