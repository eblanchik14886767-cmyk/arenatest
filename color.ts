import type { ColorMode, ColorPreset, GradientDirection } from '../types';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PaintArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Paint {
  fill: (t: number) => string | CanvasGradient;
  glow: (t: number) => string;
}

export function clamp255(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** Returns '#rrggbb' (lowercase) or null for invalid input. Accepts #rgb and #rrggbb. */
export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) {
    return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? '#000000';
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex(rgb: Rgb): string {
  const part = (v: number) => clamp255(v).toString(16).padStart(2, '0');
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

export function mixHex(a: string, b: string, t: number): string {
  return rgbToHex(mixRgb(hexToRgb(a), hexToRgb(b), t));
}

export function rgbToCss(rgb: Rgb, alpha = 1): string {
  return `rgba(${clamp255(rgb.r)}, ${clamp255(rgb.g)}, ${clamp255(rgb.b)}, ${alpha})`;
}

export function hexToCss(hex: string, alpha = 1): string {
  return rgbToCss(hexToRgb(hex), alpha);
}

/** h in degrees, s and l in 0..1. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function rgbToHsl(rgb: Rgb): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb(h, s, l));
}

export function hslCss(h: number, s: number, l: number, alpha = 1): string {
  return rgbToCss(hslToRgb(h, s, l), alpha);
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'cyberpunk', name: 'Киберпанк', primary: '#a855f7', secondary: '#22d3ee' },
  { id: 'sunset', name: 'Закат', primary: '#fb923c', secondary: '#ec4899' },
  { id: 'matrix', name: 'Матрица', primary: '#22c55e', secondary: '#86efac' },
  { id: 'mono', name: 'Монохром', primary: '#ffffff', secondary: '#000000' },
  { id: 'ocean', name: 'Океан', primary: '#3b82f6', secondary: '#14b8a6' },
  { id: 'neon-night', name: 'Неоновая ночь', primary: '#ec4899', secondary: '#8b5cf6' },
];

/** Random harmonious pair: analogous, triadic-ish or complementary offsets. */
export function randomPresetColors(): { primary: string; secondary: string } {
  const hue = Math.random() * 360;
  const offsets = [30, 60, 120, 150, 180];
  const offset = offsets[Math.floor(Math.random() * offsets.length)] * (Math.random() > 0.5 ? 1 : -1);
  return {
    primary: hslToHex(hue, 0.85, 0.58),
    secondary: hslToHex(hue + offset, 0.85, 0.58),
  };
}

/** Smooth per-frequency color: bass = primary, mids = mix, highs = secondary. */
export function frequencyColor(primary: string, secondary: string, t: number): string {
  const u = Math.min(1, Math.max(0, (t - 0.08) / 0.84));
  const eased = u * u * (3 - 2 * u);
  return mixHex(primary, secondary, eased);
}

/** Color of the "RGB flow" mode at position t (0..1) and time in seconds. */
export function flowColor(t: number, timeSec: number): string {
  return hslToHex(timeSec * 45 + t * 140, 1, 0.6);
}

/** Builds fill and glow providers for a given color mode inside a drawing area. */
export function createPaint(
  ctx: CanvasRenderingContext2D,
  mode: ColorMode,
  primary: string,
  secondary: string,
  direction: GradientDirection,
  area: PaintArea,
  timeSec: number,
  symmetricVertical = false,
): Paint {
  const horizontal = direction === 'horizontal';
  const makeGradient = (stops: Array<[number, string]>): CanvasGradient => {
    const gradient = horizontal
      ? ctx.createLinearGradient(area.left, 0, area.right, 0)
      : symmetricVertical
        ? ctx.createLinearGradient(0, area.top, 0, area.bottom)
        : ctx.createLinearGradient(0, area.bottom, 0, area.top);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    return gradient;
  };

  switch (mode) {
    case 'solid':
      return { fill: () => primary, glow: () => primary };
    case 'gradient': {
      const gradient = horizontal || !symmetricVertical
        ? makeGradient([[0, primary], [1, secondary]])
        : makeGradient([[0, secondary], [0.5, primary], [1, secondary]]);
      return { fill: () => gradient, glow: (t) => mixHex(primary, secondary, t) };
    }
    case 'rgbflow': {
      const stops: Array<[number, string]> = [];
      for (let i = 0; i <= 6; i += 1) stops.push([i / 6, flowColor(i / 6, timeSec)]);
      const gradient = makeGradient(stops);
      return { fill: () => gradient, glow: (t) => flowColor(t, timeSec) };
    }
    case 'frequency':
    default:
      return {
        fill: (t) => frequencyColor(primary, secondary, t),
        glow: (t) => frequencyColor(primary, secondary, t),
      };
  }
}
