/**
 * usePresets.ts — 预设库
 *
 * 一个预设记录的是「一套调色配置」，不是一张图：色调、混合模式、强度，
 * 外加一张当时那张照片的缩略图当封面。所以换一张照片再套用同一个预设，
 * 得到的是同一种色调倾向，而不是同一张图。
 *
 * 存 localStorage。这个应用没有后端，也不该有——调色是本地行为，
 * 把用户的照片传到服务器只为了存三个数字，不划算也不该做。
 */

import { ref, computed } from 'vue';
import type { BlendMode } from '@/render/pipeline';

const STORAGE_KEY = 'xianyingtai:presets';
/** localStorage 通常只有 5MB，缩略图是大头，限制数量避免写满 */
const MAX_PRESETS = 60;

export interface Preset {
  id: string;
  name: string;
  hex: string;
  blend: BlendMode;
  /** 0–100 */
  strength: number;
  /** dataURL，长边 200 */
  thumb: string;
  createdAt: number;
}

function read(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // 存过的数据可能来自旧版本，逐条校验而不是整体信任
    return list.filter(
      (p): p is Preset =>
        p && typeof p.id === 'string' && typeof p.hex === 'string' &&
        typeof p.name === 'string' && typeof p.strength === 'number'
    );
  } catch {
    return [];
  }
}

export function usePresets() {
  const items = ref<Preset[]>(read());
  const keyword = ref('');
  const error = ref('');

  const filtered = computed(() => {
    const k = keyword.value.trim().toLowerCase();
    const list = [...items.value].sort((a, b) => b.createdAt - a.createdAt);
    if (!k) return list;
    return list.filter((p) => p.name.toLowerCase().includes(k) || p.hex.toLowerCase().includes(k));
  });

  function persist(): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value));
      error.value = '';
      return true;
    } catch {
      // 配额写满或隐私模式。不能静默失败——用户以为存上了，其实没有
      error.value = '本地存储写不进去了，可能是预设太多或浏览器处于隐私模式';
      return false;
    }
  }

  function add(p: Omit<Preset, 'id' | 'createdAt'>): boolean {
    if (items.value.length >= MAX_PRESETS) {
      error.value = `预设最多存 ${MAX_PRESETS} 个，先删掉一些`;
      return false;
    }
    items.value = [
      ...items.value,
      { ...p, id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() },
    ];
    if (!persist()) {
      items.value = items.value.slice(0, -1);   // 存不进去就回滚，不留假数据
      return false;
    }
    return true;
  }

  function remove(id: string): void {
    items.value = items.value.filter((p) => p.id !== id);
    persist();
  }

  function rename(id: string, name: string): void {
    const n = name.trim();
    if (!n) return;
    items.value = items.value.map((p) => (p.id === id ? { ...p, name: n } : p));
    persist();
  }

  return { items, filtered, keyword, error, add, remove, rename, MAX_PRESETS };
}
