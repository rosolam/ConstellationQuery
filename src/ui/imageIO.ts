import type { Point } from '../engine/types';

export async function loadImageData(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Red dots on white for normalized points (y up), as a PNG data URL. */
export function renderPatternPng(points: Point[], size = 800, dotRadius = 10): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ff0000';
  const pad = dotRadius * 4;
  const inner = size - 2 * pad;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(pad + p.x * inner, size - pad - p.y * inner, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL('image/png');
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadText(text: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
