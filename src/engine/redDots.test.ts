import { describe, expect, it } from 'vitest';
import { pixelsToPoints } from './points';
import { extractRedDots } from './redDots';

function image(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const paint = (cx: number, cy: number, r: number, rgb: [number, number, number]) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) {
          data.set([...rgb, 255], (y * width + x) * 4);
        }
      }
    }
  };
  return { data, paint };
}

describe('red dot extraction', () => {
  it('finds red dot centroids and ignores other colors and specks', () => {
    const { data, paint } = image(200, 100);
    paint(20, 20, 6, [230, 20, 20]);
    paint(180, 80, 6, [200, 0, 10]);
    paint(100, 50, 8, [20, 20, 230]); // blue, ignored
    paint(60, 70, 8, [240, 160, 160]); // pink, ignored
    paint(140, 20, 8, [20, 20, 20]); // black, ignored
    data.set([255, 0, 0, 255], (90 * 200 + 5) * 4); // single-pixel speck, ignored
    const dots = extractRedDots(data, 200, 100);
    expect(dots).toHaveLength(2);
    expect(dots[0].x).toBeCloseTo(20, 0);
    expect(dots[0].y).toBeCloseTo(20, 0);
    expect(dots[1].x).toBeCloseTo(180, 0);
    expect(dots[1].y).toBeCloseTo(80, 0);
  });

  it('keeps image orientation: top of the image becomes larger y', () => {
    const pts = pixelsToPoints([
      { x: 20, y: 20 },
      { x: 180, y: 80 },
    ]);
    expect(pts[0]).toEqual({ x: 0, y: 0.375 });
    expect(pts[1]).toEqual({ x: 1, y: 0 });
  });
});
