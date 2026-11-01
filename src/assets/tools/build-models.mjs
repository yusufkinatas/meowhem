// MEOWHEM model build: assets-raw/** -> public/models/<cat>/<key>.glb + public/models/manifest.json
// Not part of the game bundle. Needs @gltf-transform/{core,extensions,functions}@4 + meshoptimizer, e.g.
//   mkdir /tmp/mb && cd /tmp/mb && npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
//   cp <repo>/src/assets/tools/*.mjs . && node build-models.mjs
//   (pass keys to rebuild only those: node build-models.mjs sofa tv)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, getBounds, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ENTRIES } from './entries.mjs';

const GAME = '/Users/yusufeminkinatas/Desktop/cat-game';
const OUT = path.join(GAME, 'public/models');
const { PROP_DEFS } = await import(path.join(GAME, 'src/shared/propDefs.ts'));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

const r3 = (v) => v.map((x) => +x.toFixed(4));
const deg = Math.PI / 180;

function rotMat([x, y, z]) { // three.js Euler 'XYZ' -> row-major 3x3
  const a = Math.cos(x * deg), b = Math.sin(x * deg), c = Math.cos(y * deg), d = Math.sin(y * deg), e = Math.cos(z * deg), f = Math.sin(z * deg);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [[c * e, -c * f, d], [af + be * d, ae - bf * d, -b * c], [bf - ae * d, be + af * d, a * c]];
}
function rotBox(min, max, rot) {
  const m = rotMat(rot), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
    for (let k = 0; k < 3; k++) {
      const v = m[k][0] * p[0] + m[k][1] * p[1] + m[k][2] * p[2];
      lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v);
    }
  }
  return [lo, hi];
}
function colliderSize(def) {
  if (def.shape === 'box') return def.half.map((h) => 2 * h);
  if (def.shape === 'cyl') return [2 * def.r, 2 * def.hh, 2 * def.r];
  return [2 * def.r, 2 * def.r, 2 * def.r];
}

/** area-weighted vertex normals over the existing (indexed) vertices, like three's computeVertexNormals */
function vertexNormals(doc, prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = pos.getCount();
  const out = new Float32Array(n * 3), a = [], b = [], c = [];
  const tris = idx ? idx.getCount() / 3 : n / 3;
  for (let t = 0; t < tris; t++) {
    const i = [0, 1, 2].map((k) => (idx ? idx.getScalar(t * 3 + k) : t * 3 + k));
    pos.getElement(i[0], a); pos.getElement(i[1], b); pos.getElement(i[2], c);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const k of i) for (let j = 0; j < 3; j++) out[k * 3 + j] += f[j];
  }
  for (let k = 0; k < n; k++) {
    const l = Math.hypot(out[k * 3], out[k * 3 + 1], out[k * 3 + 2]) || 1;
    for (let j = 0; j < 3; j++) out[k * 3 + j] /= l;
  }
  prim.setAttribute('NORMAL', doc.createAccessor().setArray(out).setType('VEC3').setBuffer(pos.getBuffer()));
}

const only = new Set(process.argv.slice(2));
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = only.size && fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const report = [];

for (const e of ENTRIES) {
  if (only.size && !only.has(e.key)) continue;
  const doc = await io.read(e.src);
  const root = doc.getRoot();

  // ---- node surgery
  for (const n of root.listNodes()) {
    const name = n.getName();
    if (e.dropNodes?.includes(name)) n.dispose();
    else if (e.keepNodes && n.getMesh() && !e.keepNodes.includes(name)) n.setMesh(null);
  }
  // palette-strip recolor: move UVs from one palette cell to another ({ fromCell: toCell })
  if (e.uvRemap) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const uv = p.getAttribute('TEXCOORD_0'), w = p.getMaterial()?.getBaseColorTexture()?.getSize()?.[0];
    if (!uv || !w) continue;
    const el = [];
    for (let i = 0; i < uv.getCount(); i++) {
      uv.getElement(i, el);
      const to = e.uvRemap[Math.floor(el[0] * w)];
      if (to != null) { el[0] += (to - Math.floor(el[0] * w)) / w; uv.setElement(i, el); }
    }
  }
  if (e.keepClips) for (const a of root.listAnimations()) if (!e.keepClips.includes(a.getName())) a.dispose();
  // GLTFLoader falls back to flat shading without normals; toon needs real ones
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) if (!p.getAttribute('NORMAL')) vertexNormals(doc, p);
  if (e.simplify) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: e.simplify, error: 0.002 }));

  // ---- content-hash texture names: the loader shares GPU textures with the same name across files
  for (const t of root.listTextures()) {
    const img = t.getImage();
    if (!img) continue;
    t.setName('h' + createHash('sha1').update(img).digest('hex').slice(0, 12)).setURI('');
  }
  await doc.transform(prune(), dedup());

  // ---- placement maths
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const b = getBounds(scene);
  const rot = e.rot ?? [0, 0, 0];
  const [lo, hi] = rotBox(b.min, b.max, rot);
  const raw = hi.map((v, i) => v - lo[i]);
  const isProp = e.cat === 'props' || e.cat === 'mess';
  let scale;
  let collider;
  if (e.scale) scale = Array.isArray(e.scale) ? e.scale : [e.scale, e.scale, e.scale];
  else {
    let fit = e.fit;
    if (e.prop) {
      collider = colliderSize(PROP_DEFS[e.prop]);
      const ax = { x: 0, y: 1, z: 2 };
      fit = e.fit ?? (e.match === 'all' ? { x: collider[0], y: collider[1], z: collider[2] } : { [e.match ?? 'y']: collider[ax[e.match ?? 'y']] });
    }
    const f = {};
    for (const k of ['x', 'y', 'z']) if (fit[k] != null) f[k] = fit[k] / raw[{ x: 0, y: 1, z: 2 }[k]];
    const uni = f.y ?? f.x ?? f.z;
    scale = e.nonUniform || e.match === 'all' ? [f.x ?? uni, f.y ?? uni, f.z ?? uni] : [uni, uni, uni];
  }
  const smin = lo.map((v, i) => v * scale[i]), smax = hi.map((v, i) => v * scale[i]);
  const size = smax.map((v, i) => v - smin[i]);
  const c = smin.map((v, i) => (v + smax[i]) / 2);
  const origin = e.origin ?? (isProp ? 'center' : 'feet');
  const offset = origin === 'feet' ? [-c[0], -smin[1], -c[2]] : [-c[0], -c[1], -c[2]];

  const file = `${e.cat}/${e.key}.glb`;
  fs.mkdirSync(path.join(OUT, e.cat), { recursive: true });
  const glb = await io.writeBinary(doc);
  fs.writeFileSync(path.join(OUT, file), glb);

  const entry = {
    file, category: e.cat, name: e.name, license: e.lic, author: e.author, sourceUrl: e.url,
    scale: scale.map((s) => +s.toPrecision(6)),
    rotation: rot, origin, offset: r3(offset), size: r3(size),
    material: e.mat ?? process.env.MAT ?? 'toon',
  };
  if (e.tint) entry.tint = e.tint;
  if (e.clips) entry.clips = e.clips;
  if (e.nodes) entry.nodes = e.nodes;
  if (collider) {
    entry.collider = r3(collider);
    const ratio = size.map((v, i) => v / collider[i]);
    const bad = ratio.some((q) => q < 0.7 || q > 1.35);
    report.push(`${bad ? '!!' : 'ok'} ${e.key.padEnd(12)} model ${r3(size).join(' x ')}  collider ${r3(collider).join(' x ')}  ratio ${ratio.map((q) => q.toFixed(2)).join(' ')}`);
  }
  if (e.notes) entry.notes = e.notes;
  manifest[e.key] = entry;
  const anims = root.listAnimations().map((a) => a.getName());
  console.log(`${e.key.padEnd(16)} ${(glb.byteLength / 1024).toFixed(0).padStart(5)} KB  size ${r3(size).join(' x ')}${anims.length ? '  clips ' + anims.length : ''}`);
}

if (!only.size) { // full build: delete GLBs that are no longer in the manifest
  const keep = new Set(Object.values(manifest).map((m) => m.file));
  for (const dir of fs.readdirSync(OUT, { withFileTypes: true })) if (dir.isDirectory())
    for (const f of fs.readdirSync(path.join(OUT, dir.name))) if (!keep.has(`${dir.name}/${f}`)) { fs.rmSync(path.join(OUT, dir.name, f)); console.log('removed stale', dir.name + '/' + f); }
}
const sorted = Object.fromEntries(Object.keys(manifest).sort((a, b) => manifest[a].category.localeCompare(manifest[b].category) || a.localeCompare(b)).map((k) => [k, manifest[k]]));
fs.writeFileSync(manifestPath, JSON.stringify(sorted, null, 1) + '\n');
console.log('\n' + report.join('\n'));
