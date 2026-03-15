import type { TrackerEngine } from '../../core/trackerEngine';
import type { TrackerSnapshot } from '../../core/trackerTypes';
import { clamp } from '../../ui/appShared';

export interface ModernInputActionContext {
  target: HTMLInputElement;
  engine: TrackerEngine;
  snapshot: TrackerSnapshot;
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean;
  getSampleEditorView: (snapshot: TrackerSnapshot) => { start: number; length: number; end: number };
  refreshSelectedSampleWaveform: (snapshot: TrackerSnapshot, force?: boolean) => void;
  setSuppressNextModernRender?: (value: boolean) => void;
  setSampleEditorViewOverride: (value: { sample: number; start: number; length: number } | null) => void;
  setSnapshot: (snapshot: TrackerSnapshot) => void;
  updateModernLiveRegions: (snapshot: TrackerSnapshot) => void;
}

export const handleModernInputAction = ({
  target,
  engine,
  snapshot,
  canEditSnapshot,
  getSampleEditorView,
  refreshSelectedSampleWaveform,
  setSuppressNextModernRender,
  setSampleEditorViewOverride,
  setSnapshot,
  updateModernLiveRegions,
}: ModernInputActionContext): boolean => {
  const inputKey = target.dataset.input;
  if (!inputKey) {
    return false;
  }

  const selectedSample = snapshot.selectedSample;
  const canEdit = canEditSnapshot(snapshot);

  switch (inputKey) {
    case 'sample-name':
      if (!canEdit) {
        return true;
      }
      engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { name: target.value } });
      break;
    case 'sample-volume':
      if (!canEdit) {
        return true;
      }
      setSuppressNextModernRender?.(true);
      engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { volume: clamp(Number(target.value), 0, 64) } });
      break;
    case 'sample-finetune':
      if (!canEdit) {
        return true;
      }
      setSuppressNextModernRender?.(true);
      engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { fineTune: clamp(Number(target.value), -8, 7) } });
      break;
    case 'sample-loop-start':
      if (!canEdit) {
        return true;
      }
      engine.dispatch({ type: 'sample-editor/set-loop', start: Math.max(0, Number(target.value)) });
      break;
    case 'sample-loop-end':
      if (!canEdit) {
        return true;
      }
      engine.dispatch({ type: 'sample-editor/set-loop', end: Math.max(2, Number(target.value)) });
      break;
    case 'sample-loop-enabled':
      if (!canEdit) {
        return true;
      }
      engine.dispatch({ type: 'sample-editor/toggle-loop', enabled: target.checked });
      break;
    case 'sample-editor-scroll':
      setSampleEditorViewOverride({
        sample: snapshot.selectedSample,
        start: Math.max(0, Number(target.value)),
        length: getSampleEditorView(snapshot).length,
      });
      updateModernLiveRegions(snapshot);
      return true;
    default:
      return false;
  }

  const nextSnapshot = engine.getSnapshot();
  setSnapshot(nextSnapshot);
  refreshSelectedSampleWaveform(nextSnapshot, true);
  updateModernLiveRegions(nextSnapshot);
  return true;
};
