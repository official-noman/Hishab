/**
 * Dependency-free PNG icon generator for Hishab.
 * Run: node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));
mkdirSync(OUT, { recursive: true });

/* ---------- tiny PNG encoder ---------- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- drawing helpers ---------- */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const hex = (s) => {
  const n = parseInt(s.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

const BG_TOP = hex('#152131');
const BG_BOTTOM = hex('#0A0E14');
const EMERALD = hex('#2BD9A2');
const EMERALD_LIGHT = hex('#4FE8BC');
const VIOLET = hex('#7C9CFF');
const CORAL = hex('#FF6B81');

function drawIcon(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const S = size;
  const u = 1 / S;
  const radius = maskable ? 0 : 0.235;
  const scale = maskable ? 0.78 : 1; // keep art inside mask safe zone
  const cx = 0.5;
  const cy = 0.5;

  // bar geometry in a 0..1 space, then scaled around center
  const P = (x, y) => [cx + (x - 0.5) * scale, cy + (y - 0.5) * scale];
  const bars = [
    { x0: 0.245, x1: 0.345, y0: 0.56, y1: 0.745, c: EMERALD },
    { x0: 0.44, x1: 0.54, y0: 0.43, y1: 0.745, c: EMERALD_LIGHT },
    { x0: 0.635, x1: 0.735, y0: 0.3, y1: 0.745, c: VIOLET },
  ].map((b) => {
    const [ax, ay] = P(b.x0, b.y0);
    const [bx, by] = P(b.x1, b.y1);
    return {
      cx: (ax + bx) / 2,
      cy: (ay + by) / 2,
      hw: (bx - ax) / 2,
      hh: (by - ay) / 2,
      r: 0.024 * scale,
      c: b.c,
      top: b.y0,
    };
  });

  const dot = (() => {
    const [dx, dy] = P(0.755, 0.265);
    return { cx: dx, cy: dy, r: 0.086 * scale, c: CORAL };
  })();

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = (x + 0.5) / S;
      const py = (y + 0.5) / S;
      let r = 0,
        g = 0,
        b = 0,
        a = 0;

      // background
      let bgA = 1;
      if (radius > 0) {
        const d = roundedRectSDF(px, py, 0.5, 0.5, 0.5, 0.5, radius);
        bgA = clamp(0.5 - d * S);
      }
      if (bgA > 0) {
        const grad = mix(BG_TOP, BG_BOTTOM, clamp(py * 1.15));
        // soft glow behind bars
        const glow = Math.max(0, 1 - Math.hypot((px - 0.5) * 1.25, (py - 0.55)) / 0.55);
        const col = mix(grad, hex('#12352C'), glow * 0.28);
        r = col[0];
        g = col[1];
        b = col[2];
        a = bgA;

        // inner hairline border
        if (radius > 0) {
          const d = Math.abs(roundedRectSDF(px, py, 0.5, 0.5, 0.5, 0.5, radius));
          const line = clamp(1.4 - d * S) * 0.55;
          if (line > 0) {
            const c = mix([r, g, b], hex('#5B738C'), line * 0.55);
            r = c[0];
            g = c[1];
            b = c[2];
          }
        }
      }

      // dot
      const dd = Math.hypot(px - dot.cx, py - dot.cy) - dot.r;
      const da = clamp((0.5 - dd * S) / 1.6);
      if (da > 0) {
        const c = mix([r, g, b], dot.c, da);
        r = c[0];
        g = c[1];
        b = c[2];
      }

      // bars (back to front)
      for (const bar of bars) {
        const d = roundedRectSDF(px, py, bar.cx, bar.cy, bar.hw, bar.hh, bar.r);
        const cov = clamp(0.5 - d * S);
        if (cov > 0) {
          const shade = mix(bar.c, [255, 255, 255], (1 - clamp((py - bar.top) / (0.745 - bar.top))) * 0.12);
          const c = mix([r, g, b], shade, cov);
          r = c[0];
          g = c[1];
          b = c[2];
        }
      }

      const i = (y * S + x) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return encodePNG(S, S, buf);
}

function save(name, size, opts) {
  const png = drawIcon(size, opts);
  writeFileSync(join(OUT, name), png);
  console.log(`icon  ${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

save('icon-192.png', 192);
save('icon-512.png', 512);
save('maskable-512.png', 512, { maskable: true });
save('apple-touch-icon.png', 180);
save('favicon-64.png', 64);
console.log('done -> icons/');
