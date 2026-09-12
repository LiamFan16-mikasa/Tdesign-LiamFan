<script setup lang="ts">
/**
 * CvdCheck.vue — 色觉友好度检查
 *
 * 一个抽屉。打开时把当前调色结果套上四种色觉模拟并排展示。
 *
 * 为什么风光调色需要这个:风光片常靠红绿对比撑画面(夕阳配树林、红叶配绿松),
 * 而这个对比在红绿色觉障碍者眼里可能整个塌掉。约 8% 的男性有红绿色觉障碍。
 * 摄影师几乎不会想到这一层——这一屏就是把它变成看得见的事。
 *
 * 模拟只在抽屉打开时跑一次,不进实时渲染循环。它是旁路视图,不是常驻滤镜。
 */
import { computed, ref, watch } from 'vue';

import { simulateImage } from '@/render/cvdCanvas';
import { CVD_LABELS, type CvdType } from '@palette/cvd';

const DRAWER_W = '560px';
const props = defineProps<{ visible: boolean; snapshot: () => ImageData | null }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const drawerSize = computed(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : DRAWER_W));

const TYPES: CvdType[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

/** 说明拆成「是什么」和「有多少人」两栏,不用中点串成一句 —— 发生率是读数,走等宽 */
const NOTES: Record<CvdType, { what: string; rate: string }> = {
  none: { what: '你现在看到的样子', rate: '' },
  protanopia: { what: '红色感知缺失', rate: '男性约 1%' },
  deuteranopia: { what: '绿色感知缺失,最常见', rate: '男性约 6%' },
  tritanopia: { what: '蓝黄感知缺失', rate: '罕见' },
  achromatopsia: { what: '完全无色觉,只剩明暗', rate: '' },
};

const canvases = ref<Record<string, HTMLCanvasElement | null>>({});

function renderAll() {
  const src = props.snapshot();
  if (!src) return;
  for (const type of TYPES) {
    const cv = canvases.value[type];
    if (!cv) continue;
    cv.width = src.width;
    cv.height = src.height;
    const ctx = cv.getContext('2d');
    if (!ctx) continue;
    const dst = ctx.createImageData(src.width, src.height);
    simulateImage(src, dst, type);
    ctx.putImageData(dst, 0, 0);
  }
}

// 抽屉打开时才渲染,关掉不占算力
watch(() => props.visible, (v) => { if (v) requestAnimationFrame(renderAll); });
</script>

<template>
  <t-drawer
    :visible="props.visible" :size="drawerSize" header="色觉友好度检查"
    :footer="false" @close="emit('update:visible', false)"
  >
    <p class="intro">
      风光片常靠红绿对比撑画面。约 8% 的男性有红绿色觉障碍,
      在他们眼里这种对比可能整个塌掉。下面是当前调色结果在四种色觉下的样子。
    </p>
    <div class="list">
      <figure v-for="type in TYPES" :key="type">
        <canvas :ref="(el: any) => (canvases[type] = el)" />
        <figcaption>
          <b>{{ CVD_LABELS[type] }}</b>
          <span class="what">{{ NOTES[type].what }}</span>
          <span v-if="NOTES[type].rate" class="rate">{{ NOTES[type].rate }}</span>
        </figcaption>
      </figure>
    </div>
  </t-drawer>
</template>

<style scoped>
.intro { color: var(--td-text-color-secondary); font-size: var(--t-base); margin: 0 0 var(--s-4); line-height: 1.7; }
.list { display: flex; flex-direction: column; gap: var(--s-4); }
figure { margin: 0; }

/* 模拟图也是相纸,但这里并排比对,投影会干扰判色 —— 只用描边 */
figure canvas {
  width: 100%; height: auto; display: block; border-radius: var(--r-ctl);
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-secondarycontainer);
}

figcaption { display: flex; align-items: baseline; gap: var(--s-2); margin-top: 7px; flex-wrap: wrap; }
figcaption b { font-size: var(--t-base); font-weight: 600; }
.what { font-size: var(--t-small); color: var(--td-text-color-secondary); }
.rate {
  font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  font-size: var(--t-micro); color: var(--td-text-color-placeholder);
  margin-left: auto;
}
</style>
