// One-shot generator for the demo submission placeholder image.
// Produces an 800x600 on-brand "field at dusk" tile (graphite sky, steel
// ground, amber hi-vis sun) as a real raster PNG so next/image renders it
// without a remotePatterns host (local /public path). Run once; output committed.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 800, H = 600;

// CRC32 (PNG)
const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const sky = [0x23, 0x26, 0x2d];     // graphite
const ground = [0x3a, 0x3f, 0x4a];  // steel
const amber = [0xf5, 0xa6, 0x23];   // hi-vis amber

// raw scanlines: 1 filter byte (0) + W*3 RGB per row
const raw = Buffer.alloc(H * (1 + W * 3));
let o = 0;
const horizon = Math.floor(H * 0.66);
const sunCx = 600, sunCy = 150, sunR = 70;
for (let y = 0; y < H; y++) {
  raw[o++] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    let c = y < horizon ? sky : ground;
    const dx = x - sunCx, dy = y - sunCy;
    if (dx * dx + dy * dy <= sunR * sunR) c = amber;
    raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
  }
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('public/demo', { recursive: true });
writeFileSync('public/demo/field-photo.png', png);
console.log(`wrote public/demo/field-photo.png (${png.length} bytes)`);
