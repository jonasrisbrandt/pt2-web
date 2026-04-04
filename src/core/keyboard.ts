import type { CursorField, TrackerCommand, TrackerSnapshot, TransportCommand } from './trackerTypes';

export interface KeyboardOutcome {
  command?: TrackerCommand;
  transport?: TransportCommand;
  octave?: number;
}

const cursorFields: CursorField[] = [
  'note',
  'sampleHigh',
  'sampleLow',
  'effect',
  'paramHigh',
  'paramLow',
];

const noteLayout = new Map<string, number>([
  ['z', 0], ['s', 1], ['x', 2], ['d', 3], ['c', 4], ['v', 5],
  ['g', 6], ['b', 7], ['h', 8], ['n', 9], ['j', 10], ['m', 11],
  ['q', 12], ['2', 13], ['w', 14], ['3', 15], ['e', 16], ['r', 17],
  ['5', 18], ['t', 19], ['6', 20], ['y', 21], ['7', 22], ['u', 23],
]);

const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const moveCursorHorizontally = (snapshot: TrackerSnapshot, delta: -1 | 1): TrackerCommand => {
  const currentFieldIndex = cursorFields.indexOf(snapshot.cursor.field);
  let nextFieldIndex = currentFieldIndex + delta;
  let nextChannel = snapshot.cursor.channel;
  const maxChannel = Math.max(0, (snapshot.pattern.rows[0]?.channels.length ?? 4) - 1);

  if (nextFieldIndex < 0) {
    if (nextChannel === 0) {
      nextFieldIndex = 0;
    } else {
      nextFieldIndex = cursorFields.length - 1;
      nextChannel -= 1;
    }
  } else if (nextFieldIndex >= cursorFields.length) {
    if (nextChannel === maxChannel) {
      nextFieldIndex = cursorFields.length - 1;
    } else {
      nextFieldIndex = 0;
      nextChannel += 1;
    }
  }

  return {
    type: 'cursor/set',
    row: snapshot.cursor.row,
    channel: nextChannel,
    field: cursorFields[nextFieldIndex],
  };
};

const noteFromKey = (key: string, octave: number): string | null => {
  const semitone = noteLayout.get(key.toLowerCase());
  if (semitone === undefined) {
    return null;
  }

  const absolute = octave * 12 + semitone;
  return `${noteNames[absolute % 12]}${Math.floor(absolute / 12)}`;
};

export const getKeyboardNoteFromKey = (key: string, octave: number): string | null =>
  noteFromKey(key, octave);

export const interpretKeyboard = (
  event: KeyboardEvent,
  snapshot: TrackerSnapshot,
  octave: number,
): KeyboardOutcome | null => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  const note = noteFromKey(event.key, octave);
  if (note && snapshot.editor.editMode && snapshot.cursor.field === 'note') {
    return {
      command: {
        type: 'pattern/set-cell',
        row: snapshot.cursor.row,
        channel: snapshot.cursor.channel,
        patch: {
          note,
          sample: snapshot.selectedSample,
        },
      },
    };
  }

  switch (event.key) {
    case ' ':
      return { transport: { type: 'transport/toggle' } };
    case 'ArrowUp':
      return {
        command: {
          type: 'cursor/set',
          row: clamp(snapshot.cursor.row - 1, 0, 63),
          channel: snapshot.cursor.channel,
          field: snapshot.cursor.field,
        },
      };
    case 'ArrowDown':
      return {
        command: {
          type: 'cursor/set',
          row: clamp(snapshot.cursor.row + 1, 0, 63),
          channel: snapshot.cursor.channel,
          field: snapshot.cursor.field,
        },
      };
    case 'ArrowLeft':
      return { command: moveCursorHorizontally(snapshot, -1) };
    case 'ArrowRight':
      return { command: moveCursorHorizontally(snapshot, 1) };
    case 'PageUp':
      return {
        command: {
          type: 'cursor/set',
          row: clamp(snapshot.cursor.row - 16, 0, 63),
          channel: snapshot.cursor.channel,
          field: snapshot.cursor.field,
        },
      };
    case 'PageDown':
      return {
        command: {
          type: 'cursor/set',
          row: clamp(snapshot.cursor.row + 16, 0, 63),
          channel: snapshot.cursor.channel,
          field: snapshot.cursor.field,
        },
      };
    case 'Home':
      return {
        command: {
          type: 'cursor/set',
          row: 0,
          channel: snapshot.cursor.channel,
          field: snapshot.cursor.field,
        },
      };
    case 'End':
      return {
        command: {
          type: 'cursor/set',
          row: 63,
          channel: snapshot.cursor.channel,
          field: snapshot.cursor.field,
        },
      };
    case 'Tab':
      return {
        command: moveCursorHorizontally(snapshot, event.shiftKey ? -1 : 1),
      };
    case 'Delete':
    case 'Backspace':
      if (!snapshot.editor.editMode) {
        return null;
      }

      return {
        command: {
          type: 'pattern/clear-cell',
          row: snapshot.cursor.row,
          channel: snapshot.cursor.channel,
        },
      };
    case '[':
      return { octave: clamp(octave - 1, 1, 2) };
    case ']':
      return { octave: clamp(octave + 1, 1, 2) };
    default:
      return null;
  }
};
