import type { TransportMode, TrackerSnapshot } from '../../core/trackerTypes';
import type {
  ModuleGridRenderOptions,
  ToolIconButtonRenderOptions,
  TrackHeaderRenderOptions,
} from '../../ui-modern/components/appShellRenderer';
import {
  buildTrackerModuleGridOptions,
  buildTrackerModuleTransportOptions,
  buildTrackerTrackHeaderOptions,
} from './trackerShellViewController';

export interface TrackerPlaybackHudState {
  moduleTransportOptions: ToolIconButtonRenderOptions[];
  moduleGridOptions: ModuleGridRenderOptions;
  trackHeaders: TrackHeaderRenderOptions[];
}

export interface BuildTrackerPlaybackHudStateOptions {
  snapshot: TrackerSnapshot;
  preferredTransportMode: TransportMode;
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean;
  getAudioModeLabel: (snapshot: TrackerSnapshot) => string;
  getAudioModeValue: (snapshot: TrackerSnapshot) => 'C' | 'M' | 'A';
  renderIcon: (iconNode: unknown) => string;
}

export const buildTrackerModuleTransportHudOptions = ({
  snapshot,
  preferredTransportMode,
  getAudioModeLabel,
  getAudioModeValue,
  renderIcon,
}: BuildTrackerPlaybackHudStateOptions): ToolIconButtonRenderOptions[] => {
  const playbackMode = snapshot.transport.playing ? snapshot.transport.mode : preferredTransportMode;

  return buildTrackerModuleTransportOptions(
    snapshot,
    playbackMode,
    getAudioModeLabel,
    getAudioModeValue,
    renderIcon,
  );
};

export const buildTrackerModuleGridHudOptions = ({
  snapshot,
  canEditSnapshot,
  renderIcon,
}: BuildTrackerPlaybackHudStateOptions): ModuleGridRenderOptions =>
  buildTrackerModuleGridOptions(snapshot, canEditSnapshot(snapshot), renderIcon);

export const buildTrackerTrackHeadersHudOptions = ({
  snapshot,
  renderIcon,
}: BuildTrackerPlaybackHudStateOptions): TrackHeaderRenderOptions[] =>
  buildTrackerTrackHeaderOptions(snapshot, renderIcon);

export const buildTrackerPlaybackHudState = (
  options: BuildTrackerPlaybackHudStateOptions,
): TrackerPlaybackHudState => ({
  moduleTransportOptions: buildTrackerModuleTransportHudOptions(options),
  moduleGridOptions: buildTrackerModuleGridHudOptions(options),
  trackHeaders: buildTrackerTrackHeadersHudOptions(options),
});
