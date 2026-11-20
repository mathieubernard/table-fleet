/** Bruit et hasard déterministes : le monde est identique à chaque visite. */

export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash3(x: number, y: number, z: number): number {
  return hash2(x + Math.imul(z, 7919), y, 17);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Bruit fractal dans [0, 1]. */
export function fbm(x: number, y: number, oct = 4, seed = 0): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, y * f, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / norm;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Distance d'un point à une polyligne, et position (0..1) le long de celle-ci. */
export function polyDist(px: number, pz: number, pts: readonly (readonly [number, number])[]): { d: number; t: number } {
  let best = Infinity;
  let bestT = 0;
  let acc = 0;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2);
    const s = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / len2, 0, 1);
    const d = Math.hypot(px - (a[0] + dx * s), pz - (a[1] + dz * s));
    if (d < best) {
      best = d;
      bestT = (acc + s * len) / total;
    }
    acc += len;
  }
  return { d: best, t: bestT };
}

/** Rectangle arrondi signé (négatif à l'intérieur). */
export function sdRoundRect(px: number, pz: number, cx: number, cz: number, hx: number, hz: number, r: number): number {
  const qx = Math.abs(px - cx) - hx + r;
  const qz = Math.abs(pz - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
