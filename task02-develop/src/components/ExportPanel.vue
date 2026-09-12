<script setup lang="ts">
/**
 * ExportPanel.vue — 导出面板
 *
 * 两种导出:
 *   照片 —— 用原图尺寸重新渲染(见 useImage.exportBlob),不是放大预览图
 *   色阶 —— 当前色阶导成 TDesign Design Token(CSS 变量 / JSON),用 Task 01 的能力
 *
 * 第二种是这个产品和 Task 01 咬合最紧的地方:你在照片上调出来的色调,
 * 可以直接变成一套能贴进 TDesign 项目的主题。滤镜和主题是同一条色阶。
 */
import { computed, ref } from 'vue';
import type { Palette } from '@palette/palette';
import { toCssVariables, toTokenJson } from '@palette/tokens';
import { MessagePlugin } from 'tdesign-vue-next';

const props = defineProps<{
  visible: boolean;
  palette: Palette | null;
  canExportImage: boolean;
  exportImage: () => void;
}>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();
const DRAWER_W = '480px';

const drawerSize = computed(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : DRAWER_W));

const format = ref<'css' | 'json'>('css');

const text = computed(() => {
  if (!props.palette) return '';
  return format.value === 'css'
    ? toCssVariables(props.palette)
    : JSON.stringify(toTokenJson(props.palette), null, 2);
});

function copy() {
  navigator.clipboard.writeText(text.value)
    .then(() => MessagePlugin.success('已复制'))
    .catch(() => MessagePlugin.error('复制失败'));
}

function downloadTokens() {
  const blob = new Blob([text.value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = format.value === 'css' ? 'theme-tokens.css' : 'theme-tokens.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <t-drawer
    :visible="props.visible" :size="drawerSize" header="导出"
    :footer="false" @close="emit('update:visible', false)"
  >
    <div class="sec">
      <h3 class="sec-t">照片</h3>
      <p class="muted">按原图尺寸重新渲染导出,不是放大预览图。</p>
      <t-button theme="primary" :disabled="!props.canExportImage" @click="props.exportImage">
        导出照片
      </t-button>
    </div>

    <t-divider />

    <div class="sec">
      <h3 class="sec-t">色阶 → Design Token</h3>
      <p class="muted">
        你在照片上调出的色调,就是一套能贴进 TDesign 项目的主题。
        滤镜和主题是同一条色阶。
      </p>
      <t-radio-group v-model="format" variant="default-filled" size="small" style="margin-bottom: 12px">
        <t-radio-button value="css">CSS 变量</t-radio-button>
        <t-radio-button value="json">JSON</t-radio-button>
      </t-radio-group>
      <pre class="code">{{ text }}</pre>
      <t-space style="margin-top: 12px">
        <t-button variant="outline" @click="copy">复制</t-button>
        <t-button variant="outline" @click="downloadTokens">下载文件</t-button>
      </t-space>
    </div>
  </t-drawer>
</template>

<style scoped>
.sec-t { font-size: var(--t-title); font-weight: 600; letter-spacing: -.01em; margin: 0 0 var(--s-1); }
.muted { color: var(--td-text-color-secondary); font-size: var(--t-small); margin: 0 0 var(--s-3); line-height: 1.6; }
.code {
  font-family: var(--font-mono); font-size: var(--t-micro);
  font-variant-numeric: tabular-nums;
  line-height: 1.6; margin: 0; padding: var(--s-3); max-height: 320px; overflow: auto;
  background: var(--td-bg-color-secondarycontainer);
  border: 1px solid var(--td-component-stroke); border-radius: var(--r-ctl);
  white-space: pre; color: var(--td-text-color-primary);
}
</style>
