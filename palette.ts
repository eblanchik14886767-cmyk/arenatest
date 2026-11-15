import { hslToHex, rgbToHsl } from './color';

interface Bucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Makes a color vivid enough for a neon visualizer. */
function vivid(r: number, g: number, b: number): string {
  const hsl = rgbToHsl({ r, g, b });
  return hslToHex(hsl.h, Math.max(0.55, Math.min(1, hsl.s * 1.15)), Math.min(0.68, Math.max(0.5, hsl.l)));
}

/**
 * Draws the cover to an offscreen canvas, samples pixels and returns two
 * dominant distinct colors, or null if the image can't be read.
 */
export async function extractPalette(imageUrl: string): Promise<[string, string] | null> {
  const img = await loadImage(imageUrl);
  if (!img) return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  let pixels: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, size, size);
    pixels = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }

  const buckets = new Map<number, Bucket>();
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 40 || min > 225) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }
  if (buckets.size === 0) return null;

  const scored = Array.from(buckets.values())
    .map((bucket) => {
      const r = bucket.r / bucket.count;
      const g = bucket.g / bucket.count;
      const b = bucket.b / bucket.count;
      const hsl = rgbToHsl({ r, g, b });
      return { r, g, b, hsl, score: bucket.count * (0.25 + hsl.s) };
    })
    .sort((x, y) => y.score - x.score);

  const first = scored[0];
  const second = scored.find((candidate) => {
    const hueFar = hueDistance(candidate.hsl.h, first.hsl.h) > 35 && candidate.hsl.s > 0.2;
    const lightnessFar = Math.abs(candidate.hsl.l - first.hsl.l) > 0.25;
    return hueFar || lightnessFar;
  });

  const primary = vivid(first.r, first.g, first.b);
  if (second) return [primary, vivid(second.r, second.g, second.b)];
  const shifted = rgbToHsl({ r: first.r, g: first.g, b: first.b });
  return [primary, hslToHex(shifted.h + 40, 0.85, 0.6)];
}
