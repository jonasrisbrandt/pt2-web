import type { TrackerEngine } from '../../core/trackerEngine';
import type { TrackerSnapshot } from '../../core/trackerTypes';
import { triggerDownload } from '../../ui/appShared';

const ensureModFilename = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'untitled.mod';
  }

  return /\.mod$/i.test(trimmed) ? trimmed : `${trimmed}.mod`;
};

export const saveModuleFile = async (engine: TrackerEngine): Promise<void> => {
  const file = await engine.saveModule();
  triggerDownload(file.filename, file.mimeType, file.bytes);
};

export const saveModuleFileAs = async (engine: TrackerEngine): Promise<void> => {
  const file = await engine.saveModule();
  const nextFilename = window.prompt('Save MOD as', file.filename);
  if (nextFilename === null) {
    return;
  }

  triggerDownload(ensureModFilename(nextFilename), file.mimeType, file.bytes);
};

export const loadModuleFromInput = async (
  engine: TrackerEngine,
  input: HTMLInputElement,
): Promise<void> => {
  const [file] = Array.from(input.files ?? []);

  if (file) {
    await engine.loadModule(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  input.value = '';
};

export interface LoadSampleFromInputOptions {
  engine: TrackerEngine;
  input: HTMLInputElement;
  pendingSampleImportSlot: number | null;
  onLoaded: (snapshot: TrackerSnapshot) => void;
}

export const loadSampleFromInput = async ({
  engine,
  input,
  pendingSampleImportSlot,
  onLoaded,
}: LoadSampleFromInputOptions): Promise<void> => {
  const files = Array.from(input.files ?? []);

  if (files.length === 1 && pendingSampleImportSlot !== null && !input.multiple) {
    const [file] = files;
    if (pendingSampleImportSlot !== null) {
      engine.dispatch({ type: 'sample/select', sample: pendingSampleImportSlot });
    }

    await engine.loadSample(new Uint8Array(await file.arrayBuffer()), file.name);
    onLoaded(engine.getSnapshot());
    input.value = '';
    input.multiple = false;
    return;
  }

  if (files.length > 0) {
    let snapshot = engine.getSnapshot();
    const freeSlots = snapshot.samples
      .filter((sample) => sample.length <= 0)
      .map((sample) => sample.index);

    for (const file of files) {
      const slot = freeSlots.shift();
      if (typeof slot !== 'number') {
        break;
      }

      engine.dispatch({ type: 'sample/select', sample: slot });
      await engine.loadSample(new Uint8Array(await file.arrayBuffer()), file.name);
      snapshot = engine.getSnapshot();
    }

    onLoaded(snapshot);
  }

  input.value = '';
  input.multiple = false;
};
