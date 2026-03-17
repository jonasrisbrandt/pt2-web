import { h, render } from 'vue';
import type { AppShellRenderOptions } from '../../ui-modern/components/appShellRenderer';
import AppShellView from '../components/AppShellView.vue';

export const renderAppShellView = (
  container: HTMLElement,
  options: AppShellRenderOptions,
): void => {
  render(h(AppShellView, options), container);
};
