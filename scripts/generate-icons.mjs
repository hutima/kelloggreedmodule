// Generates PWA PNG icons without external image dependencies.
// Draws a simple Kellogg-Reed motif: a baseline with a vertical
// subject/predicate divider and a slanted modifier line.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');
mkdirSync(outDir, { recursive: true });

const BG = [31, 41, 51, 255]; // #1f2933
const INK = [233, 238, 243, 255]; // near-white

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // rows prefixed with filter byte 0
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = c[3];
  };
  // background
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, BG);

  const pad = maskable ? Math.round(size * 0.18) : Math.round(size * 0.12);
  const thick = Math.max(2, Math.round(size * 0.035));
  const baseY = Math.round(size * 0.56);
  const x0 = pad;
  const x1 = size - pad;

  // main baseline
  for (let t = 0; t < thick; t++)
    for (let x = x0; x <= x1; x++) set(x, baseY + t, INK);

  // subject/predicate divider (full height crossing baseline)
  const divX = Math.round(size * 0.46);
  const divTop = Math.round(size * 0.4);
  const divBot = Math.round(size * 0.72);
  for (let t = 0; t < thick; t++)
    for (let y = divTop; y <= divBot; y++) set(divX + t, y, INK);

  // slanted modifier line beneath the predicate
  const mx = Math.round(size * 0.66);
  const mlen = Math.round(size * 0.16);
  for (let i = 0; i < mlen; i++)
    for (let t = 0; t < thick; t++)
      set(mx + i, baseY + thick + i + t, INK);

  return encodePng(size, px);
}

writeFileSync(resolve(outDir, 'icon-192.png'), makeIcon(192, false));
writeFileSync(resolve(outDir, 'icon-512.png'), makeIcon(512, false));
writeFileSync(resolve(outDir, 'icon-512-maskable.png'), makeIcon(512, true));
console.log('Generated PWA icons in', outDir);
