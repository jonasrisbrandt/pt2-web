export interface TrackerAppDom {
  moduleInput: HTMLInputElement;
  sampleInput: HTMLInputElement;
  patternCanvas: HTMLCanvasElement;
  samplePreviewCanvas: HTMLCanvasElement;
  sampleEditorCanvas: HTMLCanvasElement;
  quadrascopeCanvas: HTMLCanvasElement;
  spectrumCanvas: HTMLCanvasElement;
  trailsCanvas: HTMLCanvasElement;
  pianoCanvas: HTMLCanvasElement;
}

const createHiddenFileInput = (accept: string): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  return input;
};

const createCanvas = (
  className: string,
  width: number,
  height: number,
  ariaLabel: string,
  tabIndex?: number,
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-label', ariaLabel);

  if (typeof tabIndex === 'number') {
    canvas.tabIndex = tabIndex;
  }

  return canvas;
};

export const createTrackerAppDom = (
  samplePreviewHeight: number,
  sampleEditorHeight: number,
  quadrascopeHeight: number,
  spectrumHeight: number,
  pianoHeight: number,
): TrackerAppDom => ({
  moduleInput: createHiddenFileInput('.mod,.m15,.stk,.nst,.ust,.pp,.nt'),
  sampleInput: createHiddenFileInput('.wav,.iff,.aiff,.aif,.raw'),
  patternCanvas: createCanvas('pattern-canvas', 960, 470, 'Modern pattern editor', 0),
  samplePreviewCanvas: createCanvas('sample-preview-canvas', 480, samplePreviewHeight, 'Selected sample preview'),
  sampleEditorCanvas: createCanvas('sample-editor-canvas', 960, sampleEditorHeight, 'Sample editor'),
  quadrascopeCanvas: createCanvas('quadrascope-canvas', 960, quadrascopeHeight, 'Quadrascope visualizer'),
  spectrumCanvas: createCanvas('spectrum-canvas', 960, spectrumHeight, 'Spectrum analyzer'),
  trailsCanvas: createCanvas('trails-canvas', 960, quadrascopeHeight, 'Signal trails visualizer'),
  pianoCanvas: createCanvas('piano-canvas', 960, pianoHeight, 'Tracker piano visualizer'),
});
