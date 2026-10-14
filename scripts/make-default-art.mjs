// make-default-art.mjs — generate the tower-defense Template's default art
// (6 GLB models, 2 PNG textures, 10 synthesized WAV sounds) into
// public/templates/tower-defense/bundle/assets/. Zero dependencies; deterministic
// (no Math.random) so `npm run art` is byte-stable and CI can diff it.
//
// Why generated: the art is "default" — simple, recognizable primitives the user
// is expected to replace via model/texture Options (issue #6). Keeping it
// script-generated means the bundle ships no hand-authored binaries and the
// exact asset set is reproducible from source.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, "public", "templates", "tower-defense", "bundle", "assets");

// ---------- deterministic hash (stands in for Math.random) ----------
function hash2(a, b) {
  var h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + 0x5bf03635) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// ---------- geometry (y-up, right-handed; CCW front faces per glTF) ----------
function boxGeometry(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const P = [
    [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], // 0-3 bottom
    [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z], //    4-7 top
  ];
  const faces = [
    { n: [0, -1, 0], i: [0, 1, 2, 0, 2, 3] }, //  -y
    { n: [0, 1, 0], i: [4, 6, 5, 4, 7, 6] }, //   +y
    { n: [0, 0, 1], i: [2, 7, 3, 2, 6, 7] }, //   +z
    { n: [0, 0, -1], i: [0, 5, 1, 0, 4, 5] }, //  -z
    { n: [-1, 0, 0], i: [3, 4, 0, 3, 7, 4] }, //  -x
    { n: [1, 0, 0], i: [1, 6, 2, 1, 5, 6] }, //   +x
  ];
  const positions = [], normals = [], indices = [];
  let v = 0;
  for (const f of faces) {
    for (const vi of f.i) { positions.push(...P[vi]); normals.push(...f.n); }
    for (let k = 0; k < 6; k++) indices.push(v + k);
    v += 4;
  }
  return toGeometry(positions, normals, indices);
}

// truncated cone/cylinder: rb bottom radius, rt top radius, h height, seg segments
function cylinderGeometry(rb, rt, h, seg) {
  const positions = [], normals = [], indices = [];
  const ring = (r, y) => {
    const out = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      out.push([r * Math.cos(a), y, r * Math.sin(a)]);
    }
    return out;
  };
  const bottom = ring(rb, -h / 2), top = ring(rt, h / 2);
  // side quads; normal of a truncated cone: (h·cos a, rb−rt, h·sin a) normalized
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const len = Math.hypot(h, rb - rt);
    const n = [((h * Math.cos(a)) / len) || 0, ((rb - rt) / len) || 0, ((h * Math.sin(a)) / len) || 0];
    positions.push(...bottom[i], ...top[i]); normals.push(...n, ...n);
  }
  let v = 0;
  for (let i = 0; i < seg; i++) {
    indices.push(v + i, v + seg + 1 + i, v + seg + i, v + i, v + seg + 1 + i, v + 1 + i);
  }
  v += (seg + 1) * 2;
  // bottom cap (normal −y)
  if (rb > 0) {
    positions.push(0, -h / 2, 0); normals.push(0, -1, 0);
    const c = v;
    for (let i = 0; i <= seg; i++) { positions.push(...bottom[i]); normals.push(0, -1, 0); }
    for (let i = 0; i < seg; i++) indices.push(c, c + 1 + i, c + 2 + i);
    v += seg + 2;
  }
  // top cap (normal +y)
  if (rt > 0) {
    positions.push(0, h / 2, 0); normals.push(0, 1, 0);
    const c = v;
    for (let i = 0; i <= seg; i++) { positions.push(...top[i]); normals.push(0, 1, 0); }
    for (let i = 0; i < seg; i++) indices.push(c, c + 1 + i, c + 2 + i);
    v += seg + 2;
  }
  return toGeometry(positions, normals, indices);
}

function toGeometry(positions, normals, indices) {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

function translate(geo, x, y, z) {
  const p = new Float32Array(geo.positions);
  for (let i = 0; i < p.length; i += 3) { p[i] += x; p[i + 1] += y; p[i + 2] += z; }
  return { positions: p, normals: new Float32Array(geo.normals), indices: new Uint16Array(geo.indices) };
}

// rotate 90° about Z: a vertical (y-axis) part becomes horizontal along +X
// (x,y,z) → (−y, x, z); normals transform the same way, winding is preserved
function rotZ90(geo) {
  const p = new Float32Array(geo.positions), n = new Float32Array(geo.normals);
  for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1]; p[i] = -y; p[i + 1] = x; }
  for (let i = 0; i < n.length; i += 3) { const x = n[i], y = n[i + 1]; n[i] = -y; n[i + 1] = x; }
  return { positions: p, normals: n, indices: new Uint16Array(geo.indices) };
}

// horizontal cylinder: rb at the +X end, rt at the −X end (from rotZ90 of a
// y-axis cylinder whose bottom/top map to +X/−X)
function barrel(rbAtPlusX, rtAtMinusX, length, seg) {
  return rotZ90(cylinderGeometry(rbAtPlusX, rtAtMinusX, length, seg));
}

// ---------- minimal glTF 2.0 → GLB ----------
function buildGlb(nodes) {
  // nodes: [{ name, parts: [{ geo, pos: [x,y,z], color: [r,g,b] (0..1 linear-ish) }] }]
  // One glTF node per entry; each part = one primitive + one material.
  const materials = [];
  const matIndex = (c) => {
    let i = materials.findIndex((m) => m.color[0] === c[0] && m.color[1] === c[1] && m.color[2] === c[2]);
    if (i < 0) { materials.push({ color: c }); i = materials.length - 1; }
    return i;
  };

  const bufferViews = [], accessors = [], gltfNodes = [], meshes = [];
  const binParts = [];
  let offset = 0;
  const align = (a) => { offset += (a - (offset % a)) % a; };

  const pushRegion = (arr, target) => {
    align(arr.BYTES_PER_ELEMENT);
    const view = { buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target };
    binParts.push(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
    offset += arr.byteLength;
    return bufferViews.push(view) - 1;
  };

  nodes.forEach((n) => {
    const primitives = [];
    n.parts.forEach((part) => {
      const g = part.pos && part.pos.some((v) => v !== 0) ? translate(part.geo, ...part.pos) : part.geo;
      const pv = pushRegion(g.positions, 34962);
      const nv = pushRegion(g.normals, 34962);
      const iv = pushRegion(g.indices, 34963);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < g.positions.length; i += 3) {
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], g.positions[i + k]); max[k] = Math.max(max[k], g.positions[i + k]); }
      }
      const pa = accessors.push({ bufferView: pv, componentType: 5126, count: g.positions.length / 3, type: "VEC3", min, max }) - 1;
      const na = accessors.push({ bufferView: nv, componentType: 5126, count: g.normals.length / 3, type: "VEC3" }) - 1;
      const ia = accessors.push({ bufferView: iv, componentType: 5123, count: g.indices.length, type: "SCALAR" }) - 1;
      primitives.push({ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: matIndex(part.color) });
    });
    meshes.push({ name: n.name, primitives });
    gltfNodes.push({ name: n.name, mesh: meshes.length - 1 });
  });

  const bin = new Uint8Array(offset);
  let o = 0;
  for (const part of binParts) { bin.set(new Uint8Array(part), o); o += part.byteLength; }

  const json = {
    asset: { version: "2.0", generator: "game-creator make-default-art" },
    scene: 0,
    scenes: [{ nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes,
    materials: materials.map((m, i) => ({
      name: "mat" + i,
      pbrMetallicRoughness: { baseColorFactor: [m.color[0], m.color[1], m.color[2], 1], metallicFactor: 0.0, roughnessFactor: 0.85 },
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const pad = (bytes, n, fill) => {
    const rem = bytes.byteLength % 4;
    if (!rem) return bytes;
    const out = new Uint8Array(bytes.byteLength + (4 - rem));
    out.set(bytes);
    out.fill(fill, bytes.byteLength);
    return out;
  };
  const jP = pad(jsonBytes, 4, 0x20);
  const bP = pad(bin, 4, 0x00);
  const total = 12 + 8 + jP.byteLength + 8 + bP.byteLength;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jP.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // JSON
  u8.set(jP, 20);
  let off = 20 + jP.byteLength;
  dv.setUint32(off, bP.byteLength, true);
  dv.setUint32(off + 4, 0x004e4942, true); // BIN
  u8.set(bP, off + 8);
  return new Uint8Array(out);
}

// ---------- models (simple, recognizable; towers expose a "barrel" node) ----------
const TOWERS = {
  "tower_arrow": [
    {
      name: "body",
      parts: [
        { geo: cylinderGeometry(0.55, 0.55, 0.5, 12), pos: [0, 0.25, 0], color: [0.48, 0.36, 0.22] },
        { geo: boxGeometry(0.9, 0.16, 0.9), pos: [0, 0.58, 0], color: [0.36, 0.27, 0.16] },
        { geo: cylinderGeometry(0.3, 0.3, 0.22, 12), pos: [0, 0.73, 0], color: [0.3, 0.22, 0.13] },
      ],
    },
    { name: "barrel", parts: [{ geo: barrel(0.02, 0.16, 0.85, 10), pos: [0.45, 0.85, 0], color: [0.85, 0.78, 0.6] }] },
  ],
  "tower_cannon": [
    {
      name: "body",
      parts: [
        { geo: cylinderGeometry(0.65, 0.65, 0.45, 14), pos: [0, 0.225, 0], color: [0.3, 0.32, 0.36] },
        { geo: cylinderGeometry(0.42, 0.42, 0.34, 14), pos: [0, 0.6, 0], color: [0.22, 0.23, 0.27] },
      ],
    },
    { name: "barrel", parts: [{ geo: barrel(0.29, 0.24, 1.0, 12), pos: [0.55, 0.62, 0], color: [0.14, 0.15, 0.18] }] },
  ],
  "tower_frost": [
    {
      name: "body",
      parts: [
        { geo: boxGeometry(0.8, 0.5, 0.8), pos: [0, 0.25, 0], color: [0.62, 0.8, 0.9] },
        { geo: boxGeometry(0.45, 0.4, 0.45), pos: [0, 0.68, 0], color: [0.75, 0.89, 0.97] },
      ],
    },
    { name: "barrel", parts: [{ geo: barrel(0.05, 0.24, 0.75, 8), pos: [0.4, 0.95, 0], color: [0.88, 0.97, 1.0] }] },
  ],
  "enemy_grunt": [
    {
      name: "body",
      parts: [
        { geo: cylinderGeometry(0.38, 0.3, 0.5, 10), pos: [0, 0.25, 0], color: [0.38, 0.55, 0.25] },
        { geo: cylinderGeometry(0.26, 0.26, 0.3, 10), pos: [0, 0.62, 0], color: [0.26, 0.42, 0.18] },
      ],
    },
  ],
  "enemy_brute": [
    {
      name: "body",
      parts: [
        { geo: cylinderGeometry(0.58, 0.46, 0.72, 12), pos: [0, 0.36, 0], color: [0.62, 0.22, 0.2] },
        { geo: cylinderGeometry(0.4, 0.4, 0.4, 12), pos: [0, 0.92, 0], color: [0.44, 0.15, 0.14] },
      ],
    },
  ],
  "base_castle": [
    {
      name: "body",
      parts: [
        { geo: boxGeometry(2.2, 1.5, 2.2), pos: [0, 0.75, 0], color: [0.5, 0.53, 0.58] },
        { geo: cylinderGeometry(0.45, 0.45, 2.0, 10), pos: [1.4, 1.0, 1.4], color: [0.44, 0.47, 0.52] },
        { geo: cylinderGeometry(0.45, 0.45, 2.0, 10), pos: [-1.4, 1.0, 1.4], color: [0.44, 0.47, 0.52] },
        { geo: cylinderGeometry(0.45, 0.45, 2.0, 10), pos: [1.4, 1.0, -1.4], color: [0.44, 0.47, 0.52] },
        { geo: cylinderGeometry(0.45, 0.45, 2.0, 10), pos: [-1.4, 1.0, -1.4], color: [0.44, 0.47, 0.52] },
        { geo: boxGeometry(0.55, 0.3, 0.55), pos: [1.4, 2.15, 1.4], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.55, 0.3, 0.55), pos: [-1.4, 2.15, 1.4], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.55, 0.3, 0.55), pos: [1.4, 2.15, -1.4], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.55, 0.3, 0.55), pos: [-1.4, 2.15, -1.4], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.4, 0.3, 0.35), pos: [-0.65, 1.62, 1.12], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.4, 0.3, 0.35), pos: [0, 1.62, 1.12], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.4, 0.3, 0.35), pos: [0.65, 1.62, 1.12], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.4, 0.3, 0.35), pos: [-0.65, 1.62, -1.12], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.4, 0.3, 0.35), pos: [0, 1.62, -1.12], color: [0.38, 0.4, 0.45] },
        { geo: boxGeometry(0.4, 0.3, 0.35), pos: [0.65, 1.62, -1.12], color: [0.38, 0.4, 0.45] },
      ],
    },
  ],
};

// ---------- PNG (RGB8, zlib IDAT) ----------
function crc32(bytes) {
  let c;
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[n] = c >>> 0;
    }
  }
  let out = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) out = crc32.table[(out ^ bytes[i]) & 0xff] ^ (out >>> 8);
  return (out ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = new DataView(new ArrayBuffer(4));
  len.setUint32(0, data.byteLength, false);
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(4 + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  const crc = new DataView(new ArrayBuffer(4));
  crc.setUint32(0, crc32(crcInput), false);
  const out = new Uint8Array(12 + data.byteLength);
  out.set(new Uint8Array(len.buffer), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(new Uint8Array(crc.buffer), 8 + data.byteLength);
  return out;
}
function encodePng(width, height, rgb) {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new DataView(new ArrayBuffer(13));
  ihdr.setUint32(0, width, false);
  ihdr.setUint32(4, height, false);
  ihdr.setUint8(8, 8); // bit depth
  ihdr.setUint8(9, 2); // color type: truecolor
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  // NOTE: deflateSync returns a Buffer that may be a VIEW into a larger internal
  // buffer — pass the view itself (byteLength-correct), never `new Uint8Array(buf.buffer)`
  // (that would copy the whole internal buffer, with garbage beyond the stream).
  const chunks = [
    pngChunk("IHDR", new Uint8Array(ihdr.buffer)),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = sig.byteLength + chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const piece of [sig, ...chunks]) { out.set(piece, o); o += piece.byteLength; }
  return out;
}

// ---------- WAV (16-bit PCM mono) ----------
const SR = 22050;
function encodeWav(samples) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, "RIFF");
  dv.setUint32(4, 36 + n * 2, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  wstr(36, "data");
  dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

// ---------- sound synthesis ----------
function env(t01, attack, decayPow) {
  if (attack > 0 && t01 < attack) return t01 / attack;
  const x = attack > 0 ? (t01 - attack) / (1 - attack) : t01;
  return Math.pow(1 - x, decayPow);
}
function synth(dur, fn) {
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = Math.max(-1, Math.min(1, fn(i / n, t)));
  }
  return out;
}
function tone(f0, f1, dur, vol, attack, decayPow) {
  // linear chirp; phase = ∫f dt = f0·t + (f1−f0)·t²/2
  return synth(dur, (t01, t) => {
    const f = f0 + (f1 - f0) * t01;
    return Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / 2)) * vol * env(t01, attack, decayPow);
  });
}
function noiseBurst(dur, vol, attack, decayPow) {
  return synth(dur, (t01, t) => {
    const h = hash2(Math.floor(t * SR) & 0xffff, 0x9e37);
    return (h * 2 - 1) * vol * env(t01, attack, decayPow);
  });
}
function note(freq, dur, when, vol, decayPow) {
  const b = tone(freq, freq, dur, vol, 0.03, decayPow);
  const out = new Float32Array(Math.floor(SR * (when + dur)));
  out.set(b, Math.floor(SR * when));
  return out;
}
function mix(...buffers) {
  let n = 0;
  for (const b of buffers) n = Math.max(n, b.length);
  const out = new Float32Array(n);
  for (const b of buffers) for (let i = 0; i < b.length; i++) out[i] += b[i];
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.95) { const s = 0.95 / peak; for (let i = 0; i < n; i++) out[i] *= s; }
  return out;
}

const SOUNDS = {
  place: () => mix(tone(420, 700, 0.09, 0.6, 0.04, 2)),
  shoot_arrow: () => mix(tone(1500, 500, 0.07, 0.35, 0.01, 2)),
  shoot_cannon: () => mix(tone(120, 45, 0.16, 0.7, 0.01, 1.5), noiseBurst(0.14, 0.5, 0.01, 2.5)),
  shoot_frost: () => mix(tone(2100, 2600, 0.09, 0.25, 0.02, 2.5), tone(3200, 3800, 0.07, 0.18, 0.02, 3)),
  hit: () => mix(tone(240, 140, 0.07, 0.55, 0.01, 2)),
  kill: () => mix(tone(330, 90, 0.14, 0.55, 0.01, 1.8), noiseBurst(0.1, 0.35, 0.01, 2.5)),
  leak: () => mix(tone(90, 50, 0.28, 0.7, 0.01, 1.5), noiseBurst(0.25, 0.5, 0.01, 2)),
  wave: () => mix(note(392, 0.12, 0, 0.4, 2), note(523, 0.12, 0.12, 0.4, 2), note(659, 0.16, 0.24, 0.45, 2)),
  win: () => mix(note(523, 0.14, 0, 0.45, 2), note(659, 0.14, 0.14, 0.45, 2), note(784, 0.14, 0.28, 0.45, 2), note(1047, 0.3, 0.42, 0.5, 1.8)),
  lose: () => mix(note(392, 0.18, 0, 0.45, 1.8), note(330, 0.18, 0.18, 0.45, 1.8), note(262, 0.18, 0.36, 0.45, 1.8), note(196, 0.35, 0.54, 0.5, 1.5)),
};

// ---------- textures ----------
function groundTexture() {
  const w = 256, h = 256;
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (hash2(x, y) - 0.5) * 26; // noise ±13
      const checker = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0 ? -7 : 4;
      rgb[(y * w + x) * 3] = Math.max(0, Math.min(255, 58 + n + checker));
      rgb[(y * w + x) * 3 + 1] = Math.max(0, Math.min(255, 90 + n + checker));
      rgb[(y * w + x) * 3 + 2] = Math.max(0, Math.min(255, 46 + n * 0.7 + checker));
    }
  }
  return encodePng(w, h, rgb);
}

function skyTexture() {
  // equirectangular panorama: color varies only with row (v) — a night-dusk gradient
  const w = 512, h = 256;
  const rgb = new Uint8Array(w * h * 3);
  const top = [9, 14, 32], horizon = [64, 84, 116], under = [20, 24, 30];
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    let c;
    if (v < 0.5) {
      const t = v / 0.5;
      c = [top[0] + (horizon[0] - top[0]) * t, top[1] + (horizon[1] - top[1]) * t, top[2] + (horizon[2] - top[2]) * t];
    } else {
      const t = Math.min(1, (v - 0.5) / 0.18);
      c = [horizon[0] + (under[0] - horizon[0]) * t, horizon[1] + (under[1] - horizon[1]) * t, horizon[2] + (under[2] - horizon[2]) * t];
    }
    for (let x = 0; x < w; x++) {
      let star = 0;
      if (v < 0.45 && hash2(x, y) > 0.9988) star = 90 + hash2(y, x) * 120;
      const i = (y * w + x) * 3;
      rgb[i] = Math.max(0, Math.min(255, c[0] + star));
      rgb[i + 1] = Math.max(0, Math.min(255, c[1] + star));
      rgb[i + 2] = Math.max(0, Math.min(255, c[2] + star));
    }
  }
  return encodePng(w, h, rgb);
}

// ---------- write everything ----------
const dirs = { models: "models", textures: "textures", audio: "audio" };
for (const d of Object.values(dirs)) fs.mkdirSync(path.join(OUT, d), { recursive: true });

let count = 0;
function write(rel, bytes) {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
  count++;
  console.log("  " + rel + " (" + bytes.byteLength + " bytes)");
}

console.log("default art → " + path.relative(root, OUT));
for (const [name, nodes] of Object.entries(TOWERS)) {
  write("models/" + name + ".glb", buildGlb(nodes));
}
write("textures/ground.png", groundTexture());
write("textures/skybox.png", skyTexture());
for (const [name, fn] of Object.entries(SOUNDS)) {
  write("audio/" + name + ".wav", encodeWav(fn()));
}
console.log(count + " files written");
