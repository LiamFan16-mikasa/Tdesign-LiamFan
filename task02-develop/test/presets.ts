/**
 * 预设库的存取逻辑测试。localStorage 用桩替代，重点验三件事：
 *   增删改查正确
 *   写入失败（配额满 / 隐私模式）时回滚，不留假数据
 *   读到脏数据或坏 JSON 时不崩
 */
const store: Record<string, string> = {};
let failNext = false;
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { if (failNext) throw new Error('QuotaExceeded'); store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

import { usePresets } from '@/composables/usePresets';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.log(`  ✗ ${name}`)); };

const p = usePresets();
const base = { name: '暖金', hex: '#B8791F', blend: 'softLight' as const, strength: 45, thumb: '' };

ok('初始为空', p.items.value.length === 0);
ok('新增返回 true', p.add(base) === true);
p.add({ ...base, name: '冷蓝时刻', hex: '#1D4E89', strength: 60 });
ok('数量为 2', p.items.value.length === 2);

p.keyword.value = '冷蓝';
ok('按名字搜索', p.filtered.value.length === 1 && p.filtered.value[0].name === '冷蓝时刻');
p.keyword.value = 'b8791f';
ok('按色值搜索，大小写不敏感', p.filtered.value.length === 1);
p.keyword.value = '';
ok('无关键字返回全部', p.filtered.value.length === 2);
ok('按时间倒序', p.filtered.value[0].createdAt >= p.filtered.value[1].createdAt);

const id = p.items.value[0].id;
p.rename(id, '  暖金黄昏  ');
ok('重命名并去掉首尾空格', p.items.value[0].name === '暖金黄昏');
p.rename(id, '   ');
ok('空名字被忽略', p.items.value[0].name === '暖金黄昏');

failNext = true;
const before = p.items.value.length;
ok('写入失败返回 false', p.add({ ...base, name: '写不进去' }) === false);
ok('写入失败后回滚，不留假数据', p.items.value.length === before);
ok('写入失败有错误信息', p.error.value.length > 0);
failNext = false;

p.remove(id);
ok('删除生效', p.items.value.length === 1);

store['xianyingtai:presets'] = JSON.stringify([{ id: 'x' }, null, { id: 'y', name: 'n', hex: '#fff', strength: 1 }]);
ok('脏数据被逐条过滤', usePresets().items.value.length === 1);
store['xianyingtai:presets'] = 'not json';
ok('坏 JSON 不崩', usePresets().items.value.length === 0);
store['xianyingtai:presets'] = JSON.stringify({ nope: true });
ok('非数组不崩', usePresets().items.value.length === 0);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
