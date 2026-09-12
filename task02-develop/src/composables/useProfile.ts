/**
 * useProfile.ts — 个人中心(本地)
 *
 * 昵称、头像、默认偏好。全部存 localStorage——这些是小数据,且理应留在本地。
 * 头像不存图片文件,只存一个从预置集里选的标识 + 一个背景色(由用户当前色调生成),
 * 这样头像本身也和"调色"这件事产生关联,而不是一个无关的上传控件。
 */

import { ref, watch } from 'vue';

const KEY = 'xianyingtai:profile';

export interface Profile {
  name: string;
  /** 头像图形:从内置几何符号里选一个 */
  avatar: string;
  /** 默认打开时的界面语言(预留,当前只有中文) */
  lang: 'zh' | 'en';
  /** 新照片载入后是否自动套用提取的第一条候选 */
  autoApply: boolean;
}

const DEFAULT: Profile = { name: '', avatar: 'aperture', lang: 'zh', autoApply: true };

export const AVATARS = ['aperture', 'mountain', 'wave', 'leaf', 'prism', 'moon'] as const;

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

/**
 * 模块级单例:全站共用同一份 profile。
 *
 * 之前 useProfile() 每次调用都新建一个 ref,所以只能由 App 持有再当 prop 传下去,
 * 个人中心那一屏就只好直接改 props 对象——Vue 的反模式,而且 vue-tsc 查不出来。
 * 状态提到模块级之后,需要它的组件各自 useProfile() 即可,prop 和那处改写一起消失。
 */
const profile = ref<Profile>(load());

watch(profile, (p) => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 隐私模式忽略 */ }
}, { deep: true });

export function useProfile() {
  return { profile };
}
