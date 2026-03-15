import './style.css';

import createPt2Module from './wasm/pt2clone.js';

type Pt2Module = {
  FS: {
    analyzePath(path: string): { exists: boolean };
    chdir(path: string): void;
    mkdir(path: string): void;
    mount(type: unknown, options: Record<string, unknown>, mountpoint: string): void;
    readFile(path: string): Uint8Array;
    syncfs(populate: boolean, callback: (error?: unknown) => void): void;
    writeFile(path: string, data: Uint8Array): void;
  };
  IDBFS?: unknown;
  callMain(args?: string[]): void;
  ccall: <T>(ident: string, returnType: string | null, argTypes: string[], args: unknown[]) => T;
};

type Pt2ModuleFactory = (options: Record<string, unknown>) => Promise<Pt2Module>;

const statusNode = document.querySelector<HTMLParagraphElement>('#status');
const loadButton = document.querySelector<HTMLButtonElement>('#load-module');
const syncButton = document.querySelector<HTMLButtonElement>('#sync-storage');
const exportLink = document.querySelector<HTMLAnchorElement>('#last-export');
const fileInput = document.querySelector<HTMLInputElement>('#file-input');
const canvas = document.querySelector<HTMLCanvasElement>('#pt2-canvas');

if (!statusNode || !loadButton || !syncButton || !exportLink || !fileInput || !canvas) {
  throw new Error('Application shell is incomplete.');
}

const moduleFactory = createPt2Module as unknown as Pt2ModuleFactory;
let pt2Module: Pt2Module | null = null;
let lastExportUrl: string | null = null;

const setStatus = (text: string): void => {
  statusNode.textContent = text;
};

const ensureDir = (module: Pt2Module, path: string): void => {
  if (!module.FS.analyzePath(path).exists) {
    module.FS.mkdir(path);
  }
};

const syncWorkspace = async (module: Pt2Module, populate: boolean): Promise<void> =>
  new Promise((resolve, reject) => {
    module.FS.syncfs(populate, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const handleExportEvent = (event: Event): void => {
  const customEvent = event as CustomEvent<{
    bytes: Uint8Array;
    filename: string;
    mimeType: string;
  }>;

  const blob = new Blob([Uint8Array.from(customEvent.detail.bytes)], { type: customEvent.detail.mimeType });
  const url = URL.createObjectURL(blob);

  if (lastExportUrl) {
    URL.revokeObjectURL(lastExportUrl);
  }

  lastExportUrl = url;
  exportLink.href = url;
  exportLink.download = customEvent.detail.filename;
  exportLink.hidden = false;
  exportLink.textContent = `Hämta ${customEvent.detail.filename}`;
  setStatus(`Exporterade ${customEvent.detail.filename}`);
};

window.addEventListener('pt2web:file-exported', handleExportEvent as EventListener);

const importFileIntoWorkspace = async (file: File): Promise<void> => {
  if (!pt2Module) {
    return;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `/workspace/imports/${file.name}`;

  pt2Module.FS.writeFile(path, bytes);
  await syncWorkspace(pt2Module, false);

  pt2Module.ccall<number>('pt2_web_load_file_from_path', 'number', ['string', 'number'], [path, 1]);
  setStatus(`Laddade ${file.name}`);
};

const boot = async (): Promise<void> => {
  setStatus('Laddar PT2 WebAssembly…');

  pt2Module = await moduleFactory({
    canvas,
    locateFile: (path: string) => new URL(`./wasm/${path}`, import.meta.url).href,
    printErr: (message: string) => {
      console.error(message);
    },
  });

  ensureDir(pt2Module, '/workspace');

  if (pt2Module.IDBFS) {
    pt2Module.FS.mount(pt2Module.IDBFS, {}, '/workspace');
    await syncWorkspace(pt2Module, true);
  }

  ensureDir(pt2Module, '/workspace/imports');
  ensureDir(pt2Module, '/workspace/exports');
  pt2Module.FS.chdir('/');

  pt2Module.callMain([]);
  setStatus('PT2 körs. Ladda en modul eller ett sample.');
};

loadButton.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  const [file] = Array.from(fileInput.files ?? []);
  if (!file) {
    return;
  }

  await importFileIntoWorkspace(file);
  fileInput.value = '';
});

syncButton.addEventListener('click', async () => {
  if (!pt2Module) {
    return;
  }

  await syncWorkspace(pt2Module, false);
  setStatus('Workspace synkat till browserlagring.');
});

void boot().catch((error: unknown) => {
  console.error(error);
  setStatus('Start misslyckades. Se konsolen för detaljer.');
});
