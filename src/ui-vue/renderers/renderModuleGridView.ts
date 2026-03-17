import { h, render } from 'vue';
import type { ModuleCardRenderOptions } from '../../ui-modern/components/appShellRenderer';
import ModuleGridView from '../components/ModuleGridView.vue';

export const renderModuleGridView = (
  container: HTMLElement,
  cards: ModuleCardRenderOptions[],
): void => {
  render(h(ModuleGridView, { cards }), container);
};
