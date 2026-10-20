import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = 'public/assets/brand/favicon';
await mkdir(directory, { recursive: true });
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}
function png(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    pixels[row] = 0;
    for (let x = 0; x < size; x++) {
      const inLetter = (x >= size * .3 && x <= size * .7 && y >= size * .18 && y <= size * .3) ||
        (x >= size * .44 && x <= size * .56 && y > size * .3 && y < size * .7) ||
        (x >= size * .3 && x <= size * .7 && y >= size * .7 && y <= size * .82);
      const offset = row + 1 + x * 4;
      pixels[offset] = inLetter ? 255 : 0;
      pixels[offset + 1] = inLetter ? 255 : 184;
      pixels[offset + 2] = inLetter ? 255 : 212;
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['maskable-icon-512.png', 512]]) {
  await writeFile(`${directory}/${name}`, png(size));
}
const image = png(32);
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader[6] = 32;
icoHeader[7] = 32;
icoHeader[8] = 0;
icoHeader[9] = 0;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(image.length, 14);
icoHeader.writeUInt32LE(22, 18);
await writeFile(`${directory}/favicon.ico`, Buffer.concat([icoHeader, image]));
