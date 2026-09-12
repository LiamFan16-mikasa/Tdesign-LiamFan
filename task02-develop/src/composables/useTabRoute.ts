/**
 * useTabRoute.ts — 把面板状态放进 URL
 *
 * 之前 tab 是一个本地 ref。后果很实在:刷新回到调色台、浏览器后退直接退出站点、
 * 作品集分享不出链接、Cmd/中键点不开新标签页——看起来像网页,用起来像单机程序。
 *
 * 这里用 hash 而不是 history API,是因为产物部署在 GitHub Pages 的子目录下
 * (见 vite.config.ts 的 base),没有服务端路由可配,pushState 的深链接刷新会 404。
 * hash 不经过服务器,子目录下也能直接用。
 *
 * 导航本身交还给浏览器:面板入口是真的 <a href="#gallery">,
 * 所以 Cmd/中键点击、后退前进、收藏这些都不用我们实现,浏览器本来就会。
 */

import { ref, watch, onScopeDispose } from 'vue';

export const TABS = ['studio', 'inspire', 'gallery', 'library', 'me'] as const;
export type Tab = (typeof TABS)[number];

/** 面板在 URL 与读屏里的名字。tab 按钮上的短标签不够自解释,分享出去的链接也该有个像样的标题。 */
export const TAB_LABELS: Record<Tab, string> = {
  studio: '调色台',
  inspire: '灵感',
  gallery: '作品集',
  library: '预设库',
  me: '我的',
};

function fromHash(): Tab {
  if (typeof location === 'undefined') return 'studio';
  const h = location.hash.replace(/^#\/?/, '');
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : 'studio';
}

export function useTabRoute() {
  const tab = ref<Tab>(fromHash());

  // 浏览器前进/后退,以及用户直接改地址栏。
  // 认不出来的 hash 就不动当前面板 —— 页内锚点不该把人踢回调色台。
  const onHashChange = () => {
    const h = location.hash.replace(/^#\/?/, '');
    if ((TABS as readonly string[]).includes(h)) tab.value = h as Tab;
  };
  window.addEventListener('hashchange', onHashChange);
  onScopeDispose(() => window.removeEventListener('hashchange', onHashChange));

  // 代码内切换(套用预设后跳回调色台)也要落到 URL,否则地址栏会和界面对不上
  watch(tab, (t) => {
    const want = `#${t}`;
    if (location.hash !== want) location.hash = want;
  });

  return { tab };
}
