import { h, render } from 'vue';
import type { SampleBankRenderOptions } from '../../ui-modern/components/appShellRenderer';
import SampleBankView from '../components/SampleBankView.vue';

export const renderSampleBankView = (
  container: HTMLElement,
  options: SampleBankRenderOptions,
): void => {
  render(h(SampleBankView, options), container);
};
