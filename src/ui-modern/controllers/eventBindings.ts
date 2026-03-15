import type { EngineConfig } from '../../core/trackerTypes';
import type { TrackerAppDom } from '../session/appDom';

export interface TrackerApplicationEventBindings {
  root: HTMLElement;
  config: EngineConfig;
  dom: TrackerAppDom;
  onPatternCanvasPointer: (event: MouseEvent) => void;
  onSampleEditorPointerDown: (event: MouseEvent) => void;
  onSampleEditorWheel: (event: WheelEvent) => void;
  onPianoPointer: (event: MouseEvent) => void;
  onRootClick: (event: Event) => Promise<void>;
  onRootChange: (event: Event) => Promise<void>;
  onRootInput: (event: Event) => void;
  onWindowKeyDown: (event: KeyboardEvent) => void;
  onWindowKeyUp: (event: KeyboardEvent) => void;
  onWindowBlur: () => void;
  onClassicCanvasPointerMove: (event: MouseEvent) => void;
  onClassicCanvasPointerButtonDown: (event: MouseEvent) => void;
  onClassicCanvasPointerButtonUp: (event: MouseEvent) => void;
  onClassicCanvasPointerEnter: (event: MouseEvent) => void;
  onClassicCanvasPointerLeave: () => void;
  onWindowResize: () => void;
  onWindowMouseMove: (event: MouseEvent) => void;
  onWindowMouseUp: () => void;
}

export const bindTrackerApplicationEvents = ({
  root,
  config,
  dom,
  onPatternCanvasPointer,
  onSampleEditorPointerDown,
  onSampleEditorWheel,
  onPianoPointer,
  onRootClick,
  onRootChange,
  onRootInput,
  onWindowKeyDown,
  onWindowKeyUp,
  onWindowBlur,
  onClassicCanvasPointerMove,
  onClassicCanvasPointerButtonDown,
  onClassicCanvasPointerButtonUp,
  onClassicCanvasPointerEnter,
  onClassicCanvasPointerLeave,
  onWindowResize,
  onWindowMouseMove,
  onWindowMouseUp,
}: TrackerApplicationEventBindings): void => {
  dom.patternCanvas.addEventListener('mousedown', onPatternCanvasPointer);
  dom.sampleEditorCanvas.addEventListener('mousedown', onSampleEditorPointerDown);
  dom.sampleEditorCanvas.addEventListener('wheel', onSampleEditorWheel, { passive: false });
  dom.pianoCanvas.addEventListener('mousedown', onPianoPointer);

  root.addEventListener('click', (event) => void onRootClick(event));
  root.addEventListener('change', (event) => void onRootChange(event));
  root.addEventListener('input', onRootInput);

  window.addEventListener('keydown', onWindowKeyDown);
  window.addEventListener('keyup', onWindowKeyUp);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);

  config.canvas.addEventListener('mousemove', onClassicCanvasPointerMove);
  config.canvas.addEventListener('mousedown', onClassicCanvasPointerButtonDown);
  config.canvas.addEventListener('mouseup', onClassicCanvasPointerButtonUp);
  config.canvas.addEventListener('mouseenter', onClassicCanvasPointerEnter);
  config.canvas.addEventListener('mouseleave', onClassicCanvasPointerLeave);
};
