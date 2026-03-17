import './hybrid.css';
import './modern-enhancements.css';

import { createApp } from 'vue';
import App from './ui-vue/App.vue';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Application root is missing.');
}

root.replaceChildren();
createApp(App).mount(root);
