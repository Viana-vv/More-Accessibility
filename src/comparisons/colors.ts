export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export interface ContrastSuggestion {
  foreground: string;
  background: string;
  ratio: number;
  changed: 'foreground' | 'background';
}

const HEX_COLOR = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_COLOR = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;

export function parseColor(value: string): RgbColor | undefined {
  const normalized = value.trim();
  const hex = HEX_COLOR.exec(normalized);
  if (hex?.[1]) {
    const raw = hex[1];
    const expanded = raw.length <= 4 ? [...raw].map((part) => part + part).join('') : raw;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const rgb = RGB_COLOR.exec(normalized);
  if (rgb) {
    return { red: Number(rgb[1]), green: Number(rgb[2]), blue: Number(rgb[3]) };
  }
  return undefined;
}

export function relativeLuminance(color: RgbColor): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
}

export function contrastRatio(first: RgbColor | string, second: RgbColor | string): number | undefined {
  const foreground = typeof first === 'string' ? parseColor(first) : first;
  const background = typeof second === 'string' ? parseColor(second) : second;
  if (!foreground || !background) return undefined;
  const firstLuminance = relativeLuminance(foreground);
  const secondLuminance = relativeLuminance(background);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function toHex(color: RgbColor): string {
  return `#${[color.red, color.green, color.blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function mix(first: RgbColor, second: RgbColor, amount: number): RgbColor {
  return {
    red: Math.round(first.red + (second.red - first.red) * amount),
    green: Math.round(first.green + (second.green - first.green) * amount),
    blue: Math.round(first.blue + (second.blue - first.blue) * amount),
  };
}

export function suggestContrastColors(
  foregroundValue: string,
  backgroundValue: string,
  targetRatio = 4.5,
): ContrastSuggestion | undefined {
  const foreground = parseColor(foregroundValue);
  const background = parseColor(backgroundValue);
  if (!foreground || !background || !Number.isFinite(targetRatio) || targetRatio < 1) return undefined;

  const currentRatio = contrastRatio(foreground, background);
  if (currentRatio === undefined) return undefined;
  if (currentRatio >= targetRatio) {
    return { foreground: toHex(foreground), background: toHex(background), ratio: currentRatio, changed: 'foreground' };
  }

  const candidates: ContrastSuggestion[] = [];
  for (let step = 1; step <= 100; step += 1) {
    const amount = step / 100;
    for (const replacement of [mix(foreground, { red: 0, green: 0, blue: 0 }, amount), mix(foreground, { red: 255, green: 255, blue: 255 }, amount)]) {
      const ratio = contrastRatio(replacement, background);
      if (ratio !== undefined && ratio >= targetRatio) candidates.push({ foreground: toHex(replacement), background: toHex(background), ratio, changed: 'foreground' });
    }
    for (const replacement of [mix(background, { red: 0, green: 0, blue: 0 }, amount), mix(background, { red: 255, green: 255, blue: 255 }, amount)]) {
      const ratio = contrastRatio(foreground, replacement);
      if (ratio !== undefined && ratio >= targetRatio) candidates.push({ foreground: toHex(foreground), background: toHex(replacement), ratio, changed: 'background' });
    }
  }
  return candidates.sort((left, right) => Math.abs(left.ratio - targetRatio) - Math.abs(right.ratio - targetRatio))[0];
}
