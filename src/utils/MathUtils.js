export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const deg = (rad) => rad * 180 / Math.PI;
export const rad = (d) => d * Math.PI / 180;
export const normalizeAngle = (d) => ((d % 360) + 360) % 360;

// Deterministic integer hash -> [0,1]
export function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Seeded PRNG (mulberry32)
export function makeRandom(seed = 1337) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise
export function valueNoise(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi + seed, zi + seed * 3);
  const b = hash2(xi + 1 + seed, zi + seed * 3);
  const c = hash2(xi + seed, zi + 1 + seed * 3);
  const d = hash2(xi + 1 + seed, zi + 1 + seed * 3);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x, z, octaves = 5, seed = 0, lacunarity = 2.02, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// Ridged multifractal noise, good for mountain crests
export function ridged(x, z, octaves = 5, seed = 0) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise(x * freq, z * freq, seed + i * 31);
    const r = 1 - Math.abs(n * 2 - 1);
    sum += r * r * amp;
    norm += amp;
    amp *= 0.53;
    freq *= 2.07;
  }
  return sum / norm;
}

export function gaussian(x, z, cx, cz, radius) {
  const dx = x - cx;
  const dz = z - cz;
  return Math.exp(-((dx * dx + dz * dz) / (radius * radius)) * 2.1);
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatScore(n) {
  return Math.max(0, Math.round(n)).toLocaleString('en-US');
}
