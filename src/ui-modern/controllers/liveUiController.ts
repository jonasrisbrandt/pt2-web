import type { SampleSlot, TrackerSnapshot } from '../../core/trackerTypes';

export const setLiveText = (root: HTMLElement, role: string, value: string): void => {
  const element = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
  if (element) {
    element.textContent = value;
  }
};

export interface LiveUiRefs {
  samplePageLabel: HTMLElement | null;
  samplePagePrevButton: HTMLButtonElement | null;
  samplePageNextButton: HTMLButtonElement | null;
  sampleBank: HTMLElement | null;
  sampleDetailContent: HTMLElement | null;
  selectedSampleTitle: HTMLElement | null;
  selectedSampleHint: HTMLElement | null;
  trackMuteButtons: Array<HTMLButtonElement | null>;
  trackMuteLabels: Array<HTMLElement | null>;
}

export interface TrackMuteButtonUpdateOptions {
  refs: LiveUiRefs;
  snapshot: TrackerSnapshot;
  renderMuteIcon: (muted: boolean, channel: number) => string;
}

export const updateTrackMuteButtons = ({
  refs,
  snapshot,
  renderMuteIcon,
}: TrackMuteButtonUpdateOptions): void => {
  for (let channel = 0; channel < 4; channel += 1) {
    const muted = snapshot.editor.muted[channel] ?? false;
    const button = refs.trackMuteButtons[channel] ?? null;
    if (button) {
      button.classList.toggle('is-muted', muted);
      button.setAttribute('aria-pressed', muted ? 'true' : 'false');
      const label = `${muted ? 'Unmute' : 'Mute'} track ${channel + 1}`;
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
      }
      if (button.dataset.mutedState !== String(muted)) {
        button.dataset.mutedState = String(muted);
        button.innerHTML = renderMuteIcon(muted, channel);
      }
    }

    const label = refs.trackMuteLabels[channel] ?? null;
    label?.classList.toggle('is-muted', muted);
  }
};

export interface SamplePanelUpdateOptions {
  refs: LiveUiRefs;
  snapshot: TrackerSnapshot;
  samplePanelKey: string | null;
  samplePreviewCanvas: HTMLCanvasElement;
  formatSelectedSampleHint: (sample: SampleSlot) => string;
  resolveSamplePage: (snapshot: TrackerSnapshot) => number;
  getSamplePageCount: (snapshot: TrackerSnapshot) => number;
  getSamplePanelKey: (snapshot: TrackerSnapshot, samplePage: number) => string;
  getSelectedSampleHeading: (sample: SampleSlot) => string;
  renderSampleBank: (snapshot: TrackerSnapshot, samplePage: number) => string;
  mountSampleBank?: (container: HTMLElement, snapshot: TrackerSnapshot, samplePage: number) => void;
  renderSelectedSamplePanel: (sample: SampleSlot, snapshot: TrackerSnapshot) => string;
  mountSelectedSamplePanel?: (container: HTMLElement, sample: SampleSlot, snapshot: TrackerSnapshot) => void;
  renderSelectedSampleTitle?: (sample: SampleSlot) => string;
  syncSelectedSampleTitle?: boolean;
}

export const updateSamplePanel = ({
  refs,
  snapshot,
  samplePanelKey,
  samplePreviewCanvas,
  formatSelectedSampleHint,
  resolveSamplePage,
  getSamplePageCount,
  getSamplePanelKey,
  getSelectedSampleHeading,
  renderSampleBank,
  mountSampleBank,
  renderSelectedSamplePanel,
  mountSelectedSamplePanel,
  renderSelectedSampleTitle,
  syncSelectedSampleTitle = true,
}: SamplePanelUpdateOptions): string => {
  const selectedSample = snapshot.samples[snapshot.selectedSample];
  const samplePage = resolveSamplePage(snapshot);
  const pageCount = getSamplePageCount(snapshot);
  const nextSamplePanelKey = getSamplePanelKey(snapshot, samplePage);

  if (refs.samplePageLabel && refs.samplePageLabel.textContent !== `Page ${samplePage + 1} / ${pageCount}`) {
    refs.samplePageLabel.textContent = `Page ${samplePage + 1} / ${pageCount}`;
  }

  const prevButton = refs.samplePagePrevButton;
  if (prevButton) {
    prevButton.disabled = samplePage <= 0;
  }

  const nextButton = refs.samplePageNextButton;
  if (nextButton) {
    nextButton.disabled = samplePage >= pageCount - 1;
  }

  if (samplePanelKey === nextSamplePanelKey) {
    if (syncSelectedSampleTitle) {
      const title = refs.selectedSampleTitle;
      if (title) {
        if (renderSelectedSampleTitle) {
          const html = renderSelectedSampleTitle(selectedSample);
          if (title.innerHTML !== html) {
            title.innerHTML = html;
          }
        } else {
          const text = getSelectedSampleHeading(selectedSample);
          if (title.textContent !== text) {
            title.textContent = text;
          }
        }
      }
    }
    if (refs.selectedSampleHint) {
      const hint = formatSelectedSampleHint(selectedSample);
      if (refs.selectedSampleHint.textContent !== hint) {
        refs.selectedSampleHint.textContent = hint;
      }
    }
    return nextSamplePanelKey;
  }

  const bank = refs.sampleBank;
  if (bank) {
    if (mountSampleBank) {
      mountSampleBank(bank, snapshot, samplePage);
    } else {
      bank.innerHTML = renderSampleBank(snapshot, samplePage);
    }
  }

  const detail = refs.sampleDetailContent;
  if (detail) {
    if (mountSelectedSamplePanel) {
      mountSelectedSamplePanel(detail, selectedSample, snapshot);
    } else {
      detail.innerHTML = renderSelectedSamplePanel(selectedSample, snapshot);
    }
    const previewHost = detail.querySelector<HTMLElement>('[data-role="sample-preview-host"]');
    if (previewHost) {
      previewHost.replaceChildren(samplePreviewCanvas);
    }
  }

  if (syncSelectedSampleTitle) {
    const title = refs.selectedSampleTitle;
    if (title) {
      if (renderSelectedSampleTitle) {
        title.innerHTML = renderSelectedSampleTitle(selectedSample);
      } else {
        title.textContent = getSelectedSampleHeading(selectedSample);
      }
    }
  }
  if (refs.selectedSampleHint) {
    refs.selectedSampleHint.textContent = formatSelectedSampleHint(selectedSample);
  }
  return nextSamplePanelKey;
};
