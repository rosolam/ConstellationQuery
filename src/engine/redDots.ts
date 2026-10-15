import type { Point } from './types';

export interface RedDotOptions {
  /** Red channel must exceed both green and blue by at least this much. */
  minRedness: number;
  minRed: number;
  /** Blobs smaller than this many pixels are ignored as noise. */
  minArea: number;
}

export const DEFAULT_RED_DOT_OPTIONS: RedDotOptions = { minRedness: 120, minRed: 150, minArea: 4 };

export interface RedDot extends Point {
  area: number;
}

/** Centroids (pixel coordinates, y down) of connected solid-red blobs in RGBA image data. */
export function extractRedDots(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: RedDotOptions = DEFAULT_RED_DOT_OPTIONS,
): RedDot[] {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a > 127 && r >= options.minRed && r - Math.max(g, b) >= options.minRedness) mask[i] = 1;
  }
  const dots: RedDot[] = [];
  const stack = new Int32Array(width * height);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1) continue;
    let top = 0;
    stack[top++] = start;
    mask[start] = 2;
    let area = 0;
    let sx = 0;
    let sy = 0;
    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      area++;
      sx += x;
      sy += y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (mask[q] === 1) {
            mask[q] = 2;
            stack[top++] = q;
          }
        }
      }
    }
    if (area >= options.minArea) dots.push({ x: sx / area + 0.5, y: sy / area + 0.5, area });
  }
  return dots;
}
