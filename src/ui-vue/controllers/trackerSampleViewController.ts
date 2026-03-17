import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpDown,
  Crop,
  FileUp,
  Focus,
  PencilLine,
  Piano,
  Play,
  Repeat,
  Scissors,
  SlidersHorizontal,
  Square,
} from 'lucide';
import type { SampleSlot, TrackerSnapshot } from '../../core/trackerTypes';
import { clamp } from '../../ui/appShared';
import type { SampleBankRenderOptions } from '../../ui-modern/components/appShellRenderer';
import type { SampleEditorPanelRenderOptions, SelectedSamplePanelRenderOptions } from '../../ui-modern/components/markupRenderer';
import type { InlineNameFieldRenderOptions } from '../../ui-modern/components/viewModels';

interface BuildTrackerSampleBankOptionsArgs {
  snapshot: TrackerSnapshot;
  samplePage: number;
  pageSize: number;
  getPreviewValues: (sample: SampleSlot) => ArrayLike<number>;
}

interface BuildTrackerSelectedSamplePanelOptionsArgs {
  sample: SampleSlot;
  snapshot: TrackerSnapshot;
  editable: boolean;
  samplePreviewPlaying: boolean;
  sampleTitle: InlineNameFieldRenderOptions;
  renderIcon: (iconNode: unknown) => string;
}

interface BuildTrackerSampleEditorPanelOptionsArgs {
  snapshot: TrackerSnapshot;
  editable: boolean;
  samplePreviewPlaying: boolean;
  collapsed: boolean;
  collapseIconHtml: string;
  selectedSampleTitle: InlineNameFieldRenderOptions;
  view: { start: number; length: number; end: number };
  volumePopoverOpen: boolean;
  fineTunePopoverOpen: boolean;
  volumeEditOpen: boolean;
  fineTuneEditOpen: boolean;
  volumeEditValue: string;
  fineTuneEditValue: string;
  renderIcon: (iconNode: unknown) => string;
}

interface BuildTrackerSelectedSampleLiveStateArgs {
  snapshot: TrackerSnapshot;
  editable: boolean;
  samplePreviewPlaying: boolean;
}

interface BuildTrackerSampleEditorLiveStateArgs {
  snapshot: TrackerSnapshot;
  editable: boolean;
  samplePreviewPlaying: boolean;
  view: { start: number; length: number; end: number };
  volumePopoverOpen: boolean;
  fineTunePopoverOpen: boolean;
  volumeEditing: boolean;
  fineTuneEditing: boolean;
}

export interface TrackerSelectedSampleLiveState {
  previewLabel: string;
  previewAction: 'sample-preview-play' | 'sample-preview-stop';
  previewDisabled: boolean;
  replaceLabel: string;
  replaceDisabled: boolean;
}

export interface TrackerSampleEditorLiveState {
  previewLabel: string;
  previewAction: 'sample-editor-preview' | 'sample-editor-stop';
  previewDisabled: boolean;
  hasSelection: boolean;
  showSelectionDisabled: boolean;
  cropDisabled: boolean;
  cutDisabled: boolean;
  loopEnabled: boolean;
  loopDisabled: boolean;
  volumeDisabled: boolean;
  volumeLabel: string;
  volumeValue: string;
  volumePopoverOpen: boolean;
  fineTuneDisabled: boolean;
  fineTuneLabel: string;
  fineTuneValue: string;
  fineTunePopoverOpen: boolean;
  sampleLengthText: string;
  visibleRangeText: string;
  loopRangeText: string;
  scrollMax: string;
  scrollValue: string;
  scrollDisabled: boolean;
}

const formatFineTuneValue = (value: number): string => (value > 0 ? `+${value}` : String(value));

export const buildTrackerSampleBankOptions = ({
  snapshot,
  samplePage,
  pageSize,
  getPreviewValues,
}: BuildTrackerSampleBankOptionsArgs): SampleBankRenderOptions => {
  const start = samplePage * pageSize;
  return {
    items: snapshot.samples
      .slice(start, start + pageSize)
      .map((sample) => ({
        sample,
        selectedSample: snapshot.selectedSample,
        previewValues: getPreviewValues(sample),
      })),
  };
};

export const buildTrackerSelectedSamplePanelOptions = ({
  sample,
  snapshot,
  editable,
  samplePreviewPlaying,
  sampleTitle,
  renderIcon,
}: BuildTrackerSelectedSamplePanelOptionsArgs): SelectedSamplePanelRenderOptions => ({
  sample,
  editable,
  samplePreviewPlaying,
  sampleTitle,
  playIconHtml: renderIcon(Play),
  stopIconHtml: renderIcon(Square),
  editIconHtml: renderIcon(PencilLine),
  replaceIconHtml: renderIcon(FileUp),
  createIconHtml: renderIcon(Piano),
});

export const buildTrackerSampleEditorPanelOptions = ({
  snapshot,
  editable,
  samplePreviewPlaying,
  collapsed,
  collapseIconHtml,
  selectedSampleTitle,
  view,
  volumePopoverOpen,
  fineTunePopoverOpen,
  volumeEditOpen,
  fineTuneEditOpen,
  volumeEditValue,
  fineTuneEditValue,
  renderIcon,
}: BuildTrackerSampleEditorPanelOptionsArgs): SampleEditorPanelRenderOptions => ({
  snapshot,
  editable,
  samplePreviewPlaying,
  collapsed,
  collapseIconHtml,
  selectedSampleTitle,
  view,
  showAllIconHtml: renderIcon(ArrowLeftRight),
  showSelectionIconHtml: renderIcon(Focus),
  playIconHtml: renderIcon(Play),
  stopIconHtml: renderIcon(Square),
  loopIconHtml: renderIcon(Repeat),
  volumeIconHtml: renderIcon(SlidersHorizontal),
  fineTuneIconHtml: renderIcon(ArrowUpDown),
  cropIconHtml: renderIcon(Crop),
  cutIconHtml: renderIcon(Scissors),
  backIconHtml: renderIcon(ArrowLeft),
  volumePopoverOpen,
  fineTunePopoverOpen,
  volumeEditOpen,
  fineTuneEditOpen,
  volumeEditValue,
  fineTuneEditValue,
});

export const buildTrackerSelectedSampleLiveState = ({
  snapshot,
  editable,
  samplePreviewPlaying,
}: BuildTrackerSelectedSampleLiveStateArgs): TrackerSelectedSampleLiveState => {
  const sample = snapshot.samples[snapshot.selectedSample];
  return {
    previewLabel: samplePreviewPlaying ? 'Stop preview' : 'Play preview',
    previewAction: samplePreviewPlaying ? 'sample-preview-stop' : 'sample-preview-play',
    previewDisabled: sample.length <= 0,
    replaceLabel: sample.length > 0 ? 'Replace sample' : 'Load sample',
    replaceDisabled: !editable,
  };
};

export const buildTrackerSampleEditorLiveState = ({
  snapshot,
  editable,
  samplePreviewPlaying,
  view,
  volumePopoverOpen,
  fineTunePopoverOpen,
  volumeEditing,
  fineTuneEditing,
}: BuildTrackerSampleEditorLiveStateArgs): TrackerSampleEditorLiveState => {
  const sample = snapshot.samples[snapshot.selectedSample];
  const hasSelection = snapshot.sampleEditor.selectionStart !== null
    && snapshot.sampleEditor.selectionEnd !== null
    && snapshot.sampleEditor.selectionEnd - snapshot.sampleEditor.selectionStart >= 2;
  const loopEnabled = sample.loopLength > 2 && sample.length > 2;
  const fineTuneValue = formatFineTuneValue(sample.fineTune);
  const scrollMax = Math.max(0, snapshot.sampleEditor.sampleLength - view.length);

  return {
    previewLabel: samplePreviewPlaying ? 'Stop preview' : 'Play preview',
    previewAction: samplePreviewPlaying ? 'sample-editor-stop' : 'sample-editor-preview',
    previewDisabled: sample.length <= 0,
    hasSelection,
    showSelectionDisabled: !hasSelection,
    cropDisabled: !editable || !hasSelection,
    cutDisabled: !editable || !hasSelection,
    loopEnabled,
    loopDisabled: !editable || sample.length <= 1,
    volumeDisabled: !editable || sample.length <= 0,
    volumeLabel: `Volume ${sample.volume}`,
    volumeValue: String(sample.volume),
    volumePopoverOpen,
    fineTuneDisabled: !editable || sample.length <= 0,
    fineTuneLabel: `Fine tune ${fineTuneValue}`,
    fineTuneValue,
    fineTunePopoverOpen,
    sampleLengthText: String(sample.length),
    visibleRangeText: `${view.start} - ${view.end}`,
    loopRangeText: `${snapshot.sampleEditor.loopStart} - ${snapshot.sampleEditor.loopEnd}`,
    scrollMax: String(scrollMax),
    scrollValue: String(clamp(view.start, 0, scrollMax)),
    scrollDisabled: snapshot.sampleEditor.sampleLength <= 0,
  };
};
