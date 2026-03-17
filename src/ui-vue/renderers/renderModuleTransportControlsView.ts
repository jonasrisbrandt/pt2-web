import { h, render } from 'vue';
import type { ToolIconButtonRenderOptions } from '../../ui-modern/components/appShellRenderer';
import ModuleTransportControlsView from '../components/ModuleTransportControlsView.vue';

export const renderModuleTransportControlsView = (
  container: HTMLElement,
  buttons: ToolIconButtonRenderOptions[],
): void => {
  render(h(ModuleTransportControlsView, { buttons }), container);
};
