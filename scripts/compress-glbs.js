const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const dir = 'assets/models';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.glb') && !f.endsWith('-draco.glb'));

async function processFile(file) {
  const p = path.join(dir, file);
  const buf = fs.readFileSync(p);
  // Parse GLB
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) return;
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  let bin = buf.slice(20 + jsonLen + 8);
  const images = json.images || [];
  const bv = json.bufferViews || [];
  let offset = 0;
  const newParts = [];
  for (const bvEntry of bv) newParts.push(null);
  const replacements = new Map(); // bv index -> new buffer
  for (const img of images) {
    if (img.bufferView === undefined) continue;
    const b = bv[img.bufferView];
    const start = b.byteOffset || 0;
    const end = start + b.byteLength;
    const png = bin.slice(start, end);
    try {
      const resized = await sharp(png)
        .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
        .png({ quality: 80, compressionLevel: 9 })
        .toBuffer();
      replacements.set(img.bufferView, resized);
      console.log(`  ${file}: image ${img.mimeType} ${(end - start) / 1024 | 0}KB -> ${resized.length / 1024 | 0}KB`);
    } catch (e) {
      console.log(`  ${file}: skip image (${e.message})`);
    }
  }
  // rebuild bin
  const newBinParts = [];
  const newBv = [];
  let cursor = 0;
  for (let i = 0; i < bv.length; i++) {
    const b = bv[i];
    const start = b.byteOffset || 0;
    const data = replacements.has(i) ? replacements.get(i) : bin.slice(start, start + b.byteLength);
    const pad = (4 - (cursor % 4)) % 4;
    if (pad) { newBinParts.push(Buffer.alloc(pad)); cursor += pad; }
    newBv.push({ byteOffset: cursor, byteLength: data.length });
    newBinParts.push(data);
    cursor += data.length;
  }
  const newBin = Buffer.concat(newBinParts);
  json.bufferViews = bv.map((b, i) => ({ ...b, byteOffset: newBv[i].byteOffset, byteLength: newBv[i].byteLength }));
  if (json.buffers && json.buffers[0]) json.buffers[0].byteLength = newBin.length;
  let jsonStr = JSON.stringify(json);
  const jsonPad = (4 - (jsonStr.length % 4)) % 4;
  jsonStr += ' '.repeat(jsonPad);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const binPad = (4 - (newBin.length % 4)) % 4;
  const binBuf = Buffer.concat([newBin, Buffer.alloc(binPad)]);
  const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546C67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4E4F534A, 16);
  jsonBuf.copy(out, 20);
  const binChunkStart = 20 + jsonBuf.length;
  out.writeUInt32LE(binBuf.length, binChunkStart);
  out.writeUInt32LE(0x004E4942, binChunkStart + 4);
  binBuf.copy(out, binChunkStart + 8);
  fs.writeFileSync(p, out);
  console.log(`${file}: ${(buf.length / 1048576).toFixed(1)}MB -> ${(out.length / 1048576).toFixed(1)}MB`);
}

(async () => {
  for (const f of files) await processFile(f);
})();
