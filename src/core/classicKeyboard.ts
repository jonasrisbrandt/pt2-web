const SDL_SCANCODE_MASK = 1 << 30;

export type ClassicKeyTranslation = {
  scancode: number;
  keycode: number;
  text: string | null;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
};

const SDL_SCANCODES: Record<string, number> = {
  KeyA: 4,
  KeyB: 5,
  KeyC: 6,
  KeyD: 7,
  KeyE: 8,
  KeyF: 9,
  KeyG: 10,
  KeyH: 11,
  KeyI: 12,
  KeyJ: 13,
  KeyK: 14,
  KeyL: 15,
  KeyM: 16,
  KeyN: 17,
  KeyO: 18,
  KeyP: 19,
  KeyQ: 20,
  KeyR: 21,
  KeyS: 22,
  KeyT: 23,
  KeyU: 24,
  KeyV: 25,
  KeyW: 26,
  KeyX: 27,
  KeyY: 28,
  KeyZ: 29,
  Digit1: 30,
  Digit2: 31,
  Digit3: 32,
  Digit4: 33,
  Digit5: 34,
  Digit6: 35,
  Digit7: 36,
  Digit8: 37,
  Digit9: 38,
  Digit0: 39,
  Minus: 45,
  Equal: 46,
  BracketLeft: 47,
  BracketRight: 48,
  Backslash: 49,
  Semicolon: 51,
  Quote: 52,
  Backquote: 53,
  Comma: 54,
  Period: 55,
  Slash: 56,
  IntlBackslash: 100,
  ControlLeft: 224,
  ShiftLeft: 225,
  AltLeft: 226,
  MetaLeft: 227,
  ControlRight: 228,
  ShiftRight: 229,
  AltRight: 230,
  MetaRight: 231,
};

const getSpecialKeycode = (code: string, scancode: number): number => {
  switch (code) {
    case 'Minus':
      return '-'.charCodeAt(0);
    case 'Equal':
      return '='.charCodeAt(0);
    case 'BracketLeft':
      return '['.charCodeAt(0);
    case 'BracketRight':
      return ']'.charCodeAt(0);
    case 'Backslash':
      return '\\'.charCodeAt(0);
    case 'Semicolon':
      return ';'.charCodeAt(0);
    case 'Quote':
      return '\''.charCodeAt(0);
    case 'Backquote':
      return '`'.charCodeAt(0);
    case 'Comma':
      return ','.charCodeAt(0);
    case 'Period':
      return '.'.charCodeAt(0);
    case 'Slash':
      return '/'.charCodeAt(0);
    default:
      return SDL_SCANCODE_MASK | scancode;
  }
};

const getPrintableKeycode = (event: KeyboardEvent, scancode: number): number => {
  if (event.key.length === 1) {
    if (/^[A-Z]$/.test(event.key)) {
      return event.key.toLowerCase().charCodeAt(0);
    }

    return event.key.charCodeAt(0);
  }

  return getSpecialKeycode(event.code, scancode);
};

const getTextInput = (event: KeyboardEvent): string | null => {
  if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) {
    return null;
  }

  const codePoint = event.key.codePointAt(0);
  if (codePoint === undefined || codePoint < 32 || codePoint > 126) {
    return null;
  }

  return event.key;
};

export const translateClassicKeyboardEvent = (event: KeyboardEvent): ClassicKeyTranslation | null => {
  const scancode = SDL_SCANCODES[event.code];
  if (scancode === undefined) {
    return null;
  }

  return {
    scancode,
    keycode: getPrintableKeycode(event, scancode),
    text: getTextInput(event),
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
  };
};
