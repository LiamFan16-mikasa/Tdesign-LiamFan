import { createApp } from 'vue';
// TDesign 的全局 token(--td-brand-color、--td-bg-color-page 这一层)必须显式引入。
// 按需引入只会带上各组件自己的样式;全局表只挂在库的总入口 es/index.mjs 上,
// 而总入口不在 TDesign 的 sideEffects 白名单里,生产构建 tree-shaking 时整张被丢掉。
// 所有组件样式都引用这些变量,于是线上主按钮透明、滑块塌没、页面底色变白。
// dev 下会预打包整个库,所以只在构建产物里才出现 —— 验收见 e2e/prodcheck.cjs。
import 'tdesign-vue-next/es/style/index.css';
import App from './App.vue';
import './style.css';

// 组件由 unplugin-vue-components 按需自动引入，这里不用 app.use(TDesign)。
// MessagePlugin 这类函数式 API 仍然从包里直接 import（见 App.vue）。
createApp(App).mount('#app');
