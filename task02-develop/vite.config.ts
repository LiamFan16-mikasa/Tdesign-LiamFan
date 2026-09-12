import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import Components from 'unplugin-vue-components/vite';
import { TDesignResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages 部署在仓库子目录下，构建产物的资源路径要带上这一段。
  // 本地 dev 不受影响。
  // 预览(vite preview)也要用同一个子路径,否则本地预览加载不到构建产物里的资源。
  base: command === 'build' || isPreview ? '/Tdesign-LiamFan/task02-develop/dist/' : '/',

  plugins: [
    vue(),
    // 按需引入。整包引入 TDesign 会让产物到 1.4 MB JS + 450 KB CSS，
    // 而这个应用只用到十几个组件。
    Components({
      resolvers: [TDesignResolver({ library: 'vue-next' })],
      dts: 'src/components.d.ts',
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 直接指向 Task 01 的源码，不复制一份。
      // 复制会漂移：改了 Task 01 忘了同步，最后两份不一致。
      '@palette': fileURLToPath(new URL('../task01-palette/src', import.meta.url)),
    },
  },

  server: {
    // alias 指到了项目根目录之外，要显式放行
    fs: { allow: ['..'] },
  },
}));
