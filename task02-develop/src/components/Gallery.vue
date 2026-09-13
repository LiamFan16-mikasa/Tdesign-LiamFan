<script setup lang="ts">
/**
 * Gallery.vue — 作品集(底片库)
 *
 * 用户调过的照片以缩略图网格呈现,像摄影师的底片库。
 * 点一张可把它的全套调色参数还原到调色台。
 */
import type { Work } from '@/composables/useGallery';
import { BLEND_LABELS } from '@/render/pipeline';
import emptyArt from '@/assets/brand/empty-gallery.png';

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
    <div v-if="!props.ready" class="loading on-dark">
      <t-loading size="small" text="正在读取作品集…" />
    </div>

    <!-- TDesign 的 title 为空时会回退成默认的「暂无数据」,所以要给一个真标题,描述只说下一步 -->
    <t-empty
      v-else-if="!props.works.length"
      class="on-dark"
      title="还没有作品"
      description="在调色台调出满意的一版，点「存入作品集」。"
    >
      <!-- 空画架插图(Miora 绘制),纯装饰 -->
      <template #image><img class="empty-art" :src="emptyArt" alt="" /></template>
    </t-empty>

    <div v-else class="grid on-dark">
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
/* 面板至少占半屏多一点:读库中与空状态放在这块区域的正中,不贴着导航 */
.gallery { min-height: 56vh; display: flex; flex-direction: column; }
.loading, .gallery > .t-empty { margin: auto; padding: var(--s-10) var(--s-16); }
/* TDesign 空状态说明默认用占位色(40% 黑),在玻璃面板上对比度不到 4.5,改用次要文字色 */
.gallery > .t-empty :deep(.t-empty__description) { color: var(--td-text-color-secondary); }
/* TDesign 的标题默认和说明同为次要色,分不出主次:标题用主文字色 */
.gallery > .t-empty :deep(.t-empty__title) { color: var(--td-text-color-primary); font-weight: 500; }
/* 画架是竖长构图,比预设库的活页夹高一些,两张画面分量才相当 */
.empty-art { display: block; height: 150px; width: auto; margin-bottom: var(--s-5); }
/* 读库提示、空状态和作品网格都浮在背景上,放进磨砂玻璃 */
.loading, .gallery > .t-empty, .grid {
  border-radius: var(--r-panel);
  background: var(--glass); border: 1px solid var(--glass-edge);
  backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
}
.loading { display: flex; justify-content: center; }
.grid { display: grid; gap: var(--s-6); grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); padding: var(--s-6); }
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
