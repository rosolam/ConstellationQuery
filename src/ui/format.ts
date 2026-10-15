const CURRENT_YEAR = new Date().getFullYear();

/** Astronomical year to a calendar label: 0 is 1 BCE, -1 is 2 BCE. */
export function formatYear(y: number): string {
  const n = y > 0 ? y : 1 - y;
  return `${n.toLocaleString('en-US')} ${y > 0 ? 'CE' : 'BCE'}`;
}

export function yearsAgo(y: number): string {
  const ago = CURRENT_YEAR - y;
  if (ago <= 0) return `in ${(-ago).toLocaleString('en-US')} years`;
  return `${ago.toLocaleString('en-US')} years ago`;
}

export function formatRange([a, b]: [number, number]): string {
  return a === b ? formatYear(a) : `${formatYear(a)} – ${formatYear(b)}`;
}

/** Angle in [0, 360) with one decimal, so 359.96 shows as 0.0. */
export function formatAngle(deg: number): string {
  const r = Math.round((((deg % 360) + 360) % 360) * 10) / 10;
  return `${(r >= 360 ? 0 : r).toFixed(1)}°`;
}

export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
}

export function formatRa(raDeg: number): string {
  const h = raDeg / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

export function formatDec(decDeg: number): string {
  return `${decDeg >= 0 ? '+' : '−'}${Math.abs(decDeg).toFixed(1)}°`;
}
