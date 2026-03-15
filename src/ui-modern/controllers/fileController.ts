import type { TrackerEngine } from '../../core/trackerEngine';
import type { TrackerSnapshot } from '../../core/trackerTypes';
import { triggerDownload } from '../../ui/appShared';

export const saveModuleFile = async (engine: TrackerEngine): Promise<void> => {
  const file = await engine.saveModule();
  triggerDownload(file.filename, file.mimeType, file.bytes);
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
  const [file] = Array.from(input.files ?? []);

  if (file) {
    if (pendingSampleImportSlot !== null) {
      engine.dispatch({ type: 'sample/select', sample: pendingSampleImportSlot });
    }

    await engine.loadSample(new Uint8Array(await file.arrayBuffer()), file.name);
    onLoaded(engine.getSnapshot());
  }

  input.value = '';
};
