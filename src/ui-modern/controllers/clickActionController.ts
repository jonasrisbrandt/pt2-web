import type { CursorField, TrackerSnapshot } from '../../core/trackerTypes';
import type { TrackerEngine } from '../../core/trackerEngine';
import { clamp, MAX_OCTAVE, MIN_OCTAVE, SAMPLE_PAGE_SIZE } from '../../ui/appShared';
import { saveModuleFile, saveModuleFileAs } from './fileController';
import type { TransportMode } from '../../core/trackerTypes';

export type ViewMode = 'modern' | 'classic';

export interface SampleEditorViewOverride {
  sample: number;
  start: number;
  length: number;
}

export interface ModernClickActionContext {
  target: HTMLElement;
  engine: TrackerEngine;
  snapshot: TrackerSnapshot;
  moduleInput: HTMLInputElement;
  sampleInput: HTMLInputElement;
  keyboardOctave: number;
  preferredTransportMode: TransportMode;
  sampleEditorViewOverride: SampleEditorViewOverride | null;
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean;
  clearSampleEditorViewOverride: () => void;
  getSampleEditorView: (snapshot: TrackerSnapshot) => { start: number; length: number; end: number };
  getSampleEditorZoomAnchor: () => number;
  getSamplePageCount: (snapshot: TrackerSnapshot) => number;
  invalidateAllSampleCaches: () => void;
  invalidateSampleCache: (sample: number) => void;
  refreshSelectedSampleWaveform: (snapshot: TrackerSnapshot, force?: boolean) => void;
  releaseClassicKeys: () => void;
  render: () => void;
  resolveSamplePage: (snapshot: TrackerSnapshot) => number;
  startSamplePreviewSession: (snapshot: TrackerSnapshot, mode: 'sample' | 'view' | 'selection') => void;
  stopSamplePreviewSession: () => void;
  setKeyboardOctave: (value: number) => void;
  setLastSelectedSample: (value: number) => void;
  setPendingSampleImportSlot: (value: number | null) => void;
  setPreferredTransportMode: (value: TransportMode) => void;
  setSampleEditorViewOverride: (value: SampleEditorViewOverride | null) => void;
  setSamplePage: (value: number) => void;
  setSamplePreviewPlaying: (value: boolean) => void;
  setSnapshot: (snapshot: TrackerSnapshot) => void;
  setViewMode: (mode: ViewMode) => void;
  setVisualizationMode: (mode: 'piano') => void;
  shiftVisualization: (direction: -1 | 1) => void;
}

export const handleModernClickAction = async ({
  target,
  engine,
  snapshot,
  moduleInput,
  sampleInput,
  keyboardOctave,
  preferredTransportMode,
  sampleEditorViewOverride,
  canEditSnapshot,
  clearSampleEditorViewOverride,
  getSampleEditorView,
  getSampleEditorZoomAnchor,
  getSamplePageCount,
  invalidateAllSampleCaches,
  invalidateSampleCache,
  refreshSelectedSampleWaveform,
  releaseClassicKeys,
  render,
  resolveSamplePage,
  startSamplePreviewSession,
  stopSamplePreviewSession,
  setKeyboardOctave,
  setLastSelectedSample,
  setPendingSampleImportSlot,
  setPreferredTransportMode,
  setSampleEditorViewOverride,
  setSamplePage,
  setSamplePreviewPlaying,
  setSnapshot,
  setViewMode,
  setVisualizationMode,
  shiftVisualization,
}: ModernClickActionContext): Promise<boolean> => {
  switch (target.dataset.action) {
    case 'new-song':
      clearSampleEditorViewOverride();
      invalidateAllSampleCaches();
      engine.dispatch({ type: 'song/new' });
      return true;
    case 'load-module':
      moduleInput.click();
      return true;
    case 'save-module':
      await saveModuleFile(engine);
      return true;
    case 'save-module-as':
      await saveModuleFileAs(engine);
      return true;
    case 'import-samples':
      sampleInput.multiple = true;
      setPendingSampleImportSlot(null);
      sampleInput.click();
      return true;
    case 'toggle-play':
    case 'transport-toggle':
      if (snapshot.transport.playing) {
        engine.setTransport({ type: 'transport/pause' });
      } else if (preferredTransportMode === 'pattern') {
        engine.setTransport({ type: 'transport/play-pattern' });
      } else {
        engine.setTransport({ type: 'transport/play-song' });
      }
      return true;
    case 'transport-toggle-mode': {
      const nextMode: TransportMode = preferredTransportMode === 'pattern' ? 'song' : 'pattern';
      setPreferredTransportMode(nextMode);
      if (snapshot.transport.playing) {
        engine.setTransport({ type: nextMode === 'pattern' ? 'transport/play-pattern' : 'transport/play-song' });
      } else {
        render();
      }
      return true;
    }
    case 'audio-cycle-mode':
      engine.dispatch({ type: 'audio/cycle-mode' });
      return true;
    case 'transport-play-song':
      setPreferredTransportMode('song');
      engine.setTransport({ type: 'transport/play-song' });
      return true;
    case 'transport-pause':
      engine.setTransport({ type: 'transport/pause' });
      return true;
    case 'transport-stop':
      engine.setTransport({ type: 'transport/stop' });
      return true;
    case 'stop':
      engine.setTransport({ type: 'transport/stop' });
      return true;
    case 'toggle-track-mute':
      engine.dispatch({
        type: 'channel/toggle-mute',
        channel: Number(target.dataset.channel),
      });
      return true;
    case 'song-position-down':
      if (canEditSnapshot(snapshot)) {
        engine.dispatch({
          type: 'song/set-position',
          position: clamp(snapshot.transport.position - 1, 0, snapshot.song.length - 1),
        });
      }
      return true;
    case 'song-position-up':
      if (canEditSnapshot(snapshot)) {
        engine.dispatch({
          type: 'song/set-position',
          position: clamp(snapshot.transport.position + 1, 0, snapshot.song.length - 1),
        });
      }
      return true;
    case 'song-pattern-down':
      if (canEditSnapshot(snapshot)) {
        engine.dispatch({
          type: 'song/set-pattern',
          pattern: clamp(snapshot.pattern.index - 1, 0, 99),
        });
      }
      return true;
    case 'song-pattern-up':
      if (canEditSnapshot(snapshot)) {
        engine.dispatch({
          type: 'song/set-pattern',
          pattern: clamp(snapshot.pattern.index + 1, 0, 99),
        });
      }
      return true;
    case 'song-length-down':
      if (canEditSnapshot(snapshot)) {
        engine.dispatch({ type: 'song/adjust-length', delta: -1 });
      }
      return true;
    case 'song-length-up':
      if (canEditSnapshot(snapshot)) {
        engine.dispatch({ type: 'song/adjust-length', delta: 1 });
      }
      return true;
    case 'song-bpm-down':
      if (canEditSnapshot(snapshot)) {
        engine.dispatch({
          type: 'song/set-bpm',
          bpm: clamp(snapshot.transport.bpm - 1, 32, 255),
        });
      }
      return true;
    case 'song-bpm-up':
      if (canEditSnapshot(snapshot)) {
        engine.dispatch({
          type: 'song/set-bpm',
          bpm: clamp(snapshot.transport.bpm + 1, 32, 255),
        });
      }
      return true;
    case 'view-modern':
      releaseClassicKeys();
      setViewMode('modern');
      render();
      return true;
    case 'view-classic':
      releaseClassicKeys();
      setViewMode('classic');
      render();
      return true;
    case 'octave-down':
      setKeyboardOctave(clamp(keyboardOctave - 1, MIN_OCTAVE, MAX_OCTAVE));
      render();
      return true;
    case 'octave-up':
      setKeyboardOctave(clamp(keyboardOctave + 1, MIN_OCTAVE, MAX_OCTAVE));
      render();
      return true;
    case 'octave-set-1':
      setKeyboardOctave(1);
      render();
      return true;
    case 'octave-set-2':
      setKeyboardOctave(2);
      render();
      return true;
    case 'visualization-prev':
      shiftVisualization(-1);
      return true;
    case 'visualization-next':
      shiftVisualization(1);
      return true;
    case 'visualization-piano':
      setVisualizationMode('piano');
      render();
      return true;
    case 'sample-page-prev':
      setSamplePage(clamp(resolveSamplePage(snapshot) - 1, 0, getSamplePageCount(snapshot) - 1));
      render();
      return true;
    case 'sample-page-next':
      setSamplePage(clamp(resolveSamplePage(snapshot) + 1, 0, getSamplePageCount(snapshot) - 1));
      render();
      return true;
    case 'sample-preview-play':
      engine.dispatch({ type: 'sample-editor/play', mode: 'sample' });
      {
        const nextSnapshot = engine.getSnapshot();
        setSnapshot(nextSnapshot);
        startSamplePreviewSession(nextSnapshot, 'sample');
        render();
      }
      setSamplePreviewPlaying(true);
      return true;
    case 'sample-load-selected':
      sampleInput.multiple = false;
      setPendingSampleImportSlot(snapshot.selectedSample);
      sampleInput.click();
      return true;
    case 'sample-preview-stop':
      engine.setTransport({ type: 'transport/pause' });
      stopSamplePreviewSession();
      setSamplePreviewPlaying(false);
      render();
      return true;
    case 'sample-editor-open':
      clearSampleEditorViewOverride();
      engine.dispatch({ type: 'sample-editor/open', sample: snapshot.selectedSample });
      setSnapshot(engine.getSnapshot());
      refreshSelectedSampleWaveform(engine.getSnapshot(), false);
      render();
      return true;
    case 'sample-editor-close':
      clearSampleEditorViewOverride();
      engine.dispatch({ type: 'sample-editor/close' });
      setSnapshot(engine.getSnapshot());
      render();
      return true;
    case 'sample-editor-show-all':
      clearSampleEditorViewOverride();
      engine.dispatch({ type: 'sample-editor/show-all' });
      setSnapshot(engine.getSnapshot());
      render();
      return true;
    case 'sample-editor-show-selection':
      if (snapshot.sampleEditor.selectionStart !== null && snapshot.sampleEditor.selectionEnd !== null) {
        setSampleEditorViewOverride({
          sample: snapshot.selectedSample,
          start: snapshot.sampleEditor.selectionStart,
          length: Math.max(2, snapshot.sampleEditor.selectionEnd - snapshot.sampleEditor.selectionStart),
        });
        render();
      }
      return true;
    case 'sample-editor-zoom-in': {
      clearSampleEditorViewOverride();
      const anchor = getSampleEditorZoomAnchor();
      engine.dispatch({ type: 'sample-editor/zoom-in', anchor });
      const nextSnapshot = engine.getSnapshot();
      setSnapshot(nextSnapshot);
      render();
      return true;
    }
    case 'sample-editor-zoom-out': {
      clearSampleEditorViewOverride();
      const anchor = getSampleEditorZoomAnchor();
      engine.dispatch({ type: 'sample-editor/zoom-out', anchor });
      const nextSnapshot = engine.getSnapshot();
      setSnapshot(nextSnapshot);
      render();
      return true;
    }
    case 'sample-editor-preview': {
      if (sampleEditorViewOverride) {
        const view = getSampleEditorView(snapshot);
        engine.dispatch({ type: 'sample-editor/set-view', start: view.start, length: view.length });
      }
      engine.dispatch({ type: 'sample-editor/play', mode: 'sample' });
      {
        const nextSnapshot = engine.getSnapshot();
        setSnapshot(nextSnapshot);
        startSamplePreviewSession(nextSnapshot, 'sample');
        render();
      }
      setSamplePreviewPlaying(true);
      return true;
    }
    case 'sample-editor-stop':
      engine.setTransport({ type: 'transport/pause' });
      stopSamplePreviewSession();
      setSamplePreviewPlaying(false);
      render();
      return true;
    case 'sample-editor-toggle-loop':
      if (!canEditSnapshot(snapshot)) {
        return true;
      }
      if (!(snapshot.samples[snapshot.selectedSample].loopLength > 2 && snapshot.samples[snapshot.selectedSample].length > 2)
        && snapshot.sampleEditor.selectionStart !== null
        && snapshot.sampleEditor.selectionEnd !== null
      ) {
        engine.dispatch({
          type: 'sample-editor/set-loop',
          start: snapshot.sampleEditor.selectionStart,
          end: snapshot.sampleEditor.selectionEnd,
        });
      } else {
        engine.dispatch({
          type: 'sample-editor/toggle-loop',
          enabled: !(snapshot.samples[snapshot.selectedSample].loopLength > 2 && snapshot.samples[snapshot.selectedSample].length > 2),
        });
      }
      setSnapshot(engine.getSnapshot());
      render();
      return true;
    case 'sample-editor-crop': {
      if (!canEditSnapshot(snapshot)) {
        return true;
      }
      clearSampleEditorViewOverride();
      engine.dispatch({ type: 'sample-editor/crop' });
      invalidateSampleCache(snapshot.selectedSample);
      const nextSnapshot = engine.getSnapshot();
      setSnapshot(nextSnapshot);
      refreshSelectedSampleWaveform(nextSnapshot, true);
      render();
      return true;
    }
    case 'sample-editor-cut': {
      if (!canEditSnapshot(snapshot)) {
        return true;
      }
      clearSampleEditorViewOverride();
      engine.dispatch({ type: 'sample-editor/cut' });
      invalidateSampleCache(snapshot.selectedSample);
      const nextSnapshot = engine.getSnapshot();
      setSnapshot(nextSnapshot);
      refreshSelectedSampleWaveform(nextSnapshot, true);
      render();
      return true;
    }
    case 'select-cell':
      engine.dispatch({
        type: 'cursor/set',
        row: Number(target.dataset.row),
        channel: Number(target.dataset.channel),
        field: (target.dataset.field as CursorField | undefined) ?? 'note',
      });
      return true;
    case 'select-sample': {
      clearSampleEditorViewOverride();
      const selectedSample = Number(target.dataset.sample);
      setLastSelectedSample(selectedSample);
      setSamplePage(clamp(Math.floor(selectedSample / SAMPLE_PAGE_SIZE), 0, getSamplePageCount(snapshot) - 1));
      engine.dispatch({
        type: 'sample/select',
        sample: selectedSample,
      });
      const nextSnapshot = engine.getSnapshot();
      setSnapshot(nextSnapshot);
      refreshSelectedSampleWaveform(nextSnapshot, false);
      if (nextSnapshot.samples[selectedSample]?.length === 0) {
        setPendingSampleImportSlot(selectedSample);
        sampleInput.multiple = false;
        render();
        sampleInput.click();
        return true;
      }
      render();
      return true;
    }
    default:
      return false;
  }
};
