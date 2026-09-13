<script setup lang="ts">
/**
 * Gallery.vue — 作品集(底片库)
 *
 * 用户调过的照片以缩略图网格呈现,像摄影师的底片库。
 * 点一张可把它的全套调色参数还原到调色台。
 */
import type { Work } from '@/composables/useGallery';
import { BLEND_LABELS } from '@/render/pipeline';

const props = defineProps<{ works: Work[]; ready: boolean; error: string }>();
const emit = defineEmits<{
  (e: 'apply', w: Work): void;
  (e: 'remove', id: string): void;
}>();
</script>

<template>
  <div class="gallery">
    <h2 class="sr-only">作品集</h2>
    <t-alert v-if="props.error" theme="warning" :message="props.error" style="margin-bottom: 16px" />

    <!-- 三态要分开:读库中 / 读完没有 / 有作品。
         之前没有「读库中」这一态，IndexedDB 还没返回时会落进 v-else 渲染出一个空网格，整页空白 -->
    <div v-if="!props.ready" class="loading">
      <t-loading size="small" text="正在读取作品集…" />
    </div>

    <!-- TDesign 的 title 为空时会回退成默认的「暂无数据」,所以要给一个真标题,描述只说下一步 -->
    <t-empty
      v-else-if="!props.works.length"
      title="还没有作品"
      description="在调色台调出满意的一版，点「存入作品集」。"
    />

    <div v-else class="grid">
      <figure v-for="w in props.works" :key="w.id" class="work">
        <button class="frame" :aria-label="`还原 ${w.title || '这张作品'}`" @click="emit('apply', w)">
          <img :src="w.thumb" :alt="w.title || '作品'" loading="lazy" decoding="async" />
          <span class="swatch" :style="{ background: w.hex }"></span>
        </button>
        <figcaption>
          <span class="ttl">{{ w.title || '未命名' }}</span>
          <span class="meta">
            <span>{{ BLEND_LABELS[w.blend] }}</span>
            <span class="mono">{{ w.strength }}%</span>
            <span class="mono">{{ w.range[0] }}–{{ w.range[1] }}</span>
          </span>
          <t-popconfirm content="从作品集删除?" @confirm="emit('remove', w.id)">
            <button class="del" aria-label="删除">×</button>
          </t-popconfirm>
        </figcaption>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.loading { padding: var(--s-8) 0; display: flex; justify-content: center; }
.grid { display: grid; gap: var(--s-4); grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.work { margin: 0; }

/* 缩略图是相纸,允许投影(全站只有照片投影);悬停不位移,只亮描边 */
.frame {
  display: block; width: 100%; padding: 0; cursor: pointer;
  position: relative; aspect-ratio: 4 / 3; border-radius: var(--r-panel); overflow: hidden;
  background: var(--stage); box-shadow: var(--lift-thumb);
  border: 1px solid transparent;
  transition: border-color var(--ease);
}
.frame:hover { border-color: var(--td-brand-color); }
.frame:focus-visible { outline-offset: 2px; }
.frame img { width: 100%; height: 100%; object-fit: cover; display: block; }

.swatch {
  position: absolute; left: var(--s-2); bottom: var(--s-2); width: 18px; height: 18px;
  border-radius: var(--r-ctl); box-shadow: 0 0 0 2px rgba(255, 255, 255, .85);
}

figcaption { display: flex; align-items: baseline; gap: var(--s-2); margin-top: var(--s-2); }
.ttl {
  font-size: var(--t-base); font-weight: 500; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 读数条:不用中点串接,靠间距和等宽数字分开 */
.meta { display: flex; align-items: baseline; gap: var(--s-2); flex: 1; min-width: 0; font-size: var(--t-micro); color: var(--td-text-color-secondary); }

.del {
  font-size: var(--t-title); line-height: 1; padding: 0 var(--s-1); border: 0; background: none;
  color: var(--td-text-color-placeholder); cursor: pointer; transition: color var(--ease);
}
.del:hover { color: var(--td-error-color); }
</style>
