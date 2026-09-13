<script setup lang="ts">
/**
 * ProfilePanel.vue — 个人中心
 *
 * 昵称、头像、默认偏好。头像不是上传的图片,而是从内置几何符号里选一个,
 * 背景色取用户当前的调色色调——让头像也和"调色"这件事产生关联,
 * 而不是一个与产品无关的通用上传控件。
 *
 * 头图不用装饰性渐变:底是暗房台面,底边压一条用户当前的十阶色带,
 * 像相纸下沿贴的那张色卡。用的是产品自己的材料,不是随便一道颜色过渡。
 *
 * profile 直接从 useProfile() 取(模块级单例),不再当 prop 传进来后就地改写——
 * 改 props 是 Vue 的反模式,而且 vue-tsc 查不出来。
 */
import { computed } from 'vue';
import { AVATARS, useProfile } from '@/composables/useProfile';
import { generatePalette } from '@palette/palette';

const props = defineProps<{ accent: string; workCount: number }>();

const { profile } = useProfile();

/** 头图底边那条色带 —— 就是用户此刻在调色台上用的那条 */
const ramp = computed(() => generatePalette(props.accent, 'light')?.brand ?? []);

// 头像图形:每个是一段简单的 SVG path,统一 24×24 视框
const GLYPHS: Record<string, string> = {
  aperture: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 3l3 5h-6l3-5zm-5.2 3L12 8 9 13l-5.2-.9A8 8 0 016.8 8zm10.4 0a8 8 0 013 4.1L15 13l-3-5 5.2.1zM6 15l6 .1 3 5.1A8 8 0 016 15zm12 0a8 8 0 01-9 5.2L12 15h6z',
  mountain: 'M3 20l6-11 4 6 2-3 6 8H3z',
  wave: 'M2 12c3-4 5-4 8 0s5 4 8 0M2 17c3-4 5-4 8 0s5 4 8 0',
  leaf: 'M4 20C4 9 12 4 20 4c0 11-8 16-16 16zm3-3c5-1 9-5 10-9',
  prism: 'M12 3L3 19h18L12 3zm0 5v11',
  moon: 'M15 3a9 9 0 100 18 7 7 0 010-18z',
};

/** 读屏要念的是「光圈」,不是内部键名 aperture */
const GLYPH_NAMES: Record<string, string> = {
  aperture: '光圈',
  mountain: '山',
  wave: '水波',
  leaf: '叶',
  prism: '棱镜',
  moon: '月',
};
</script>

<template>
  <div class="profile">
    <h2 class="sr-only">我的</h2>

    <div class="card">
      <div class="hero">
        <div class="avatar" :style="{ background: props.accent }">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <path :d="GLYPHS[profile.avatar] || GLYPHS.aperture" />
          </svg>
        </div>
        <div class="who">
          <strong>{{ profile.name || '未命名摄影师' }}</strong>
          <span class="mono">{{ props.workCount }} 张作品</span>
        </div>
        <div class="hero-ramp" aria-hidden="true">
          <i v-for="s in ramp" :key="s.index" :style="{ background: s.hex }" />
        </div>
      </div>

      <div class="fields">
        <label class="field">
          <span>昵称</span>
          <t-input v-model="profile.name" placeholder="给自己起个名字" :maxlength="20" autocomplete="nickname" />
        </label>

        <div class="field">
          <span id="avatar-h">头像</span>
          <div class="glyphs" role="radiogroup" aria-labelledby="avatar-h">
            <button
              v-for="g in AVATARS" :key="g"
              class="glyph" :class="{ on: profile.avatar === g }"
              role="radio" :aria-checked="profile.avatar === g"
              :aria-label="GLYPH_NAMES[g] ?? g" @click="profile.avatar = g"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
                <path :d="GLYPHS[g]" />
              </svg>
            </button>
          </div>
        </div>

        <label class="field row">
          <span>载入照片后自动套用第一条候选</span>
          <t-switch v-model="profile.autoApply" />
        </label>
      </div>
    </div>

    <p class="note dim tiny">
      个人设置保存在这台设备的浏览器里，不上传服务器，也不跨设备同步。
    </p>
  </div>
</template>

<style scoped>
/* 个人卡片落在中轴上 */
.profile { max-width: 560px; margin: 0 auto; }
.card { border: 1px solid var(--td-component-stroke); border-radius: var(--r-panel); overflow: hidden; background: var(--td-bg-color-container); }

/* 头图:暗房台面当底,底边贴一条真实色带 */
.hero {
  position: relative;
  padding: var(--s-6) var(--s-6) var(--s-8);
  display: flex; align-items: center; gap: var(--s-4);
  background: var(--stage);
}
.hero-ramp { position: absolute; left: 0; right: 0; bottom: 0; display: flex; height: 6px; }
.hero-ramp i { flex: 1; }

.avatar {
  width: 56px; height: 56px; border-radius: var(--r-panel); flex: none;
  display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2);
}
.who { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.who strong {
  font-size: var(--t-title); font-weight: 600; color: #fff;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.who span { font-size: var(--t-small); color: var(--stage-ink-dim); }

.fields { padding: var(--s-5) var(--s-5); display: flex; flex-direction: column; gap: var(--s-4); }
.field { display: flex; flex-direction: column; gap: var(--s-2); }
.field > span { font-size: var(--t-base); color: var(--td-text-color-secondary); }
.field.row { flex-direction: row; align-items: center; justify-content: space-between; }

.glyphs { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.glyph {
  width: 40px; height: 40px; border-radius: var(--r-ctl); cursor: pointer;
  border: 1px solid var(--td-component-stroke); background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary);
  display: flex; align-items: center; justify-content: center;
  transition: color var(--ease), border-color var(--ease), background-color var(--ease);
}
.glyph:hover { color: var(--td-brand-color); border-color: var(--td-brand-color); }
.glyph.on { color: #fff; background: var(--td-brand-color); border-color: var(--td-brand-color); }

/* 说明文字浮在背景上,放进一块宽度随内容的磨砂玻璃 */
.note {
  margin: var(--s-4) auto 0; width: fit-content; text-align: center;
  padding: var(--s-2) var(--s-4); border-radius: var(--r-panel);
  background: var(--glass); border: 1px solid var(--glass-edge);
  backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
}
.dim { color: var(--td-text-color-secondary); }
.tiny { font-size: var(--t-micro); }
</style>
