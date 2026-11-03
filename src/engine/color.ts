export interface Rgb { r: number; g: number; b: number; alpha?: number; }

export function parseColor(value: string | undefined): Rgb | undefined {
  if (!value) return undefined;
  const input = value.trim().toLowerCase();
  const hex = input.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const digits = hex[1] ?? '';
    const digit = (index: number) => digits.charAt(index);
    if (digits.length === 3 || digits.length === 4) {
      return { r: parseInt(digit(0) + digit(0), 16), g: parseInt(digit(1) + digit(1), 16), b: parseInt(digit(2) + digit(2), 16), alpha: digits.length === 4 ? parseInt(digit(3) + digit(3), 16) / 255 : 1 };
    }
    if (digits.length === 6 || digits.length === 8) {
      return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16), alpha: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1 };
    }
  }
  const rgb = input.match(/^rgba?\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgb) return { r: clamp(Number(rgb[1]), 0, 255), g: clamp(Number(rgb[2]), 0, 255), b: clamp(Number(rgb[3]), 0, 255), alpha: rgb[4] === undefined ? 1 : clamp(Number(rgb[4]), 0, 1) };
  const named: Record<string, Rgb> = { black: { r: 0, g: 0, b: 0, alpha: 1 }, white: { r: 255, g: 255, b: 255, alpha: 1 } };
  return named[input];
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

export function relativeLuminance(color: Rgb): number {
  const channel = (value: number) => { const s = value / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}
