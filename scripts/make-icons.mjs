// Icônes de l'écran d'accueil (`npm run icons`) : un navire en voxels sur la mer de la mallette,
// touché par une fiche rouge. Grille de 32×32 agrandie au pixel près, opaque partout (iOS met du
// noir derrière la transparence).
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const SEA = [0x37718a, 0x3f7f96, 0x47899f];
const LINE = 0x8cc2c8;
const P = { h: 0x8d979c, H: 0x5d666b, d: 0xb8a886, s: 0xd6b25a, k: 0x3a4044, w: 0xf4eee0, r: 0xd8332b, R: 0x9a241f, o: 0xffa03c, y: 0xffe08a };
const SPRITE = [
  "................................",
  "....................r...........",
  "...................rrr..........",
  "..................rrrrr.........",
  "...................rRr..........",
  "..........k........rR...........",
  "..........k........RR.....y.....",
  ".........kkk.......RR..y.ooy....",
  ".........hhh.......RR...yoooy...",
  "....kkk..hhhh..kk..RR..y.ooy....",
  "....hhh.hhhhhhhhhh.RR.....y.....",
  "..hhhhhhhhhhhhhhhhhhhhhhhhhhh...",
  ".ddddddddddddddddddddddddddddd..",
  "..sssssssssssssssssssssssssss...",
  "...hhhhhhhhhhhhhhhhhhhhhhhhh....",
  "....HHHHHHHHHHHHHHHHHHHHHHH.....",
  ".....HHHHHHHHHHHHHHHHHHHHH......",
];

function pixels(size, inset) {
  const out = new Uint8Array(size * size * 3);
  const unit = Math.floor((size * (1 - 2 * inset)) / 32);
  const ox = Math.floor((size - unit * 32) / 2);
  const oy = Math.floor((size - unit * SPRITE.length) / 2) + unit * 2;
  const cell = Math.max(1, Math.floor(size / 8));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / unit), gy = Math.floor(y / unit);
      let color = SEA[(gx * 3 + gy * 5 + ((gx * gy) % 7)) % 3];
      if (x % cell < Math.max(1, unit * 0.5) || y % cell < Math.max(1, unit * 0.5)) color = LINE;
      const row = SPRITE[Math.floor((y - oy) / unit)];
      const ch = row?.[Math.floor((x - ox) / unit)];
      if (x >= ox && ch && ch !== ".") color = P[ch];
      out.set(hex(color), (x + y * size) * 3);
    }
  return out;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, inset) {
  const rgb = pixels(size, inset);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) Buffer.from(rgb.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/apple-touch-icon.png", png(180, 0.03));
writeFileSync("public/icon-192.png", png(192, 0.03));
writeFileSync("public/icon-512.png", png(512, 0.03));
writeFileSync("public/icon-maskable-512.png", png(512, 0.14));
console.log("Icônes écrites dans public/");
