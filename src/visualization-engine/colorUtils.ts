export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, value));
const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

export const parseCssColor = (value: string): RgbaColor => {
  const trimmed = value.trim();

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 6) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
  }

  const rgbaMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return {
        r: clampByte(Number(parts[0])),
        g: clampByte(Number(parts[1])),
        b: clampByte(Number(parts[2])),
        a: parts.length >= 4 ? clampUnit(Number(parts[3])) : 1,
      };
    }
  }

  return {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  };
};

export const rgbaToFloatArray = (color: RgbaColor): [number, number, number, number] => [
  color.r / 255,
  color.g / 255,
  color.b / 255,
  color.a,
];
