import { h, render } from 'vue';
import type { TrackHeaderRenderOptions } from '../../ui-modern/components/appShellRenderer';
import PatternTrackHeadersView from '../components/PatternTrackHeadersView.vue';

export const renderPatternTrackHeadersView = (
  container: HTMLElement,
  trackHeaders: TrackHeaderRenderOptions[],
): void => {
  render(h(PatternTrackHeadersView, { trackHeaders }), container);
};
