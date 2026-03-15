import type { SampleSlot, TrackerSnapshot } from '../../core/trackerTypes';

export const setLiveText = (root: HTMLElement, role: string, value: string): void => {
  const element = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
  if (element) {
    element.textContent = value;
  }
};

export interface TrackMuteButtonUpdateOptions {
  root: HTMLElement;
  snapshot: TrackerSnapshot;
  renderMuteIcon: (muted: boolean, channel: number) => string;
}

export const updateTrackMuteButtons = ({
  root,
  snapshot,
  renderMuteIcon,
}: TrackMuteButtonUpdateOptions): void => {
  for (let channel = 0; channel < 4; channel += 1) {
    const muted = snapshot.editor.muted[channel] ?? false;
    const button = root.querySelector<HTMLButtonElement>(`[data-role="track-mute-${channel}"]`);
    if (button) {
      button.classList.toggle('is-muted', muted);
      button.setAttribute('aria-pressed', muted ? 'true' : 'false');
      button.setAttribute('aria-label', `${muted ? 'Unmute' : 'Mute'} track ${channel + 1}`);
      button.innerHTML = renderMuteIcon(muted, channel);
    }

    const label = button?.closest('.track-label');
    label?.classList.toggle('is-muted', muted);
  }
};

export interface SamplePanelUpdateOptions {
  root: HTMLElement;
  snapshot: TrackerSnapshot;
  samplePanelKey: string | null;
  samplePreviewCanvas: HTMLCanvasElement;
  formatSelectedSampleHint: (sample: SampleSlot) => string;
  resolveSamplePage: (snapshot: TrackerSnapshot) => number;
  getSamplePageCount: (snapshot: TrackerSnapshot) => number;
  getSamplePanelKey: (snapshot: TrackerSnapshot, samplePage: number) => string;
  getSelectedSampleHeading: (sample: SampleSlot) => string;
  renderSampleBank: (snapshot: TrackerSnapshot, samplePage: number) => string;
  renderSelectedSamplePanel: (sample: SampleSlot, snapshot: TrackerSnapshot) => string;
  renderSelectedSampleTitle?: (sample: SampleSlot) => string;
  syncSelectedSampleTitle?: boolean;
}

export const updateSamplePanel = ({
  root,
  snapshot,
  samplePanelKey,
  samplePreviewCanvas,
  formatSelectedSampleHint,
  resolveSamplePage,
  getSamplePageCount,
  getSamplePanelKey,
  getSelectedSampleHeading,
  renderSampleBank,
  renderSelectedSamplePanel,
  renderSelectedSampleTitle,
  syncSelectedSampleTitle = true,
}: SamplePanelUpdateOptions): string => {
  const selectedSample = snapshot.samples[snapshot.selectedSample];
  const samplePage = resolveSamplePage(snapshot);
  const pageCount = getSamplePageCount(snapshot);
  const nextSamplePanelKey = getSamplePanelKey(snapshot, samplePage);

  setLiveText(root, 'sample-page-label', `Page ${samplePage + 1} / ${pageCount}`);

  const prevButton = root.querySelector<HTMLButtonElement>('[data-action="sample-page-prev"]');
  if (prevButton) {
    prevButton.disabled = samplePage <= 0;
  }

  const nextButton = root.querySelector<HTMLButtonElement>('[data-action="sample-page-next"]');
  if (nextButton) {
    nextButton.disabled = samplePage >= pageCount - 1;
  }

  if (samplePanelKey === nextSamplePanelKey) {
    if (syncSelectedSampleTitle) {
      const title = root.querySelector<HTMLElement>('[data-role="selected-sample-title"]');
      if (title) {
        if (renderSelectedSampleTitle) {
          title.innerHTML = renderSelectedSampleTitle(selectedSample);
        } else {
          title.textContent = getSelectedSampleHeading(selectedSample);
        }
      }
    }
    setLiveText(root, 'selected-sample-hint', formatSelectedSampleHint(selectedSample));
    return nextSamplePanelKey;
  }

  const bank = root.querySelector<HTMLElement>('[data-role="sample-bank"]');
  if (bank) {
    bank.innerHTML = renderSampleBank(snapshot, samplePage);
  }

  const detail = root.querySelector<HTMLElement>('[data-role="sample-detail-content"]');
  if (detail) {
    detail.innerHTML = renderSelectedSamplePanel(selectedSample, snapshot);
    const previewHost = detail.querySelector<HTMLElement>('[data-role="sample-preview-host"]');
    if (previewHost) {
      previewHost.replaceChildren(samplePreviewCanvas);
    }
  }

  if (syncSelectedSampleTitle) {
    const title = root.querySelector<HTMLElement>('[data-role="selected-sample-title"]');
    if (title) {
      if (renderSelectedSampleTitle) {
        title.innerHTML = renderSelectedSampleTitle(selectedSample);
      } else {
        title.textContent = getSelectedSampleHeading(selectedSample);
      }
    }
  }
  setLiveText(root, 'selected-sample-hint', formatSelectedSampleHint(selectedSample));
  return nextSamplePanelKey;
};
