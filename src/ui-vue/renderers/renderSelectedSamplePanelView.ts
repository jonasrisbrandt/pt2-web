import { h, render } from 'vue';
import type { SelectedSamplePanelRenderOptions } from '../../ui-modern/components/markupRenderer';
import SelectedSamplePanelView from '../components/SelectedSamplePanelView.vue';

export const renderSelectedSamplePanelView = (
  container: HTMLElement,
  options: SelectedSamplePanelRenderOptions,
): void => {
  render(h(SelectedSamplePanelView, options), container);
};
