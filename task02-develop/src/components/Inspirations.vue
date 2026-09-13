<script setup lang="ts">
/**
 * Inspirations.vue — 灵感库
 *
 * 精选调色范例的网格。点"套用"把这套参数搬到调色台,作用到用户自己的照片上。
 * 若用户还没上传照片,套用后引导他去调色台上传。
 *
 * 卡片上那条色带不只是装饰:映射区间外的台阶被压暗,
 * 区间是看出来的,不是再用一串数字说一遍——和调色台的刻度尺同一套语言。
 */
import { INSPIRATIONS, type Inspiration } from '@/inspirations';
import { BLEND_LABELS } from '@/render/pipeline';
import { generatePalette } from '@palette/palette';

defineProps<{ hasImage: boolean }>();
const emit = defineEmits<{ (e: 'apply', i: Inspiration): void }>();

function rampOf(hex: string) {
  return generatePalette(hex, 'light')?.brand ?? [];
}
</script>

<template>
  <div class="insp">
    <h2 class="sr-only">灵感</h2>
    <p class="lead dim">
      开箱即有的调色范例。选一个套用到你的照片上——每个范例是一套色调、混合模式与映射区间的组合。
    </p>

    <div class="grid">
      <article v-for="i in INSPIRATIONS" :key="i.id" class="card">
        <div class="cover">
          <img
            :src="i.cover" :alt="`${i.title}：${i.scene}`" loading="lazy" decoding="async"
            :style="i.coverPosition ? { objectPosition: i.coverPosition } : undefined"
          />
          <span class="scene">{{ i.scene }}</span>
        </div>

        <!-- 色带:亮着的台阶就是这套范例用到的映射区间 -->
        <div class="ramp" role="img" :aria-label="`映射区间 ${i.range[0]} 到 ${i.range[1]}`">
          <i
            v-for="s in rampOf(i.hex)" :key="s.index"
            :class="{ off: s.index < i.range[0] || s.index > i.range[1] }"
            :style="{ background: s.hex }"
          />
        </div>

        <div class="body">
          <div class="h">
            <h3>{{ i.title }}</h3>
            <span class="meta">
              <span>{{ BLEND_LABELS[i.blend] }}</span>
              <span class="mono">{{ i.strength }}%</span>
            </span>
          </div>
          <p class="note dim">{{ i.note }}</p>
          <t-button size="small" theme="primary" variant="outline" block @click="emit('apply', i)">
            套用到我的照片
          </t-button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.lead { font-size: var(--t-body); margin: 0 auto var(--s-10); max-width: 60ch; line-height: 1.7; text-align: center; }
.grid { display: grid; gap: var(--s-8); grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
/* 范例是 6 个:宽屏下 auto-fill 会排成 5+1,最后一张落单。够宽时固定 3 列,排成 3×2 */
@media (min-width: 1100px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}

/* 卡片不投影、不浮起:悬停只让描边亮起来 */
.card {
  border: 1px solid var(--td-component-stroke); border-radius: var(--r-panel); overflow: hidden;
  background: var(--td-bg-color-container); transition: border-color var(--ease);
  /* 同一排卡片等高,说明文字长短不一时按钮仍对齐在卡片底部 */
  display: flex; flex-direction: column;
}
.card:hover { border-color: var(--td-brand-color); }

/* 卡片是纵向 flex:封面若由图片撑高,竖拍照片会把框撑成原图比例。
   图片绝对定位后不参与高度计算,框的高度只由 4:3 决定 */
.cover { position: relative; aspect-ratio: 4 / 3; background: var(--stage); flex: none; }
.cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.scene {
  position: absolute; left: var(--s-2); bottom: var(--s-2);
  font-size: var(--t-micro); color: #fff; padding: 2px 6px; border-radius: var(--r-ctl);
  background: rgba(0, 0, 0, .45); backdrop-filter: blur(4px);
}

.ramp { display: flex; }
.ramp i { flex: 1; height: 5px; transition: opacity var(--ease); }
.ramp i.off { opacity: .2; }

.body { padding: var(--s-3) var(--s-3) var(--s-4); flex: 1; display: flex; flex-direction: column; }
.h { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-2); flex-wrap: wrap; }
.h h3 { font-size: var(--t-title); font-weight: 600; letter-spacing: -.01em; margin: 0; }

/* 读数条:不用中点串接,靠间距和等宽数字分开 */
.meta { display: flex; align-items: baseline; gap: var(--s-2); font-size: var(--t-micro); color: var(--td-text-color-secondary); }

.note { font-size: var(--t-small); line-height: 1.6; margin: var(--s-1) 0 var(--s-3); flex: 1; }
.dim { color: var(--td-text-color-secondary); }
</style>
