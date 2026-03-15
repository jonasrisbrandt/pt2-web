import type { ClassicKeyTranslation } from '../../core/classicKeyboard';
import { translateClassicKeyboardEvent } from '../../core/classicKeyboard';
import type { TrackerEngine } from '../../core/trackerEngine';
import type { TrackerSnapshot } from '../../core/trackerTypes';
import { clamp } from '../../ui/appShared';

export interface ClassicDomDebugState {
  x: number;
  y: number;
  buttons: number;
  inside: boolean;
  events: number;
}

export const updateClassicDomDebugPointer = (
  debugState: ClassicDomDebugState,
  canvas: HTMLCanvasElement,
  event: MouseEvent,
): void => {
  const rect = canvas.getBoundingClientRect();
  debugState.x = Math.round(event.clientX - rect.left);
  debugState.y = Math.round(event.clientY - rect.top);
  debugState.buttons = event.buttons;
  debugState.events += 1;
};

export const getClassicLogicalPointerPosition = (
  canvas: HTMLCanvasElement,
  debugState: ClassicDomDebugState,
): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : canvas.width;
  const height = rect.height > 0 ? rect.height : canvas.height;
  const x = clamp(Math.floor((debugState.x / width) * canvas.width), 0, canvas.width - 1);
  const y = clamp(Math.floor((debugState.y / height) * canvas.height), 0, canvas.height - 1);

  return { x, y };
};

export const handleClassicKeyDown = (
  event: KeyboardEvent,
  engine: TrackerEngine,
  pressedKeys: Map<string, ClassicKeyTranslation>,
): void => {
  const translation = translateClassicKeyboardEvent(event);
  if (!translation) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event.repeat || pressedKeys.has(event.code)) {
    return;
  }

  pressedKeys.set(event.code, translation);
  engine.forwardClassicKeyDown(
    translation.scancode,
    translation.keycode,
    translation.shift,
    translation.ctrl,
    translation.alt,
    translation.meta,
  );

  if (translation.text) {
    engine.forwardClassicTextInput(translation.text);
  }
};

export const releaseClassicKeys = (
  engine: TrackerEngine | null,
  pressedKeys: Map<string, ClassicKeyTranslation>,
): void => {
  if (!engine || pressedKeys.size === 0) {
    pressedKeys.clear();
    return;
  }

  for (const translation of pressedKeys.values()) {
    engine.forwardClassicKeyUp(
      translation.scancode,
      translation.keycode,
      false,
      false,
      false,
      false,
    );
  }

  pressedKeys.clear();
};

export const updateClassicDebugPanel = (
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  debugState: ClassicDomDebugState,
  snapshot: TrackerSnapshot | null,
): void => {
  const debugRoot = root.querySelector<HTMLElement>('.classic-debug');
  if (!debugRoot) {
    return;
  }

  const setDebugField = (field: string, value: string): void => {
    const element = root.querySelector<HTMLElement>(`[data-debug-field="${field}"]`);
    if (element) {
      element.textContent = value;
    }
  };

  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.round(rect.width);
  const cssHeight = Math.round(rect.height);
  const debug = snapshot?.debug;

  setDebugField('dom-mouse', `${debugState.x}, ${debugState.y}`);
  setDebugField(
    'dom-state',
    `${debugState.inside ? 'inside' : 'outside'} btn:${debugState.buttons} ev:${debugState.events}`,
  );
  setDebugField('mouse-abs', debug ? `${debug.mouse.absX}, ${debug.mouse.absY}` : 'n/a');
  setDebugField('mouse-raw', debug ? `${debug.mouse.rawX}, ${debug.mouse.rawY}` : 'n/a');
  setDebugField('mouse-pt2', debug ? `${debug.mouse.x}, ${debug.mouse.y}` : 'n/a');
  setDebugField(
    'mouse-buttons',
    debug ? `${debug.mouse.buttons} L:${debug.mouse.left ? '1' : '0'} R:${debug.mouse.right ? '1' : '0'}` : 'n/a',
  );
  setDebugField('canvas-css', `${cssWidth} x ${cssHeight}`);
  setDebugField('video-render', debug ? `${debug.video.renderW} x ${debug.video.renderH}` : 'n/a');
  setDebugField(
    'video-scale',
    debug ? `${debug.video.scaleX.toFixed(4)} / ${debug.video.scaleY.toFixed(4)}` : 'n/a',
  );
};
