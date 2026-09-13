<script setup lang="ts">
/**
 * PresetLibrary.vue — 预设库
 *
 * 卡片网格，每张卡片是一套调色配置：封面缩略图、名字、那条色阶、混合模式与强度。
 * 点卡片直接套用回调色台。
 */
import { ref } from 'vue';
import type { Preset } from '@/composables/usePresets';
import { BLEND_LABELS } from '@/render/pipeline';
import { generatePalette } from '@palette/palette';

const props = defineProps<{
  presets: Preset[];
  keyword: string;
  error: string;
}>();

const emit = defineEmits<{
  (e: 'update:keyword', v: string): void;
  (e: 'apply', p: Preset): void;
  (e: 'remove', id: string): void;
  (e: 'rename', id: string, name: string): void;
}>();

const editing = ref<string | null>(null);
const draft = ref('');

function startRename(p: Preset) {
  editing.value = p.id;
  draft.value = p.name;
}
function commitRename(id: string) {
  emit('rename', id, draft.value);
  editing.value = null;
}

/** 卡片上那条色带 —— 直接由预设的主色重新生成，不用把十个色值存进 localStorage */
function rampOf(hex: string) {
  return generatePalette(hex, 'light')?.brand ?? [];
}
</script>

<template>
  <div class="lib">
    <h2 class="sr-only">预设库</h2>
    <div class="lib-bar">
      <t-input
        :value="props.keyword" clearable
        placeholder="搜索名字或色值" style="width: 360px"
        aria-label="在预设库里搜索" autocomplete="off"
        @change="(v: unknown) => emit('update:keyword', String(v ?? ''))"
      />
      <span class="muted tiny mono">{{ props.presets.length }} 个预设</span>
    </div>

    <t-alert v-if="props.error" theme="warning" :message="props.error" style="margin-bottom: 14px" />

    <!-- presets 是搜索过滤后的列表:搜不到和一个都没有要分开说,否则有预设时搜空了也显示「还没有预设」 -->
    <t-empty
      v-if="!props.presets.length"
      :title="props.keyword ? '没有匹配的预设' : '还没有预设'"
      :description="props.keyword ? '换个名字或色值试试，或清空搜索框。' : '在调色台调出满意的效果后，点「存为预设」。'"
    />

    <div v-else class="grid">
      <article v-for="p in props.presets" :key="p.id" class="card">
        <button class="cover" :aria-label="`套用 ${p.name}`" @click="emit('apply', p)">
          <img v-if="p.thumb" :src="p.thumb" :alt="p.name" loading="lazy" decoding="async" />
          <span v-else class="nocover" :style="{ background: p.hex }" />
        </button>

        <div class="ramp">
          <i v-for="s in rampOf(p.hex)" :key="s.index" :style="{ background: s.hex }" />
        </div>

        <div class="meta">
          <t-input
            v-if="editing === p.id" v-model="draft" size="small" autofocus
            :maxlength="24" aria-label="重命名这个预设" autocomplete="off"
            @blur="commitRename(p.id)" @enter="commitRename(p.id)"
          />
          <button v-else class="name" @click="startRename(p)">{{ p.name }}</button>

          <div class="tags">
            <t-tag size="small" variant="light">{{ BLEND_LABELS[p.blend] }}</t-tag>
            <t-tag size="small" variant="outline">{{ p.strength }}%</t-tag>
            <span class="grow" />
            <t-popconfirm content="删掉这个预设？" @confirm="emit('remove', p.id)">
              <t-button size="small" variant="text" theme="danger">删除</t-button>
            </t-popconfirm>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* 面板至少占半屏多一点;搜索框与计数沿中轴排列,空状态放在余下区域的正中 */
.lib { min-height: 56vh; display: flex; flex-direction: column; }
.lib > .t-empty { margin: auto; }
.lib-bar { display: flex; flex-direction: column; align-items: center; gap: var(--s-2); margin-bottom: var(--s-10); }
.grow { flex: 1; }
.muted { color: var(--td-text-color-secondary); }
.tiny { font-size: var(--t-micro); }

.grid { display: grid; gap: var(--s-6); grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }

.card {
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--r-panel); overflow: hidden;
  transition: border-color var(--ease);
}
.card:hover { border-color: var(--td-brand-color); }

.cover {
  display: block; width: 100%; padding: 0; border: 0; cursor: pointer;
  aspect-ratio: 4 / 3; background: var(--td-bg-color-secondarycontainer);
}
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover:focus-visible { outline-offset: -2px; }
.nocover { display: block; width: 100%; height: 100%; }

.ramp { display: flex; }
.ramp i { flex: 1; height: 5px; }

.meta { padding: var(--s-2) var(--s-3) var(--s-3); }
.name {
  display: block; width: 100%; text-align: left; padding: 0;
  border: 0; background: none; cursor: text;
  font: inherit; font-size: var(--t-base); font-weight: 500;
  color: var(--td-text-color-primary); transition: color var(--ease);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.name:hover { color: var(--td-brand-color); }

.tags { display: flex; align-items: center; gap: 6px; margin-top: var(--s-2); }
</style>
