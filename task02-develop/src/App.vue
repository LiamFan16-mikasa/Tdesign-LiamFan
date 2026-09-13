<script setup lang="ts">
/**
 * App.vue — 显影台
 *
 * 传一张风光照，选一个色调，照片按这个色调重新上色，界面也同时穿上这个色调。
 * 界面的颜色永远等于当前正在调的色调——你在判断这个色调好不好看的时候，
 * 界面本身就是这个色调最大的一块样本。
 */
import { ref, computed, watch } from 'vue';
import { useTheme } from './composables/useTheme';
import { useImage } from './composables/useImage';
import { BLEND_LABELS, type BlendMode } from './render/pipeline';
import { candidatesFrom, type Candidate } from './extract';
import { usePresets, type Preset } from './composables/usePresets';
import { useGallery, type Work } from './composables/useGallery';
import { useProfile } from './composables/useProfile';
import { useTabRoute, TABS, TAB_LABELS } from './composables/useTabRoute';
import PresetLibrary from './components/PresetLibrary.vue';
import Gallery from './components/Gallery.vue';
import Inspirations from './components/Inspirations.vue';
import { INSPIRATIONS, type Inspiration } from './inspirations';
import { generatePalette } from '@palette/palette';
import ProfilePanel from './components/ProfilePanel.vue';
import CvdCheck from './components/CvdCheck.vue';
import ExportPanel from './components/ExportPanel.vue';
import Backdrop from './components/Backdrop.vue';
import { MessagePlugin } from 'tdesign-vue-next';

const { raw, palette, valid } = useTheme();

const blend = ref<BlendMode>('softLight');
const strength = ref(45);
const comparing = ref(false);

/**
 * 取色阶的哪一段做映射。
 * 全幅度 1–10 对比度拉满；窄幅（如 4–7）让暗部停在中深色、高光停在中浅色，
 * 也就是提亮的黑场加压低的高光——哑光与褪色胶片质感就是这么来的。
 */
const range = ref<[number, number]>([1, 10]);

const RANGE_PRESETS: Array<{ name: string; v: [number, number]; note: string }> = [
  { name: '全幅', v: [1, 10], note: '暗部到近黑、高光到近白，对比度最强' },
  { name: '哑光', v: [3, 9], note: '略微提亮黑场，收一点高光' },
  { name: '褪色', v: [4, 8], note: '典型的褪色胶片，反差明显变平' },
  { name: '中段', v: [4, 7], note: '只取中间四阶，最平最柔' },
];

const ramp = computed(() => palette.value?.brand);

/**
 * 从当前照片派生的候选色调。上传前为空,上传后由 extract 分析生成。
 * 八个固定色调被这一组取代——照片自己决定色调,而不是让用户从预设里猜。
 */
const candidates = ref<Candidate[]>([]);
const analyzing = ref(false);

/* ------------------------- 空台面:示例印样 ------------------------- */

/** 空台面上每张示例小样底边的色阶,按示例主色生成一次 */
const SAMPLE_RAMPS = INSPIRATIONS.map((i) => generatePalette(i.hex, 'light')?.brand ?? []);

/** 没放照片时整页背景轮播用的示例图 */
const SAMPLE_COVERS = INSPIRATIONS.map((i) => i.cover);

/**
 * 从示例小样放上台面时记下是哪一张。
 * 载入完成后的下一帧会「自动套用第一条候选色」,那一帧里要改为套用示例自己的参数,否则会被覆盖。
 */
let pendingSample: Inspiration | null = null;
const sampleLoading = ref(false);

/** 拖着文件经过台面时亮起描边。进入子元素也会触发 dragleave,所以要判断是不是真的离开了台面 */
const dragging = ref(false);
function onDragLeave(e: DragEvent) {
  const to = e.relatedTarget as Node | null;
  if (!to || !(e.currentTarget as HTMLElement).contains(to)) dragging.value = false;
}

const { profile } = useProfile();
const gallery = useGallery();

const img = useImage({
  ramp, blend, strength, range,
  onLoaded(preview) {
    analyzing.value = true;
    // 让出一帧,先把照片画上去,再分析,避免大图分析阻塞首次渲染
    requestAnimationFrame(() => {
      candidates.value = candidatesFrom(preview);
      if (pendingSample) {
        // 从示例小样放上台的:用示例自己的调色参数,不被下面的自动套用覆盖
        setParams(pendingSample);
        pendingSample = null;
      } else if (candidates.value.length && profile.value.autoApply) {
        // 自动选中第一条候选(原色),用户立刻看到一个成品而不是原图。
        // 是否自动套用尊重个人中心里的设置。
        raw.value = candidates.value[0].hex;
      }
      analyzing.value = false;
    });
  },
});

/** 某一阶是否落在当前映射区间里 */
const inRange = (i: number) => i >= range.value[0] && i <= range.value[1];

// 按住「对比原图」时把强度临时归零
let heldStrength = 45;
function holdStart() {
  if (!img.hasImage.value) return;
  heldStrength = strength.value;
  strength.value = 0;
  comparing.value = true;
}
function holdEnd() {
  if (!comparing.value) return;
  strength.value = heldStrength;
  comparing.value = false;
}
/**
 * 键盘通路。<button> 上的 Space/Enter 触发的是 click,不触发 mousedown,
 * 所以只绑鼠标事件的"按住"对键盘用户是个死键。
 */
function holdKeyDown(e: KeyboardEvent) {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  if (e.repeat) return;          // 长按会连发 keydown,只认第一次
  e.preventDefault();            // space 会滚页
  holdStart();
}
function holdKeyUp(e: KeyboardEvent) {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  holdEnd();
}

const activeTone = computed(() => candidates.value.find((t) => t.hex.toUpperCase() === raw.value.toUpperCase()));

/* ------------------------------ 预设库 ------------------------------ */

// 面板状态存在 URL 的 hash 里,不是本地 ref —— 可链接、可后退、可新标签页打开
const { tab } = useTabRoute();

/** 工作状态:照片已在调色台上。背景退成中性、页头收成一行 */
const studioWorking = computed(() => img.hasImage.value && tab.value === 'studio');
const presets = usePresets();
const saving = ref(false);
const draftName = ref('');

function openSave() {
  draftName.value = activeTone.value?.name ?? raw.value.toUpperCase();
  saving.value = true;
}

function confirmSave() {
  const name = draftName.value.trim();
  if (!name) { MessagePlugin.warning('给它起个名字'); return; }
  const okDone = presets.add({
    name, hex: raw.value.toUpperCase(), blend: blend.value,
    strength: strength.value, thumb: img.thumbnail(),
  });
  if (okDone) { saving.value = false; MessagePlugin.success('已存进预设库'); }
  else MessagePlugin.error(presets.error.value || '存不进去');
}

async function saveToGallery() {
  if (!img.hasImage.value) return;
  const ok = await gallery.add({
    thumb: img.thumbnail(320),
    hex: raw.value.toUpperCase(), blend: blend.value,
    strength: strength.value, range: [...range.value] as [number, number],
    title: activeTone.value?.name ?? '',
  });
  if (ok) MessagePlugin.success('已存入作品集');
  else MessagePlugin.error(gallery.error.value || '保存失败');
}

function applyWork(w: Work) {
  raw.value = w.hex;
  blend.value = w.blend;
  strength.value = w.strength;
  range.value = [...w.range] as [number, number];
  tab.value = 'studio';
  MessagePlugin.success('已还原这张作品的调色');
}

/** 把一套范例参数写进调色台 */
function setParams(i: Inspiration) {
  raw.value = i.hex;
  blend.value = i.blend;
  strength.value = i.strength;
  range.value = [...i.range] as [number, number];
}

/**
 * 空台面上点一张示例小样:照片和它的调色参数一起放上台面。
 * 示例图片是站内资源,取回来包装成 File,走和上传完全相同的载入流程。
 */
async function loadSample(i: Inspiration) {
  sampleLoading.value = true;
  try {
    const res = await fetch(i.cover);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    pendingSample = i;
    await img.load(new File([blob], `${i.id}.jpg`, { type: blob.type || 'image/jpeg' }));
    if (img.error.value || !img.hasImage.value) throw new Error(img.error.value);
    MessagePlugin.success(`已把「${i.title}」连同调色参数放上台面`);
  } catch {
    // 载入失败要清掉,否则下一次用户自己上传时会误套这张示例的参数
    pendingSample = null;
    MessagePlugin.error('示例照片没有载入，换一张示例，或选择自己的照片');
  } finally {
    sampleLoading.value = false;
  }
}

function applyInspiration(i: Inspiration) {
  setParams(i);
  tab.value = 'studio';
  MessagePlugin.success(img.hasImage.value ? `已套用「${i.title}」` : `已选「${i.title}」，上传照片即可看到效果`);
}

function applyPreset(p: Preset) {
  raw.value = p.hex;
  blend.value = p.blend;
  strength.value = p.strength;
  tab.value = 'studio';
  MessagePlugin.success(`已套用「${p.name}」`);
}

/* ------------------------- 色觉检查 / 导出 ------------------------- */

const cvdOpen = ref(false);
const exportOpen = ref(false);

/** 导航上的角标。导航由 TABS 循环生成,计数按 tab 名取。 */
const tabCount = computed<Partial<Record<string, number>>>(() => ({
  gallery: gallery.works.value.length,
  library: presets.items.value.length,
}));

/**
 * 给 <canvas> 的替代文本。画布对读屏是一片空白,而它是这一屏的全部内容,
 * 所以要把"现在这张照片被调成什么样"用文字说出来。
 */
const shotAlt = computed(() => {
  const tone = activeTone.value?.name ?? raw.value.toUpperCase();
  return `调色预览:色调 ${tone}，混合模式 ${BLEND_LABELS[blend.value]}，强度 ${strength.value}%，取色阶第 ${range.value[0]} 到第 ${range.value[1]} 阶`;
});

/**
 * 跳过导航。这里不能让浏览器按 href 走 —— 改 hash 会被路由当成切换面板,
 * 所以拦下默认行为,直接把焦点移到 main 上。
 */
function focusMain() {
  const el = document.getElementById('main');
  el?.focus();
  el?.scrollIntoView({ block: 'start' });
}

/** 台面右下角那两个读数,连起来读才有意义 */
const readoutAlt = computed(() => {
  const n = img.naturalSize.value;
  return n ? `原图 ${n.w} 乘 ${n.h} 像素，本次渲染耗时 ${img.lastRenderMs.value.toFixed(1)} 毫秒` : '';
});

function onFile(e: Event) {
  const el = e.target as HTMLInputElement;
  const f = el.files?.[0];
  if (f) img.load(f);
  // 清空，否则再选同一个文件不会触发 change，用户以为「换一张」坏了
  el.value = '';
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) img.load(f);
}

async function download() {
  const blob = await img.exportBlob();
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `显影台-${activeTone.value?.name ?? raw.value.replace('#', '')}.jpg`;
  a.click();
  URL.revokeObjectURL(a.href);
  MessagePlugin.success('已导出原图尺寸');
}

watch(() => img.error.value, (e) => { if (e) MessagePlugin.error(e); });
</script>

<template>
  <div class="app" :class="{ working: studioWorking }">
    <a class="skip" href="#main" @click.prevent="focusMain">跳到主要内容</a>

    <!-- 整页流动的色彩背景:没放照片时轮播示例,放上后跟随调色结果 -->
    <Backdrop :source="img.canvas.value" :version="img.renderCount.value" :photo="img.hasImage.value" :samples="SAMPLE_COVERS" :working="studioWorking" />

    <header class="head">
      <div class="brand">
        <span class="mark" aria-hidden="true"></span>
        <div>
          <h1>显影台</h1>
          <p class="tag">滤镜不是黑盒，是一条能看见、能改、能导出的色阶</p>
        </div>
      </div>
    </header>

    <!-- 面板入口是真链接,不是按钮:Cmd/中键点击、后退前进、收藏都交给浏览器 -->
    <nav class="tabs" aria-label="面板">
      <a
        v-for="t in TABS" :key="t"
        :href="`#${t}`" :class="{ on: tab === t }"
        :aria-current="tab === t ? 'page' : undefined"
      >{{ TAB_LABELS[t] }}<span v-if="tabCount[t]" class="count tnum">{{ tabCount[t] }}</span></a>
    </nav>

    <main id="main" tabindex="-1">
      <div v-show="tab === 'studio'">
        <h2 class="sr-only">调色台</h2>

        <div class="board">
          <!-- 照片:深色灯箱台面 -->
          <section
            class="stage" :class="{ dragging }" aria-label="照片台面"
            @dragover.prevent="dragging = true" @dragleave="onDragLeave" @drop.prevent="onDrop"
          >
            <div v-show="img.hasImage.value" class="shot-wrap">
              <canvas :ref="(e: any) => (img.canvas.value = e)" class="shot" role="img" :aria-label="shotAlt" />
            </div>

            <!-- 空台面是一张印样:上面放自己照片的入口,下面一排示例小样,点一张直接上台 -->
            <div v-if="!img.hasImage.value" class="intro">
              <div class="intro-head">
                <div>
                  <strong class="intro-title">把一张风光照放上台面</strong>
                  <span class="intro-sub">拖到台面上任意位置，或者点「选择照片」。jpg、png、webp 都可以。</span>
                </div>
                <label class="drop">
                  <!-- 不能用 hidden:那会把 input 移出 tab 序列,键盘就再也上传不了 -->
                  <input type="file" accept="image/*" class="file-input" @change="onFile" />选择照片
                </label>
              </div>
            
              <p class="intro-hint">手边没有合适的照片？点一张示例，照片和它的调色参数会一起放上台面。</p>
              <ul class="contact" aria-label="示例照片">
                <li v-for="(s, k) in INSPIRATIONS" :key="s.id">
                  <button
                    class="print" :disabled="sampleLoading"
                    :aria-label="`用示例「${s.title}」：照片和调色参数一起放上台面`"
                    @click="loadSample(s)"
                  >
                    <img
                      :src="s.cover" alt="" loading="lazy" decoding="async"
                      :style="s.coverPosition ? { objectPosition: s.coverPosition } : undefined"
                    />
                    <span class="print-ramp" aria-hidden="true">
                      <i
                        v-for="sw in SAMPLE_RAMPS[k]" :key="sw.index"
                        :class="{ off: sw.index < s.range[0] || sw.index > s.range[1] }"
                        :style="{ background: sw.hex }"
                      />
                    </span>
                    <span class="print-name">{{ s.title }}</span>
                  </button>
                </li>
              </ul>
            </div>

            <div v-if="img.hasImage.value" class="stage-foot">
              <button
                class="ghost"
                @mousedown="holdStart" @mouseup="holdEnd" @mouseleave="holdEnd"
                @keydown="holdKeyDown" @keyup="holdKeyUp" @blur="holdEnd"
                @touchstart.prevent="holdStart" @touchend="holdEnd"
              >{{ comparing ? '原图' : '按住看原图' }}</button>
              <label class="ghost as-label">
                <input type="file" accept="image/*" class="file-input" @change="onFile" />换一张
              </label>
              <span class="grow"></span>
              <span class="readout dim tiny" :aria-label="readoutAlt">
                <span class="mono" aria-hidden="true">{{ img.naturalSize.value?.w }}×{{ img.naturalSize.value?.h }}</span>
                <span class="mono" aria-hidden="true">{{ img.lastRenderMs.value.toFixed(1) }}ms</span>
              </span>
            </div>
          </section>

          <!-- 工具:分组,靠间距分区,不用盒子 -->
          <aside class="tools on-dark" aria-label="调色参数">
            <div class="grp">
              <h3 class="grp-h">
                色调<span v-if="candidates.length" class="grp-v dim tiny">从这张照片提取</span>
              </h3>

              <div v-if="analyzing" class="analyzing">
                <t-loading size="small" text="正在分析照片色彩…" />
              </div>

              <p v-else-if="!candidates.length" class="dim tiny hint" style="margin: 0">
                放上照片后，这里会给出几条从它色彩里提取的色调。
              </p>

              <div v-else class="tones">
                <t-tooltip v-for="t in candidates" :key="t.hex" :content="t.note">
                  <button
                    class="tone" :class="{ on: raw.toUpperCase() === t.hex.toUpperCase() }"
                    :aria-label="`${t.name}:${t.note}`" @click="raw = t.hex"
                  >
                    <span class="tone-chip" :style="{ background: t.hex }"></span>
                    <span class="tone-name">{{ t.name }}</span>
                  </button>
                </t-tooltip>
              </div>

              <div class="pick">
                <span class="pick-label dim tiny" aria-hidden="true">自定义</span>
                <t-color-picker :model-value="valid ? raw : '#0E7C86'" format="HEX" :show-primary-color-preview="false" @change="(v: string) => (raw = v)" />
                <input
                  class="hex mono" :value="raw" spellcheck="false"
                  autocomplete="off" aria-label="自定义主色色值，十六进制"
                  :aria-invalid="valid ? undefined : 'true'"
                  @input="(e: any) => (raw = e.target.value)"
                />
              </div>
            </div>

            <hr class="sep" aria-hidden="true" />

            <!-- 记忆点:光学刻度尺 -->
            <div class="grp">
              <h3 class="grp-h">
                映射区间<span class="grp-v mono">{{ range[0] }}–{{ range[1] }}</span>
              </h3>
              <div class="scale" role="img" :aria-label="`色阶第 ${range[0]} 到第 ${range[1]} 阶参与映射`">
                <div class="scale-bar">
                  <span
                    v-for="s in ramp" :key="s.index"
                    class="tick" :class="{ off: s.index < range[0] || s.index > range[1] }"
                    :style="{ background: s.hex }"
                  ></span>
                </div>
                <div class="scale-nums">
                  <span v-for="n in 10" :key="n" class="mono" :class="{ dim: n < range[0] || n > range[1] }">{{ n }}</span>
                </div>
              </div>
              <t-slider v-model="range" range :min="1" :max="10" :step="1" class="range" />
              <div class="chips">
                <t-tooltip v-for="r in RANGE_PRESETS" :key="r.name" :content="r.note">
                  <button
                    class="chip" :class="{ on: range[0] === r.v[0] && range[1] === r.v[1] }"
                    :aria-label="`${r.name}:${r.note}`"
                    @click="range = [...r.v] as [number, number]"
                  >{{ r.name }}</button>
                </t-tooltip>
              </div>
              <p class="dim tiny hint">暗部取右端、高光取左端。区间收窄，黑场提亮、高光压低，反差变平。</p>
            </div>

            <hr class="sep" aria-hidden="true" />

            <div class="grp">
              <div class="two">
                <div>
                  <h3 class="grp-h" id="blend-h">混合</h3>
                  <t-select v-model="blend" size="small" :options="Object.entries(BLEND_LABELS).map(([value, label]) => ({ value, label }))" />
                </div>
                <div>
                  <h3 class="grp-h">强度<span class="grp-v mono">{{ strength }}</span></h3>
                  <t-slider v-model="strength" :min="0" :max="100" />
                </div>
              </div>
            </div>

            <hr class="sep" aria-hidden="true" />

            <div class="acts">
              <t-button theme="primary" block :disabled="!img.hasImage.value" @click="saveToGallery">存入作品集</t-button>
              <div class="acts-row">
                <t-button variant="outline" :disabled="!img.hasImage.value" @click="exportOpen = true">导出</t-button>
                <t-button variant="outline" :disabled="!img.hasImage.value" @click="openSave">存为预设</t-button>
              </div>
              <t-button variant="text" block :disabled="!img.hasImage.value" @click="cvdOpen = true">色觉友好度检查</t-button>
            </div>
          </aside>
        </div>
      </div>

      <Inspirations v-show="tab === 'inspire'" :has-image="img.hasImage.value" @apply="applyInspiration" />

      <Gallery
        v-show="tab === 'gallery'"
        :works="gallery.works.value" :ready="gallery.ready.value" :error="gallery.error.value"
        @apply="applyWork" @remove="gallery.remove"
      />

      <ProfilePanel
        v-show="tab === 'me'"
        :accent="valid ? raw : '#0E7C86'" :work-count="gallery.works.value.length"
      />

      <PresetLibrary
        v-show="tab === 'library'"
        :presets="presets.filtered.value" :keyword="presets.keyword.value" :error="presets.error.value"
        @update:keyword="(v: string) => (presets.keyword.value = v)"
        @apply="applyPreset" @remove="presets.remove" @rename="presets.rename"
      />
    </main>

    <CvdCheck v-model:visible="cvdOpen" :snapshot="img.snapshot" />
    <ExportPanel v-model:visible="exportOpen" :palette="palette" :can-export-image="img.hasImage.value" :export-image="download" />

    <t-dialog v-model:visible="saving" header="存为预设" :on-confirm="confirmSave" confirm-btn="存下" cancel-btn="取消">
      <t-input v-model="draftName" placeholder="给这套色调起个名字" :maxlength="24" autofocus @enter="confirmSave" />
      <p class="dim tiny" style="margin: 10px 0 0">预设记的是色调、混合模式和强度，不是这张图。换一张照片套用它，得到的是同一种色调倾向。</p>
    </t-dialog>
  </div>
</template>

<style scoped>
/* 版心:左右留白随屏宽变化(1440 宽约 86px),内容整体落在屏幕中轴上 */
.app { max-width: 1680px; margin: 0 auto; padding: var(--s-10) clamp(56px, 6vw, 112px) var(--s-16); }
main:focus { outline: none; }

/* 跳过导航:平时移出视口,聚焦时落回左上角 */
.skip {
  position: absolute; left: var(--s-4); top: -100px; z-index: 100;
  padding: var(--s-2) var(--s-3); border-radius: var(--r-ctl);
  background: var(--td-brand-color); color: #fff; text-decoration: none;
  font-size: var(--t-base);
  transition: top var(--ease);
}
.skip:focus { top: var(--s-4); }

/* ── 顶栏:沿中轴排列,阶梯楔在上,站名与标语居中 ── */
.head { display: flex; justify-content: center; margin-bottom: var(--s-10); }
.brand { display: flex; flex-direction: column; align-items: center; gap: var(--s-3); text-align: center; }

/* 品牌标记 = 阶梯楔。暗房标定用的那把实物灰阶尺,五个硬边台阶,
   不是一道平滑渐变——色阶本来就是离散的十阶,标记也该是离散的。 */
.mark {
  width: 40px; height: 28px; border-radius: var(--r-tick); flex: none;
  background: linear-gradient(90deg,
    var(--td-brand-color-2) 0 20%,
    var(--td-brand-color-4) 20% 40%,
    var(--td-brand-color-6) 40% 60%,
    var(--td-brand-color-8) 60% 80%,
    var(--td-brand-color-10) 80% 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14);
}
/* 站名略微拉开字距;左侧补同样的量,抵消最后一个字后面的字距,保证视觉上仍在中轴 */
h1 { font-size: var(--t-display); font-weight: 600; letter-spacing: .06em; padding-left: .06em; margin: 0; line-height: 1.15; color: #fff; }
/* 页头和导航直接压在背景顶部更暗的遮罩上,文字用白色 */
.tag { color: rgba(255, 255, 255, .9); font-size: var(--t-base); margin: var(--s-2) 0 0; }

/* ── tab:沿中轴等距排开,下方分隔线通栏;用 gap 而不是每个标签的右外边距,否则整组会偏左 ── */
.tabs { display: flex; justify-content: center; gap: var(--s-10); border-bottom: 1px solid rgba(255, 255, 255, .2); margin-bottom: var(--s-14); }
.tabs a {
  display: inline-flex; align-items: center; text-decoration: none;
  font: inherit; font-size: var(--t-body); font-weight: 500;
  padding: var(--s-3) var(--s-1);
  background: none; border: 0; border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, .9); cursor: pointer;
  transition: color var(--ease), border-color var(--ease); margin-bottom: -1px;
}
.tabs a:hover { color: #fff; }
.tabs a.on { color: #fff; border-bottom-color: #fff; }
.count {
  display: inline-block; margin-left: var(--s-1); padding: 0 5px; font-size: var(--t-micro);
  background: var(--td-brand-color-1); color: var(--td-brand-color-7); border-radius: var(--r-ctl);
}

/* ── 布局:照片宽,工具窄;两栏等高、底边对齐,整块控制在一屏之内 ── */
.board {
  display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--s-10); align-items: stretch;
  height: clamp(600px, calc(100vh - 296px), 760px);
}

/* ── 灯箱台面 ── */
.stage {
  min-width: 0;
  background: var(--stage);
  background-image:
    linear-gradient(var(--stage-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--stage-line) 1px, transparent 1px);
  background-size: 22px 22px;
  border: 1px solid var(--stage-edge);
  border-radius: var(--r-panel);
  padding: var(--s-6);
  display: flex; flex-direction: column; min-height: 0;
  /* 台面自己不投影(见 style.css 规矩 2),这道内高光是灯箱边框的倒角 */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .03);
}

/* 照片区占满台面剩余高度,照片在其中完整显示并居中:竖图左右留白相等 */
.shot-wrap { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }

/* 全站唯一投影的所有者:台面上那张相纸 */
.shot {
  max-width: 100%; max-height: 100%;
  width: auto; height: auto; display: block;
  border-radius: var(--r-ctl);
  box-shadow: var(--lift-print);
}

/* ── 空台面:一张印样 ──
   暗房里挑片,是把一排小样摊在灯箱上看。台面没有照片时就这么摆:
   上面是放自己照片的入口,下面一排示例小样,底边贴着各自的色阶(区间外压暗)。
   小样是照片,所以按规矩 2 允许轻投影;悬停与聚焦只加描边,不位移。 */
.stage.dragging { border-color: var(--td-brand-color); box-shadow: inset 0 0 0 1px var(--td-brand-color); }

/* 空台面沿中轴排列:标题、说明、按钮、提示、小样依次居中 */
.intro {
  flex: 1; min-height: 0; padding: var(--s-4);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--s-4);
  text-align: center;
}
.intro-head { display: flex; flex-direction: column; align-items: center; gap: var(--s-5); }
.intro-title { display: block; font-size: var(--t-h1); font-weight: 600; letter-spacing: -.01em; color: var(--stage-ink); }
.intro-sub { display: block; margin-top: var(--s-2); font-size: var(--t-small); color: var(--stage-ink-dim); }

/* 上传入口。类名沿用 .drop:端到端测试靠它确认键盘能到达上传控件 */
.drop {
  position: relative; flex: none; cursor: pointer;
  padding: var(--s-2) var(--s-5); border-radius: var(--r-ctl);
  background: var(--td-brand-color); color: #fff;
  font-size: var(--t-body); font-weight: 500;
  transition: background-color var(--ease);
}
.drop:hover { background: var(--td-brand-color-8); }
.drop:focus-within { outline: 2px solid var(--stage-ink); outline-offset: 2px; }

.intro-hint { margin: var(--s-8) 0 0; font-size: var(--t-small); color: var(--stage-ink-dim); }
.contact { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--s-4); }
.print {
  display: flex; flex-direction: column; width: 100%; padding: 0;
  border: 0; background: none; cursor: pointer; text-align: center; font: inherit;
}
.print img {
  display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover;
  border-radius: var(--r-ctl) var(--r-ctl) 0 0;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .08), var(--lift-thumb);
  transition: box-shadow var(--ease);
}
.print-ramp { display: flex; height: 4px; }
.print-ramp i { flex: 1; }
.print-ramp i.off { opacity: .25; }
.print-name { margin-top: var(--s-2); font-size: var(--t-small); color: var(--stage-ink-dim); transition: color var(--ease); }
.print:hover img, .print:focus-visible img { box-shadow: 0 0 0 2px var(--stage-ink), var(--lift-thumb); }
.print:hover .print-name, .print:focus-visible .print-name { color: var(--stage-ink); }
.print:focus-visible { outline: none; }
.print:disabled { cursor: progress; opacity: .6; }

.stage-foot { flex: none; display: flex; align-items: center; gap: var(--s-1); margin-top: var(--s-4); }
.ghost {
  font: inherit; font-size: var(--t-base); padding: 5px var(--s-3); border-radius: var(--r-ctl);
  background: rgba(255, 255, 255, .05); border: 1px solid var(--stage-edge);
  color: var(--stage-ink); cursor: pointer; transition: background var(--ease);
}
.ghost:hover { background: rgba(255, 255, 255, .1); }
.ghost:focus-within { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
.as-label { display: inline-flex; align-items: center; }
.grow { flex: 1; }
.stage-foot .dim { color: var(--stage-ink-dim); }
/* 读数条:不用中点串接,靠间距和等宽数字分开 */
.readout { display: flex; align-items: baseline; gap: var(--s-3); }

/* ── 工具区:分隔线是和各组并列的独立一项,space-between 把余下高度平均分到每条线的上下,线始终在两组正中;
   按钮组贴底,和台面底边对齐。屏幕太矮放不下时在栏内滚动。
   浮在流动背景上,放进磨砂玻璃保证文字对比度;内边距也给贴边控件的焦点框留出位置 ── */
.tools {
  display: flex; flex-direction: column; justify-content: space-between; gap: var(--s-2);
  min-height: 0; overflow-y: auto;
  padding: var(--s-4) var(--s-5); border-radius: var(--r-panel);
  background: var(--glass); border: 1px solid var(--glass-edge);
  backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
}
.grp { display: flex; flex-direction: column; }
.sep { flex: none; margin: 0; border: 0; border-top: 1px solid var(--td-component-stroke); }
.grp-h {
  font-size: var(--t-small); font-weight: 500;
  color: var(--td-text-color-secondary);
  display: flex; align-items: baseline; justify-content: space-between;
  margin: 0 0 var(--s-2);
  letter-spacing: .01em;
}
.grp-v { color: var(--td-text-color-primary); font-size: var(--t-small); }

.tones { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.analyzing { padding: var(--s-2) 0; }
.pick-label { flex: none; }
.tone {
  display: flex; flex-direction: column; gap: 5px; padding: 0;
  background: none; border: 0; cursor: pointer;
}
/* 悬停只改描边,不改位置 */
.tone-chip {
  height: 30px; border-radius: var(--r-ctl); border: 1px solid rgba(128, 128, 128, .25);
  transition: box-shadow var(--ease), border-color var(--ease);
}
.tone:hover .tone-chip { border-color: var(--td-text-color-primary); }
.tone.on .tone-chip { box-shadow: 0 0 0 2px var(--stage), 0 0 0 3px var(--td-brand-color); }
.tone-name { font-size: var(--t-micro); color: var(--td-text-color-secondary); text-align: center; }
.tone.on .tone-name { color: var(--td-brand-color); }
.tone:focus-visible { outline-offset: 2px; border-radius: var(--r-ctl); }

.pick { display: flex; gap: var(--s-2); align-items: center; margin-top: var(--s-3); }
.hex {
  flex: 1; min-width: 0; font-family: var(--font-mono); font-size: var(--t-base);
  font-variant-numeric: tabular-nums;
  padding: 6px var(--s-2); border-radius: var(--r-ctl);
  border: 1px solid var(--td-component-stroke); background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
}
.hex:focus { outline: 0; border-color: var(--td-brand-color); }
.hex:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 1px; }
.hex[aria-invalid='true'] { border-color: var(--td-error-color); }

/* ── 光学刻度尺:页面的记忆点 ── */
.scale { user-select: none; }
.scale-bar { display: flex; gap: 2px; height: 40px; }
.tick {
  flex: 1; border-radius: var(--r-tick);
  transition: opacity .2s, transform .2s;
  position: relative;
}
.tick.off { opacity: .2; transform: scaleY(.7); }
.scale-nums { display: flex; gap: 2px; margin-top: 5px; }
.scale-nums span { flex: 1; text-align: center; font-size: var(--t-micro); color: var(--td-text-color-primary); }
.scale-nums span.dim { opacity: .3; }
.range { margin-top: var(--s-1); }

.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: var(--s-3); }
.chip {
  font: inherit; font-size: var(--t-small); padding: var(--s-1) var(--s-3); border-radius: var(--r-ctl);
  background: var(--td-bg-color-container); border: 1px solid var(--td-component-stroke);
  color: var(--td-text-color-secondary); cursor: pointer;
  transition: color var(--ease), border-color var(--ease), background-color var(--ease);
}
.chip:hover { border-color: var(--td-brand-color); color: var(--td-brand-color); }
.chip.on { background: var(--td-brand-color); border-color: var(--td-brand-color); color: #fff; }
.hint { margin: var(--s-2) 0 0; line-height: 1.6; }

.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); align-items: start; }

.acts { display: flex; flex-direction: column; gap: var(--s-2); }
.acts-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
.acts-row :deep(.t-button) { width: 100%; }
/* 深色面板上的禁用主按钮:保留主色、半透明,不再是一片发白的浅青 */
.acts :deep(.t-button--theme-primary.t-is-disabled) {
  background-color: var(--td-brand-color); border-color: var(--td-brand-color); color: #fff; opacity: .45;
}

.dim { color: var(--td-text-color-secondary); }
.tiny { font-size: var(--t-micro); }

/* ── 工作状态:照片已在调色台上,页头收成一行、标语隐藏,把高度让给台面 ── */
.app, .head, .tabs { transition: padding .3s ease, margin .3s ease; }
.app.working { padding-top: var(--s-5); }
.app.working .head { margin-bottom: var(--s-3); }
.app.working .brand { flex-direction: row; gap: var(--s-2); }
.app.working .mark { width: 24px; height: 17px; }
.app.working h1 { font-size: var(--t-title); letter-spacing: .04em; padding-left: .04em; }
.app.working .tag { display: none; }
.app.working .tabs { margin-bottom: var(--s-6); }
.app.working .board { height: clamp(600px, calc(100vh - 160px), 880px); }

@media (max-width: 880px) {
  .app.working .board { height: auto; }
  .contact { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .board { grid-template-columns: 1fr; gap: var(--s-5); height: auto; }
  .app { padding: var(--s-6) var(--s-4) var(--s-12); }
  .tabs { gap: var(--s-3); }
  .shot { max-height: 54vh; }
}
</style>
