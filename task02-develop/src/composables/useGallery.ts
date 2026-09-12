/**
 * useGallery.ts — 本机作品集(底片库)
 *
 * 把用户调过的照片沉淀下来,像摄影师的底片库。这是本产品从"工具"走向"产品"的骨架:
 * 用户的东西留在里面,回来能看到自己调过的所有片子。
 *
 * 存储用 IndexedDB 而非 localStorage。原因:作品要存缩略图(几十 KB 一张),
 * localStorage 5MB 的配额存不了几张;IndexedDB 容量以百 MB 计,且异步不阻塞主线程。
 *
 * 明确的边界:这是"这台设备上的我的作品"。没有后端,不跨设备同步。
 * 这是有意识的取舍——产品设计呈现完整,但不引入后端的复杂度与部署负担。
 */

import { ref } from 'vue';
import type { BlendMode } from '@/render/pipeline';

const DB_NAME = 'xianyingtai';
const STORE = 'works';
const DB_VERSION = 1;

export interface Work {
  id: string;
  /** 调色后的缩略图,dataURL */
  thumb: string;
  /** 复现这次调色所需的全部参数 */
  hex: string;
  blend: BlendMode;
  strength: number;
  range: [number, number];
  /** 可选的一句备注 */
  title: string;
  createdAt: number;
}

/* ------------------------- IndexedDB 薄封装 ------------------------- */

// 单例连接。之前每次事务后 db.close(),并发调用会把连接提前关掉导致后续事务失败——
// 这是一个真实出现过的竞态 bug。改为复用一个长连接。
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.onabort = () => reject(t.error);
  });
}

/* ------------------------------- 组合式 ------------------------------- */

export function useGallery() {
  const works = ref<Work[]>([]);
  const ready = ref(false);
  const error = ref('');

  async function refresh() {
    try {
      const all = await tx<Work[]>('readonly', (s) => s.getAll());
      // 只在尚未就绪时用磁盘数据填充。就绪后 works 由乐观更新维护,
      // refresh 的异步返回不应覆盖期间发生的增删改(否则会有竞态)。
      if (!ready.value) {
        works.value = all.sort((a, b) => b.createdAt - a.createdAt);
        ready.value = true;
      }
    } catch {
      // IndexedDB 在隐私模式或旧浏览器下可能不可用。降级为空,不崩。
      error.value = '这台设备无法保存作品(可能是隐私模式)';
      works.value = [];
      ready.value = true;
    }
  }

  async function add(w: Omit<Work, 'id' | 'createdAt'>): Promise<boolean> {
    const clean: Omit<Work, 'id' | 'createdAt'> = JSON.parse(JSON.stringify(w));
    const work: Work = { ...clean, id: `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
    const prev = works.value;
    works.value = [work, ...works.value];
    try {
      await tx('readwrite', (s) => s.add(work));
      return true;
    } catch {
      works.value = prev;
      error.value = '保存失败';
      return false;
    }
  }

  async function remove(id: string) {
    const prev = works.value;
    works.value = works.value.filter((w) => w.id !== id);
    try {
      await tx('readwrite', (s) => s.delete(id));
    } catch {
      works.value = prev;   // 删除失败回滚
    }
  }

  async function rename(id: string, title: string) {
    const w = works.value.find((x) => x.id === id);
    if (!w) return;
    // 剥掉可能存在的 Vue reactive proxy——IndexedDB 的结构化克隆无法克隆 proxy,
    // 会抛 DataCloneError。JSON 往返得到纯数据对象。
    const updated: Work = { ...JSON.parse(JSON.stringify(w)), title: title.trim() };
    const prev = works.value;
    // 乐观更新:先改内存让 UI 立即响应,落盘失败再回滚
    works.value = works.value.map((x) => (x.id === id ? updated : x));
    try {
      await tx('readwrite', (s) => s.put(updated));
    } catch {
      works.value = prev;
    }
  }

  refresh();

  return { works, ready, error, add, remove, rename, refresh };
}
