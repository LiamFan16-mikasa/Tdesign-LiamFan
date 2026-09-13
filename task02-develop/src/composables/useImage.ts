/**
 * useImage.ts — 图片的载入、缩放与渲染调度
 *
 * 两条关键约束：
 *
 * 一、预览必须缩放。手机拍的原图动辄 4000×3000，一千二百万像素，
 *     每帧跑一遍会卡死。预览统一缩到长边 1280，导出时才用原图重跑一遍。
 *
 * 二、渲染要合并到一帧里。拖动强度滑块时事件每秒能触发上百次，
 *     每次都跑一趟像素循环会积压。用 requestAnimationFrame 合并，
 *     一帧只渲染一次，拿最新的参数。
 */

import { ref, shallowRef, watch, onUnmounted, type Ref } from 'vue';
import { render, type BlendMode } from '@/render/pipeline';
import { buildLut, type Lut } from '@/render/lut';
import type { Swatch } from '@palette/palette';

/**
 * 预览的长边上限。
 *
 * 定在 1280 是实测出来的，不是拍的：1600×1200（192 万像素）下柔光混合一帧要 20.8ms，
 * 超过 16ms 的一帧预算；1280×960（123 万像素）下四种混合模式都在 13ms 以内。
 * 预览尺寸不影响成品——导出时用原图重跑一遍。
 */
const PREVIEW_MAX_EDGE = 1280;

export interface UseImageOptions {
  ramp: Ref<Swatch[] | undefined>;
  blend: Ref<BlendMode>;
  strength: Ref<number>;
  /** 取色阶的哪一段做映射，`[起, 止]`，1 起。窄幅得到哑光质感 */
  range: Ref<[number, number]>;
  /** 新图载入完成后回调,带上缩放后的 ImageData,供提取主色用 */
  onLoaded?: (preview: ImageData) => void;
}

export function useImage(opts: UseImageOptions) {
  const canvas = shallowRef<HTMLCanvasElement | null>(null);
  const hasImage = ref(false);
  const loading = ref(false);
  const error = ref('');
  const naturalSize = ref<{ w: number; h: number } | null>(null);
  /** 上一次渲染耗时，毫秒。用来验证性能，不是装饰 */
  const lastRenderMs = ref(0);
  /** 画布每渲染一次加一;整页背景据此同步调色结果 */
  const renderCount = ref(0);

  // 原图留着供导出用；预览用的是缩放后的副本
  let sourceBitmap: ImageBitmap | HTMLImageElement | null = null;
  let previewSrc: ImageData | null = null;
  let previewDst: ImageData | null = null;
  let lut: Lut | null = null;
  let frame = 0;

  /* ------------------------------ 载入 ------------------------------ */

  /**
   * 载入序号。解码是异步的：连着换两张图时，先选的大图可能比后选的小图晚解码完。
   * 只有最后发起的那次载入能写进状态，早先的解码结果到手就丢掉。
   */
  let loadSeq = 0;

  /** 返回这张图是否真的放上了台面：读不出来、或被之后的载入顶掉，都返回 false */
  async function load(file: File): Promise<boolean> {
    error.value = '';
    if (!file.type.startsWith('image/')) {
      error.value = '这不是图片文件';
      return false;
    }
    const seq = ++loadSeq;
    loading.value = true;
    try {
      const bitmap = await createImageBitmap(file);
      if (seq !== loadSeq) {
        bitmap.close();
        return false;
      }
      // 换图时释放上一张。ImageBitmap 占的是解码后的原始像素，
      // 一张 4000×3000 就是 48MB，连传几张不释放会把内存吃光。
      if (sourceBitmap && 'close' in sourceBitmap) sourceBitmap.close();
      sourceBitmap = bitmap;
      naturalSize.value = { w: bitmap.width, h: bitmap.height };

      const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));

      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, w, h);

      previewSrc = ctx.getImageData(0, 0, w, h);
      previewDst = ctx.createImageData(w, h);

      if (canvas.value) {
        canvas.value.width = w;
        canvas.value.height = h;
      }
      hasImage.value = true;
      schedule();
      if (opts.onLoaded && previewSrc) opts.onLoaded(previewSrc);
      return true;
    } catch {
      if (seq === loadSeq) error.value = '这张图读不出来，换一张试试';
      return false;
    } finally {
      if (seq === loadSeq) loading.value = false;
    }
  }

  /* ------------------------------ 渲染 ------------------------------ */

  function draw(): void {
    if (!previewSrc || !previewDst || !lut || !canvas.value) return;
    const t0 = performance.now();
    render(previewSrc, previewDst, { lut, blend: opts.blend.value, strength: opts.strength.value / 100 });
    canvas.value.getContext('2d')!.putImageData(previewDst, 0, 0);
    lastRenderMs.value = performance.now() - t0;
    renderCount.value++;
  }

  /** 合并到下一帧，拖滑块时不会积压 */
  function schedule(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  // 色阶换了才重建查找表；混合模式和强度变了只需重画
  watch(
    [opts.ramp, opts.range],
    () => {
      const r = opts.ramp.value;
      if (!r?.length) return;
      lut = buildLut(r, opts.range.value[0], opts.range.value[1]);
      schedule();
    },
    { immediate: true, deep: true }
  );

  watch([opts.blend, opts.strength], schedule);

  /* ------------------------------ 导出 ------------------------------ */

  /**
   * 用原图尺寸重新渲染一遍再导出，不是把预览图放大。
   *
   * 一张 12MP 的原图，src 与 dst 两块 ImageData 加起来约 96MB，
   * 移动端浏览器可能直接崩。超过阈值就按比例缩小后再导出——
   * 宁可给一张小一点但能打开的图，也不要给一个白屏。
   */
  const EXPORT_MAX_PIXELS = 24e6;

  async function exportBlob(type = 'image/jpeg', quality = 0.92): Promise<Blob | null> {
    if (!sourceBitmap || !lut) return null;
    let w = naturalSize.value!.w, h = naturalSize.value!.h;
    if (w * h > EXPORT_MAX_PIXELS) {
      const s = Math.sqrt(EXPORT_MAX_PIXELS / (w * h));
      w = Math.round(w * s);
      h = Math.round(h * s);
    }

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(sourceBitmap as CanvasImageSource, 0, 0, w, h);

    const src = ctx.getImageData(0, 0, w, h);
    const dst = ctx.createImageData(w, h);
    render(src, dst, { lut, blend: opts.blend.value, strength: opts.strength.value / 100 });
    ctx.putImageData(dst, 0, 0);

    return new Promise((resolve) => off.toBlob(resolve, type, quality));
  }

  /** 缩略图，存预设时用 */
  function thumbnail(maxEdge = 200): string {
    if (!previewDst || !canvas.value) return '';
    const src = canvas.value;
    const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(src.width * scale));
    off.height = Math.max(1, Math.round(src.height * scale));
    off.getContext('2d')!.drawImage(src, 0, 0, off.width, off.height);
    return off.toDataURL('image/jpeg', 0.7);
  }

  onUnmounted(() => {
    if (frame) cancelAnimationFrame(frame);
    if (sourceBitmap && 'close' in sourceBitmap) sourceBitmap.close();
  });

  /** 当前预览画布的一份 ImageData 拷贝，供色觉检查等旁路视图使用 */
  function snapshot(): ImageData | null {
    if (!canvas.value || !hasImage.value) return null;
    const ctx = canvas.value.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    return ctx.getImageData(0, 0, canvas.value.width, canvas.value.height);
  }

  return { canvas, hasImage, loading, error, naturalSize, lastRenderMs, renderCount, load, exportBlob, thumbnail, snapshot, redraw: schedule };
}
