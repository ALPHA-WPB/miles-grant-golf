import * as THREE from "three";
import maplibregl from "maplibre-gl";
import { Tree } from "../vendor/ez-tree/tree";
import { getLeafTexture } from "../vendor/ez-tree/textures";

// Realistic 3D layer for the illustrated course: leafy oaks, palms with fronds and houses
// with hip roofs, lit by a sun to the south (as in the imagery) with soft ground shadows.
// Runs three.js inside the map's own WebGL context as a MapLibre custom layer.

const M = 111320; // meters per degree of latitude

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
const color = hex => new THREE.Color(hex);

// ── Broadleaf trees: real branching trunks with bark textures and photographic leaf cards ──
// (ez-tree). A few shapes are generated once and reused for every oak, each scaled to its
// measured canopy. Leaf and branch counts are trimmed so hundreds of trees run on a phone.
function oakVariants(low = false, far = false) {
  // far: trees away from the hole being played. Same silhouettes, a fraction of the triangles (fewer, bigger leaf
  // cards and coarser limbs), so the detail budget goes to the trees the player actually stands next to.
  // far === 2: trees more than 320 m from the hole's line (a leaf card there is a pixel or two): about 60% of the far leaf
  // cards (630/270 instead of 1050/450 triangles), each larger so the crown covers the same area; limbs as for far.
  return (far ? ["Oak Medium", "Oak Small"] : ["Oak Medium", "Oak Medium", "Oak Small", "Oak Medium"]).map((name, i) => {
    const tree = new Tree();
    tree.loadPreset(name);
    const o = tree.options;
    o.seed = 4211 + i * 7919;
    // Florida live oaks: short trunk, wide spreading limbs, dense foliage
    o.branch.length[0] *= 0.6;
    o.branch.angle[1] = Math.min(80, (o.branch.angle[1] || 50) + 14);
    o.branch.angle[2] = Math.min(75, (o.branch.angle[2] || 50) + 8);
    o.branch.length[1] *= 1.15;
    o.leaves.count = Math.max(far === 2 ? 2 : far ? 4 : 7, Math.round(o.leaves.count * (far === 2 ? 0.08 : far ? 0.16 : low ? 0.35 : 1.2)));   // near the hole on HIGH: about 1.6x the leaf cards of before (0.7 -> 1.2), each a little smaller (2.3 -> 2.0), so the crown is a closed canopy, not tufts with sky between them. Low graphics: half the leaf cards, bigger so the canopy still fills
    o.leaves.size *= far === 2 ? 5.7 : far ? 4.4 : low ? 3.1 : 2.0;
    o.leaves.billboard = "single";
    o.branch.children[2] = Math.max(2, (o.branch.children[2] || 3) - 1);
    for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * (far ? 0.4 : 0.6)));
    for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(1, Math.round(o.branch.sections[k] * (far ? 0.3 : 0.6)));
    // far oaks: the last level of twigs is thinner than a pixel from 160 m and sits inside the (large) leaf cards, so it
    // is generated (the leaves grow from it, in the same places) but not drawn. Branches are generated level by level,
    // so the twigs are the tail of the buffers.
    let twigI = -1, twigV = -1;
    if (far) {
      const gen = tree.generateBranch.bind(tree);
      tree.generateBranch = br => {
        if (twigI < 0 && br.level === o.branch.levels) { twigI = tree.branches.indices.length; twigV = tree.branches.verts.length / 3; }
        gen(br);
      };
    }
    tree.generate();
    if (twigI > 0) {
      const g0 = tree.branchesMesh.geometry, g1 = new THREE.BufferGeometry();
      for (const [name, n] of [["position", 3], ["normal", 3], ["uv", 2]]) g1.setAttribute(name, new THREE.BufferAttribute(g0.attributes[name].array.slice(0, twigV * n), n));
      g1.setIndex(new THREE.BufferAttribute(g0.index.array.slice(0, twigI), 1));
      g0.dispose();
      tree.branchesMesh.geometry = g1;
    }
    const bGeo = tree.branchesMesh.geometry, lGeo = tree.leavesMesh.geometry;
    lGeo.computeBoundingBox(); bGeo.computeBoundingBox();
    const bb = lGeo.boundingBox.clone().union(bGeo.boundingBox);
    return { bGeo, lGeo, barkMat: tree.branchesMesh.material, alphaTest: o.leaves.alphaTest,
      radius: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2, height: bb.max.y,
      tris: (bGeo.index?.count || 0) / 3 + (lGeo.index?.count || 0) / 3 };
  });
}

// ── Palms: every frond is a curved stem with individual leaflets (unit height = 1) ─────────
// Leaflet texture: one slender leaf with a midrib, light-to-dark along its length
function leafletTexture() {
  // 64x512 (was 32x256), drawn at 2x scale; anisotropy 8 keeps the slender leaflets crisp at a slant
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 512;
  const x = cv.getContext("2d");
  x.scale(2, 2);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#5b7f2c"); g.addColorStop(0.5, "#4f7a27"); g.addColorStop(1, "#7f9a3a");
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(16, 0);
  x.bezierCurveTo(29, 40, 27, 170, 16, 256);
  x.bezierCurveTo(5, 170, 3, 40, 16, 0);
  x.fill();
  x.strokeStyle = "rgba(225,232,160,0.55)"; x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(16, 0); x.lineTo(16, 256); x.stroke();
  x.strokeStyle = "rgba(20,40,10,0.35)"; x.lineWidth = 0.8;
  for (const dx of [-4, 4]) { x.beginPath(); x.moveTo(16 + dx * 0.4, 20); x.quadraticCurveTo(16 + dx, 128, 16 + dx * 0.3, 240); x.stroke(); }
  // fine side veins slanting toward the tip
  x.strokeStyle = "rgba(30,55,15,0.18)"; x.lineWidth = 0.5;
  for (let y = 14; y < 246; y += 7) for (const sd of [-1, 1]) {
    const hw = 9 * Math.sin(Math.PI * Math.min(1, y / 256));
    x.beginPath(); x.moveTo(16, y); x.lineTo(16 + sd * hw, y - 7); x.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function trunkTexture() {
  // 128x1024 (was 64x512): vertical bark fissures from stretched noise + fine grain, with mipmaps and anisotropy
  const W = 128, H = 1024;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  const img = x.createImageData(W, H), d = img.data;
  // value noise with separate periods in x and y, so it tiles and can be stretched along the trunk
  const vn = (u, v, px, py, sd) => {
    const xi = Math.floor(u), yi = Math.floor(v), fx = u - xi, fy = v - yi;
    const h = (a, b) => hash3(((a % px) + px) % px, ((b % py) + py) % py, sd);
    const sm = t => t * t * (3 - 2 * t), ux = sm(fx), uy = sm(fy);
    return (h(xi, yi) * (1 - ux) + h(xi + 1, yi) * ux) * (1 - uy) + (h(xi, yi + 1) * (1 - ux) + h(xi + 1, yi + 1) * ux) * uy;
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 4;
    // ridges: tall thin noise (period wraps horizontally and vertically)
    const ridge = vn(i / W * 16, j / H * 4, 16, 4, 41) * 0.6 + vn(i / W * 32, j / H * 12, 32, 12, 43) * 0.4;
    const fis = Math.abs(ridge - 0.5) < 0.05 ? -1 : 0;                     // dark cracks along the ridge crossings
    const band = Math.sin(j / H * Math.PI * 2 * 38 + ridge * 5) * 0.5;      // soft growth rings
    const g = (hash3(i, j, 47) - 0.5) * 16;
    const v = (ridge - 0.5) * 46 + band * 10 + fis * 40 + g;
    d[k] = 140 + v; d[k + 1] = 130 + v * 0.95; d[k + 2] = 115 + v * 0.85; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Crown geometry in unit-height space: arching fronds (some young and upright, some old and
// hanging), each with leaflets on both sides that droop from the stem
// far: 0 = near the hole (full detail), 1 = beyond NEAR, 2 = beyond FAR2 (a crown about a dozen pixels wide on a phone)
// Palm shapes near the hole, so a row of palms is not one tree repeated: frond count, frond length, how upright or drooping
// the crown is, how much dead skirt hangs under it, and leaf colour. Far palms keep the one plain shape.
const PALM_STYLES = [
  { nF: 17, len: 1, up: 0, dead: 6, hue: 0.22, light: 1 },            // the standard crown
  { nF: 22, len: 1.25, up: -0.1, dead: 8, hue: 0.225, light: 0.92 },  // big full round crown, heavy skirt
  { nF: 11, len: 0.7, up: 0.45, dead: 0, hue: 0.24, light: 1.3 },     // young: a few short upright fronds, fresh green, no skirt
  { nF: 14, len: 1.1, up: -0.5, dead: 12, hue: 0.19, light: 0.8 },    // old and drooping, darker, long skirt
  { nF: 18, len: 0.75, up: 0.05, dead: 4, hue: 0.2, light: 1.1 },     // compact ball, slightly yellow-green
];
function palmCrown(seed, far = 0, low = false, style = PALM_STYLES[0]) {
  const r = rng(seed);
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const quad = (a, b, cc, d, tint) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...cc, ...d);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) col.push(tint.r, tint.g, tint.b);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const top = V(0.035, 1, 0);
  // GFX LOW near the hole: the same crown shapes, built light (half the stem segments, 18 leaflets a side instead of 24,
  // each a single wider card). The three near crowns were 1.09 M of LOW's 3.1 M triangles on hole 1 (limit 2.5 M).
  const lite = low && !far;
  const nF = far === 2 ? 7 : far ? 10 : style.nF;      // far palms: fewer fronds and leaflets, each leaflet wider so the crown reads the same
  // near palms only: a skirt of dead, straw-brown fronds hanging against the trunk under the green crown (generated after
  // the live fronds, so those are exactly as before)
  const nDead = far || low ? 0 : style.dead;   // GFX LOW: no skirt or boot (LOW must not get heavier)
  for (let f = 0; f < nF + nDead; f++) {
    const dead = f >= nF;
    const az = dead ? ((f - nF) / nDead) * Math.PI * 2 + r() * 0.6 : (f / nF) * Math.PI * 2 + r() * 0.35;
    const tier = dead ? 2 : f % 3;                        // 0 young/upright, 1 spreading, 2 old/hanging
    const elev = dead ? -0.9 - r() * 0.35 : (tier === 0 ? 0.95 + r() * 0.3 : tier === 1 ? 0.35 + r() * 0.25 : -0.15 - r() * 0.3) + (far ? 0 : style.up);
    const L = dead ? 0.2 + r() * 0.07 : (0.34 + r() * 0.08) * (far ? 1 : style.len);
    const dirH = V(Math.cos(az), 0, Math.sin(az));
    const start = top.clone().add(V(0, dead ? -0.04 : -0.015 * tier, 0));
    const pts = [], tans = [];
    const N = dead ? 5 : far === 2 ? 3 : far ? 5 : lite ? 7 : 14;
    for (let j = 0; j <= N; j++) {
      const s = (j / N) * L;
      const rise = Math.sin(elev) * s - (tier === 2 ? 1.8 : 1.0) * s * s;
      const p = start.clone().addScaledVector(dirH, Math.cos(elev) * s).add(V(0, rise, 0));
      pts.push(p);
    }
    for (let j = 0; j <= N; j++) tans.push(pts[Math.min(N, j + 1)].clone().sub(pts[Math.max(0, j - 1)]).normalize());
    const shade = tier === 2 ? 0.78 : tier === 0 ? 1.08 : 0.95;
    const stemTint = c.set(dead ? "#6e5c3c" : "#7d7a3e").clone();
    // stem (a thin ribbon facing up)
    for (let j = 0; j < N; j++) {
      const side = new THREE.Vector3().crossVectors(tans[j], V(0, 1, 0)).normalize().multiplyScalar(0.004 * (1 - j / N) + 0.0015);
      quad(pts[j].clone().sub(side), pts[j].clone().add(side), pts[j + 1].clone().add(side), pts[j + 1].clone().sub(side), stemTint);
    }
    // leaflets
    const nL = dead ? 11 : far === 2 ? 7 : far ? 9 : lite ? 20 : 26;
    for (let k = 2; k < nL; k++) {
      const t = k / nL, j = Math.min(N - 1, Math.floor(t * N)), fr = t * N - j;
      const base = pts[j].clone().lerp(pts[j + 1], fr), tan = tans[j];
      const sideV = new THREE.Vector3().crossVectors(tan, V(0, 1, 0)).normalize();
      const len = (0.16 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.7) + 0.02) * (dead ? 0.7 : 1);
      const w = (0.0075 + 0.004 * (1 - t)) * (dead ? 1.7 : far === 2 ? 4 : far ? 2.6 : lite ? 1.35 : 1);
      for (const sd of [-1, 1]) {
        const droop = dead ? 1.1 : tier === 0 ? 0.25 : tier === 1 ? 0.55 : 0.85;
        const dir = sideV.clone().multiplyScalar(sd * 0.72).addScaledVector(tan, 0.42).add(V(0, -droop * (0.4 + t * 0.6), 0)).normalize();
        const mid = base.clone().addScaledVector(dir, len * 0.55).add(V(0, -len * 0.12 * droop, 0));
        const tip = base.clone().addScaledVector(dir, len).add(V(0, -len * 0.3 * droop, 0));
        const across = new THREE.Vector3().crossVectors(dir, tan).normalize().multiplyScalar(w);
        // dead leaflets: the tint multiplies the green leaflet texture, so red is pushed up to land on straw brown
        const tint = dead ? c.setRGB(1.2 + r() * 0.3, 0.66 + r() * 0.12, 0.85 + r() * 0.2).clone()
          : c.setHSL((far ? 0.22 : style.hue) + (r() - 0.5) * 0.03, 0.42 + r() * 0.12, (0.3 + r() * 0.08) * shade * (far ? 1 : style.light)).clone();
        if (far || dead || lite) {   // far palms (and near ones on GFX LOW): one straight card per leaflet (the bend at mid-length cannot be seen from 160 m away); half the crown's triangles
          quad(base.clone().addScaledVector(across, -0.7), base.clone().addScaledVector(across, 0.7), tip.clone().addScaledVector(across, 0.6), tip.clone().addScaledVector(across, -0.6), tint);
          continue;
        }
        quad(base.clone().sub(across.clone().multiplyScalar(0.4)), base.clone().add(across.clone().multiplyScalar(0.4)),
             mid.clone().add(across), mid.clone().sub(across), tint);
        quad(mid.clone().sub(across), mid.clone().add(across), tip.clone().addScaledVector(across, 0.15), tip.clone().addScaledVector(across, -0.15), tint);
      }
    }
  }
  // near palms only: the boot, two staggered rings of old leaf bases flaring up and out where the trunk meets the crown
  if (!far && !low) for (let ring = 0; ring < 2; ring++) for (let b = 0; b < 8; b++) {
    const az = (b + ring * 0.5) / 8 * Math.PI * 2 + r() * 0.2, y0 = 0.865 + ring * 0.05, y1 = y0 + 0.1 + r() * 0.02;
    const dir = V(Math.cos(az), 0, Math.sin(az)), across = V(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(0.011);
    const base = V(0.035 * y0 * y0, y0, 0).addScaledVector(dir, 0.013), tip = V(0.035 * y1 * y1, y1, 0).addScaledVector(dir, 0.036 + r() * 0.008);
    const k = 0.8 + r() * 0.35;
    quad(base.clone().addScaledVector(across, -0.6), base.clone().addScaledVector(across, 0.6), tip.clone().add(across), tip.clone().sub(across), c.setRGB(1.15 * k, 0.7 * k, 0.9 * k).clone());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.translate(-top.x, -top.y, -top.z);   // origin at the top of the trunk: each palm places and sizes its crown there
  return g;
}

function palmTrunkGeo(far = 0, low = false) {
  // GFX LOW near the hole: 8 sides and 10 rings (160 triangles, was 480); the lean and the swollen base are the same
  const g = new THREE.CylinderGeometry(0.016, 0.03, 1, far === 2 ? 5 : far ? 6 : low ? 8 : 12, far === 2 ? 3 : far ? 5 : low ? 10 : 20, true);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position, uvA = g.attributes.uv;
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k);
    const flare = 1 + 0.6 * Math.pow(Math.max(0, 0.08 - y) / 0.08, 2);     // swollen base
    p.setX(k, p.getX(k) * flare + 0.035 * y * y);
    p.setZ(k, p.getZ(k) * flare);
    uvA.setY(k, y * 6);
  }
  g.computeVertexNormals();
  return g;
}

// ── Buildings: real roof shapes from the LiDAR ─────────────────────────────────────────────
// Each building carries its roof outline, its wall line (inside the eaves) and a 1 m grid of roof
// heights laid out in the building's own direction. The roof is that height field cut to the
// outline; the walls drop from the roof to the ground along the wall line.
// stucco colours of the community (ochre/butter yellow, cream, tan, white), as in the listing photos
const WALLS = ["#e8c877", "#f1ead9", "#dfc48f", "#f6f2e8", "#e6bf68"];
const GLASS = new THREE.Color("#2b3d4b"), FRAME = new THREE.Color("#f3f1ea"), DOOR = new THREE.Color("#6a4a33"), RAIL = new THREE.Color("#f2f0e9"), SLAB = new THREE.Color("#cfc9ba"), TRIM = new THREE.Color("#ebe5d4");
const b64bytes = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
function insidePoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Sutherland–Hodgman: the part of a polygon inside an axis-aligned cell
function clipToCell(poly, x0, y0, x1, y1) {
  const pass = (pts, ax, lim, keepGreater) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = keepGreater ? a[ax] >= lim : a[ax] <= lim, ib = keepGreater ? b[ax] >= lim : b[ax] <= lim;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (lim - a[ax]) / (b[ax] - a[ax]), q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; q[ax] = lim; out.push(q); }
    }
    return out;
  };
  let out = pass(poly, 0, x0, true);
  if (out.length) out = pass(out, 0, x1, false);
  if (out.length) out = pass(out, 1, y0, true);
  if (out.length) out = pass(out, 1, y1, false);
  return out.filter((q, i) => { const r = out[(i + 1) % out.length]; return Math.abs(q[0] - r[0]) > 1e-6 || Math.abs(q[1] - r[1]) > 1e-6; });
}
const TILE_ROOF = [new THREE.Color("#a9533a"), new THREE.Color("#bd6446")], FLAT_ROOF = new THREE.Color("#cfc9bd");
function buildingsGeometry(buildings, toLocal, exaggeration) {
  const pos = [], col = [], tmpGlass = new THREE.Color();
  const tri = (a, b, c, k) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b); };
  buildings.forEach(f => {
    const g = f.properties.g;
    if (!g) return;
    const [ax, az] = toLocal(g.lng, g.lat), ct = Math.cos(g.th), st = Math.sin(g.th), W = g.w, H = g.h, step = g.step;
    const bytes = b64bytes(g.d), base = (f.properties.z || 0) * exaggeration;
    const hNode = (i, j) => g.min + g.sc * bytes[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
    const hAt = (u, v) => {                                 // roof height above the ground at grid position (u, v)
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      return (hNode(i, j) * (1 - fu) + hNode(i + 1, j) * fu) * (1 - fv) + (hNode(i, j + 1) * (1 - fu) + hNode(i + 1, j + 1) * fu) * fv;
    };
    const toGrid = ([lng, lat]) => { const [x, z] = toLocal(lng, lat), e = x - ax, n = -(z - az); return [(e * ct + n * st) / step, (-e * st + n * ct) / step]; };
    const world = (u, v, y) => { const e = (u * ct - v * st) * step, n = (u * st + v * ct) * step; return [ax + e, base + y, az - n]; };
    const roofC = new THREE.Color(f.properties.roof || "#9a8f86");
    const wallC = new THREE.Color(WALLS[f.properties.c % WALLS.length]);
    const ring = f.geometry.coordinates[0].slice(0, -1).map(toGrid);
    // roof
    const inside = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) inside[j * W + i] = insidePoly(i, j, ring) ? 1 : 0;
    const hasVertex = new Set(ring.map(([u, v]) => Math.floor(v) * W + Math.floor(u)));
    const P = (u, v) => world(u, v, hAt(u, v));
    // clay-tile roofs (clubhouse): terracotta on the sloped parts, in courses running across the slope;
    // the low-slope parts (flat deck with its air-handlers) stay a pale membrane
    const tiled = !!f.properties.tile;
    const roofAt = (i, j) => {
      if (!tiled) return roofC;
      const sl = (a, b) => Math.max(Math.abs(hNode(a + 1, b) - hNode(a, b)), Math.abs(hNode(a, b + 1) - hNode(a, b)));
      let flat = true;                                       // flat only where the whole neighbourhood is: ridges and hips are not
      for (let dj2 = -2; dj2 <= 2 && flat; dj2++) for (let di2 = -2; di2 <= 2; di2++) if (sl(i + di2, j + dj2) > 0.12 * step) { flat = false; break; }
      if (flat) return FLAT_ROOF;
      const di = hNode(i + 1, j) - hNode(i, j), dj = hNode(i, j + 1) - hNode(i, j);
      const k = ((Math.abs(di) > Math.abs(dj) ? i : j) & 1) ? 0.96 : 1.03;
      return TILE_ROOF[k > 1 ? 1 : 0];
    };
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      const roofK = roofAt(i, j);
      const n = inside[j * W + i] + inside[j * W + i + 1] + inside[(j + 1) * W + i] + inside[(j + 1) * W + i + 1];
      const cut = hasVertex.has(j * W + i);
      if (n === 0 && !cut) continue;
      if (n === 4 && !cut) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        // split along the diagonal that bends least, so hips and valleys stay sharp
        if (Math.abs(a[1] - c[1]) <= Math.abs(b[1] - d[1])) { tri(a, b, c, roofK); tri(a, c, d, roofK); } else { tri(a, b, d, roofK); tri(b, c, d, roofK); }
        continue;
      }
      const piece = clipToCell(ring, i, j, i + 1, j + 1);
      if (piece.length < 3) continue;
      const pts = piece.map(([u, v]) => new THREE.Vector2(u, v));
      THREE.ShapeUtils.triangulateShape(pts, []).forEach(([a, b, c]) => tri(P(pts[a].x, pts[a].y), P(pts[b].x, pts[b].y), P(pts[c].x, pts[c].y), roofK));
    }
    // walls, from just below the ground up to the underside of the roof
    const wr = (f.properties.wr || f.geometry.coordinates[0]).map(toGrid);
    const shade = wallC.clone().multiplyScalar(0.9);
    for (let i = 0; i < wr.length - 1; i++) {
      const [u1, v1] = wr[i], [u2, v2] = wr[i + 1], len = Math.hypot(u2 - u1, v2 - v1) * step, parts = Math.max(1, Math.ceil(len));
      const k = Math.abs(u2 - u1) > Math.abs(v2 - v1) ? wallC : shade;
      // The wall top follows the roof, sampled every metre. Where the roof runs straight over several metres (to within
      // 1 cm) those metres are drawn as ONE panel: the same flat wall, same colour, far fewer triangles.
      const at = q => [u1 + (u2 - u1) * q / parts, v1 + (v2 - v1) * q / parts];
      const top = [];
      for (let q = 0; q <= parts; q++) { const [u, v] = at(q); top.push(hAt(u, v) - 0.03); }
      for (let q = 0; q < parts;) {
        let e = q + 1;
        grow: while (e < parts) {
          for (let m = q + 1; m <= e; m++) if (Math.abs(top[q] + (top[e + 1] - top[q]) * (m - q) / (e + 1 - q) - top[m]) > 0.01) break grow;
          e++;
        }
        const [ua, va] = at(q), [ub, vb] = at(e);
        const a0 = world(ua, va, -1), b0 = world(ub, vb, -1), a1 = world(ua, va, top[q]), b1 = world(ub, vb, top[e]);
        tri(a0, b0, b1, k); tri(a0, b1, a1, k);
        q = e;
      }
    }
    // facade: two-storey stucco with windows. Walls facing the nearest road/lot get the front door and
    // modest windows; the opposite walls (golf course / lawn side) get big sliding windows and an upper
    // balcony rail; end walls get a few small windows.
    const fd = f.properties.fd;
    let area = 0;
    for (let i = 0; i < wr.length - 1; i++) { const a = world(wr[i][0], wr[i][1], 0), b = world(wr[i + 1][0], wr[i + 1][1], 0); area += a[0] * b[2] - b[0] * a[2]; }
    const sgn = area >= 0 ? 1 : -1;
    for (let i = 0; i < wr.length - 1; i++) {
      const [ua, va] = wr[i], [ub, vb] = wr[i + 1];
      const a = world(ua, va, 0), b = world(ub, vb, 0), dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
      if (len < 2.6) continue;
      const eave = Math.min(hAt(ua, va), hAt(ub, vb)) - 0.25;
      if (eave < 1.3) continue;
      const tx = dx / len, tz = dz / len, nx = sgn * tz, nz = -sgn * tx;
      const dot = fd ? nx * fd[0] + (-nz) * fd[1] : 0;
      const kind = !fd ? "side" : dot > 0.55 ? "front" : dot < -0.55 ? "back" : "side";
      const floors = eave >= 5.2 ? 2 : 1, base = a[1];
      // a flat rectangle on the wall: centre distance s along it, floor-relative heights y0..y1, pushed out by off
      const rect = (s, y0, y1, w, k, off) => {
        const cx = a[0] + tx * s + nx * off, cz = a[2] + tz * s + nz * off, h = w / 2;
        const p0 = [cx - tx * h, base + y0, cz - tz * h], p1 = [cx + tx * h, base + y0, cz + tz * h], p2 = [cx + tx * h, base + y1, cz + tz * h], p3 = [cx - tx * h, base + y1, cz - tz * h];
        tri(p0, p1, p2, k); tri(p0, p2, p3, k);
      };
      const win = (s, y0, w, h0, seed) => {
        const top = floors === 2 && y0 < 3 ? 2.85 : eave - 0.2;       // keep it under the eave; low walls get proportionally smaller windows
        let h = h0;
        if (top - y0 < h0 + 0.1) { h = Math.min(h0, Math.max(0.4, (top - (floors === 2 && y0 > 3 ? 2.95 : 0)) * 0.55)); y0 = (floors === 2 && y0 > 3 ? 2.95 : 0) + (top - (floors === 2 && y0 > 3 ? 2.95 : 0) - h) * 0.45; }
        if (h < 0.4) return;
        rect(s, y0 - 0.1, y0 + h + 0.1, w + 0.2, FRAME, 0.13);
        const j = 0.82 + 0.3 * hash3(s, y0, seed);
        rect(s, y0, y0 + h, w, tmpGlass.copy(GLASS).multiplyScalar(j), 0.2);
      };
      const sp = kind === "front" ? 3.4 : kind === "back" ? 4.4 : 5.8, usable = len - 1.2, n = Math.max(1, Math.floor(usable / sp));
      const door = kind === "front" ? Math.floor(n / 2) : -1;
      for (let k = 0; k < n; k++) {
        const s = 0.6 + (k + 0.5) * usable / n;
        for (let fl = 0; fl < floors; fl++) {
          const fy = fl === 0 ? 0 : 2.95;
          if (kind === "front") {
            if (fl === 0 && k === door) { rect(s, 0, 2.2, 1.35, FRAME, 0.13); rect(s, 0, 2.1, 1.1, DOOR, 0.2); continue; }
            win(s, fy + 0.95, 1.15, 1.25, k * 3 + fl);
          } else if (kind === "back") win(s, fy + 0.15, 2.1, 1.95, k * 5 + fl);
          else win(s, fy + 1.0, 0.95, 1.2, k * 7 + fl);
        }
      }
      if (floors === 2) {
        rect(len / 2, 2.8, 3.1, len - 0.2, TRIM, 0.1);                        // floor band
        if (kind === "back") {                                                 // balcony: slab + rail along the upper floor
          const L = len - 1.0, m0 = [a[0] + tx * (len - L) / 2, base + 3.0, a[2] + tz * (len - L) / 2], m1 = [m0[0] + tx * L, m0[1], m0[2] + tz * L];
          const o0 = [m0[0] + nx * 0.55, m0[1], m0[2] + nz * 0.55], o1 = [m1[0] + nx * 0.55, m1[1], m1[2] + nz * 0.55];
          tri(m0, m1, o1, SLAB); tri(m0, o1, o0, SLAB);
          const r0 = [o0[0], o0[1] + 0.95, o0[2]], r1 = [o1[0], o1[1] + 0.95, o1[2]];
          tri(o0, o1, r1, RAIL); tri(o0, r1, r0, RAIL);
        }
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// Cart bridges: a plank deck with rails, at the deck height the LiDAR measured
function bridgesGeometry(bridges, toLocal, exaggeration) {
  const geos = [];
  bridges.forEach(f => {
    const r = f.geometry.coordinates[0].slice(0, 4).map(([lng, lat]) => toLocal(lng, lat)), y = (f.properties.z || 0) * exaggeration;
    const d01 = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]), d12 = Math.hypot(r[2][0] - r[1][0], r[2][1] - r[1][1]);
    const dock = !!f.properties.dock;     // private docks: the traced length and width, planks on piles, no rails
    const long = d01 >= d12, L = Math.max(d01, d12) + (dock ? 0 : 3), Wd = dock ? Math.min(d01, d12) : Math.max(2.6, Math.min(d01, d12));
    const cx = (r[0][0] + r[2][0]) / 2, cz = (r[0][1] + r[2][1]) / 2;
    const a = long ? Math.atan2(r[1][1] - r[0][1], r[1][0] - r[0][0]) : Math.atan2(r[2][1] - r[1][1], r[2][0] - r[1][0]);
    const box = (w, h, d, ox, oy, oz, hex) => {
      const b = new THREE.BoxGeometry(w, h, d).toNonIndexed(); b.translate(ox, oy, oz); b.rotateY(-a); b.translate(cx, y, cz);
      const k = color(hex), c = new Float32Array(b.attributes.position.count * 3);
      for (let i = 0; i < c.length; i += 3) { c[i] = k.r; c[i + 1] = k.g; c[i + 2] = k.b; }
      b.setAttribute("color", new THREE.BufferAttribute(c, 3)); b.deleteAttribute("uv");
      geos.push(b);
    };
    if (dock) {
      box(L, 0.16, Wd, 0, -0.08, 0, "#a08a6a");                                  // weathered plank deck
      const n = Math.max(1, Math.round(L / 3.2));
      for (const side of [-1, 1]) for (let q = 0; q <= n; q++) box(0.22, 4.1, 0.22, -L / 2 + q * L / n, -1.6, side * (Wd / 2 + 0.06), "#5f5140");   // piles: 0.45 m above the deck, down into the water
      return;
    }
    box(L, 0.3, Wd, 0, -0.15, 0, "#9a7b55");                                     // deck
    for (const side of [-1, 1]) {
      box(L, 0.1, 0.12, 0, 1.0, side * (Wd / 2 - 0.06), "#7d6242");              // top rail
      box(L, 0.07, 0.08, 0, 0.55, side * (Wd / 2 - 0.06), "#7d6242");            // mid rail
      for (let q = 0; q <= Math.round(L / 2); q++) box(0.12, 1.5, 0.12, -L / 2 + q * L / Math.round(L / 2), 0.3, side * (Wd / 2 - 0.06), "#6d5538");
    }
  });
  if (!geos.length) return null;
  const pos = [], col = [], nor = [];
  geos.forEach(b => { pos.push(...b.attributes.position.array); col.push(...b.attributes.color.array); nor.push(...b.attributes.normal.array); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

export function createRealisticLayer(course, exaggeration = 1, pin = null, onPin = null, id = "real3d", low = false, focus = null, tees = null) {
  const trees = course.features.filter(f => f.properties.kind === "tree");
  const buildings = course.features.filter(f => f.properties.kind === "building");
  const allPts = trees.map(f => f.geometry.coordinates);
  const lng0 = allPts.reduce((a, p) => a + p[0], 0) / Math.max(allPts.length, 1);
  const lat0 = allPts.reduce((a, p) => a + p[1], 0) / Math.max(allPts.length, 1);
  const k = Math.cos(lat0 * Math.PI / 180);
  const toLocal = (lng, lat) => [(lng - lng0) * M * k, -(lat - lat0) * M];   // x east, z south (meters)
  const origin = maplibregl.MercatorCoordinate.fromLngLat([lng0, lat0], 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const model = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z)
    .scale(new THREE.Vector3(s, -s, s))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

  let renderer, scene, camera, map, flagMesh = null, flagBase = null;
  return {
    id, type: "custom", renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      // Sun from the south-southeast (shadows fall north, as in the photos) plus sky fill
      scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x55703a, 1.15));
      const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
      sun.position.set(140, 420, 330);
      sun.target.position.set(0, 0, 0);
      scene.add(sun, sun.target);

      const dummy = new THREE.Object3D(), tmpColor = new THREE.Color(), tmpVec = new THREE.Vector3();
      const oaks = trees.filter(f => f.properties.type !== "palm"), palms = trees.filter(f => f.properties.type === "palm");

      // Detail where the player is: trees within NEAR metres of this hole's tee-to-green line are drawn in full
      // detail; the rest of the property (the same trees, seen from far away or not at all) in a light version.
      // Drawing every tree on the property at full detail was ~8.7 million triangles a frame.
      const NEAR = 160, FAR2 = 320;
      const fa = focus && toLocal(...focus[0]), fb = focus && toLocal(...focus[1]);
      const distXZ = (x, z) => {   // metres from the hole's tee-to-green line (0 when no hole is in focus)
        if (!focus) return 0;
        const dx = fb[0] - fa[0], dz = fb[1] - fa[1];
        const t = Math.max(0, Math.min(1, ((x - fa[0]) * dx + (z - fa[1]) * dz) / (dx * dx + dz * dz || 1)));
        return Math.hypot(x - fa[0] - t * dx, z - fa[1] - t * dz);
      };
      const nearXZ = (x, z) => distXZ(x, z) <= NEAR;
      const isNear = f => nearXZ(...toLocal(...f.geometry.coordinates));
      const isVeryFar = f => distXZ(...toLocal(...f.geometry.coordinates)) > FAR2;

      // Oaks: ez-tree shapes, instanced; each scaled to the tree's measured canopy
      const leafMat = new THREE.MeshStandardMaterial({ map: getLeafTexture("oak"), color: 0xc4d4a8, alphaTest: 0.5,
        side: THREE.DoubleSide, roughness: 0.92 });
      const placeOaks = (list, variants) => variants.forEach((V, v) => {
        const mine = list.filter((_, i) => i % variants.length === v);
        if (!mine.length) return;
        const branches = new THREE.InstancedMesh(V.bGeo, V.barkMat, mine.length);
        const leaves = new THREE.InstancedMesh(V.lGeo, leafMat, mine.length);
        mine.forEach((f, i) => {
          const [x, z] = toLocal(...f.geometry.coordinates), { r, h } = f.properties, y0 = (f.properties.z || 0) * exaggeration;
          const s = (r * 1.1) / V.radius, sy = Math.min(s, Math.max(h * 1.35, 7) / V.height);
          dummy.position.set(x, y0 - 0.2, z);
          dummy.rotation.set(0, hash3(x, z, v) * Math.PI * 2, 0);
          dummy.scale.set(s, sy, s);
          dummy.updateMatrix();
          branches.setMatrixAt(i, dummy.matrix);
          leaves.setMatrixAt(i, dummy.matrix);
          const k = 0.86 + hash3(z, x, 1) * 0.26;
          tmpColor.setRGB(k * (0.92 + hash3(x, 3, z) * 0.1), k, k * (0.85 + hash3(5, z, x) * 0.1));
          leaves.setColorAt(i, tmpColor);
        });
        for (const m of [branches, leaves]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
      });
      const nearOaks = oaks.filter(isNear), farOaks = oaks.filter(f => !isNear(f) && !isVeryFar(f)), veryFarOaks = oaks.filter(isVeryFar);
      if (nearOaks.length) placeOaks(nearOaks, oakVariants(low));
      if (farOaks.length) placeOaks(farOaks, oakVariants(low, 1));
      if (veryFarOaks.length) placeOaks(veryFarOaks, oakVariants(low, 2));

      // Palms: ringed trunk + crown of fronds with individual leaflets (scaled by height)
      const trunkMat = new THREE.MeshStandardMaterial({ map: trunkTexture(), roughness: 1 });
      const leafletMat = new THREE.MeshStandardMaterial({ map: leafletTexture(), vertexColors: true, alphaTest: 0.4,
        side: THREE.DoubleSide, roughness: 0.75 });
      const placePalms = (list, far) => {
        if (!list.length) return;
        const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo(far, low), trunkMat, list.length);
        // near the hole: five crown shapes (GFX LOW: three of them); far away: two copies of the plain one
        const crownGeos = far ? [0, 1].map(v => palmCrown(11 + v * 29, far)) : PALM_STYLES.slice(0, low ? 3 : 5).map((st, v) => palmCrown(11 + v * 29, 0, low, st));
        const nv = crownGeos.length;
        const pick = f => { const [x, z] = toLocal(...f.geometry.coordinates); return Math.min(nv - 1, Math.floor(hash3(x, z, 11) * nv)); };
        const counts = crownGeos.map(() => 0);
        list.forEach(f => counts[pick(f)]++);
        const crowns = crownGeos.map((g, v) => new THREE.InstancedMesh(g, leafletMat, Math.max(1, counts[v])));
        counts.fill(0);
        list.forEach((f, i) => {
          const [x, z] = toLocal(...f.geometry.coordinates), y0 = (f.properties.z || 0) * exaggeration, v = pick(f);
          // Size. 869 of the 1,070 palms carry one of three default heights (7.0, 7.8, 8.6 m: found on the photo, never
          // measured), which made every palm the same. Those are spread over about 0.72-1.3x (5 to 11 m); palms whose height
          // was read off their shadow keep it to within 4%. Crown width and trunk thickness vary per palm as well.
          const h0 = f.properties.h, guessed = [7, 7.8, 8.6].some(q => Math.abs(h0 - q) < 0.01);
          const h = h0 * (guessed ? 0.72 + 0.58 * hash3(z, x, 2) : 0.96 + 0.08 * hash3(z, x, 2));
          const thick = (0.82 + 0.5 * hash3(x, z, 12)) * Math.sqrt(h0 / h);        // slim to stout; a short palm is not a thin one
          const crown = h0 * (0.7 + 0.6 * hash3(x, z, 13));
          // some palms stand straight, some lean up to about 7 degrees; the crown sits on the end of the trunk wherever that is
          const a = hash3(x, z, 7) * Math.PI * 2, tilt = (hash3(z, 19, x) - 0.35) * 0.19;
          dummy.position.set(x, y0 - 0.2, z);
          dummy.rotation.set(0, a, tilt);
          dummy.scale.set(h0 * thick, h, h0 * thick);
          dummy.updateMatrix();
          palmTrunks.setMatrixAt(i, dummy.matrix);
          const topAt = tmpVec.set(0.035, 1, 0).applyMatrix4(dummy.matrix);
          const kt = 0.82 + 0.3 * hash3(z, 14, x);
          palmTrunks.setColorAt(i, tmpColor.setRGB(kt, kt * (0.96 + 0.06 * hash3(x, 15, z)), kt * 0.94));
          dummy.position.copy(topAt);
          dummy.rotation.set(0, a, tilt * 0.5);
          dummy.scale.setScalar(crown);
          dummy.updateMatrix();
          crowns[v].setMatrixAt(counts[v], dummy.matrix);
          const kc = 0.78 + 0.42 * hash3(z, x, 16);                                  // some crowns lighter, some darker, a little warmer or cooler
          crowns[v].setColorAt(counts[v]++, tmpColor.setRGB(kc * (0.94 + 0.14 * hash3(x, 17, z)), kc, kc * (0.88 + 0.16 * hash3(z, 18, x))));
        });
        crowns.forEach((c, v) => { c.count = counts[v]; c.castShadow = true; c.receiveShadow = true; c.frustumCulled = false; scene.add(c); });
        palmTrunks.castShadow = true; palmTrunks.frustumCulled = false;
        scene.add(palmTrunks);
      };
      placePalms(palms.filter(isNear), 0);
      placePalms(palms.filter(f => !isNear(f) && !isVeryFar(f)), 1);
      // palms more than FAR2 from the hole's line: 7 fronds of 10 wide leaflets (182 triangles, was 380) on a 30-triangle trunk (was 60)
      placePalms(palms.filter(isVeryFar), 2);

      // Hedges: thick shrub rows traced by hand (e.g. behind back yards), a solid leafy wall from
      // the ground up, so only the roofs of the houses behind them show
      const hedges = course.features.filter(f => f.properties.kind === "hedge");
      if (hedges.length) {
        // long runs (the perimeter border is ~2 km): coarser blobs, wider spacing, to keep the triangle count down
        const hedgeLen = hedges.reduce((a, f) => { const c = f.geometry.coordinates; let l = 0; for (let j = 0; j < c.length - 1; j++) l += Math.hypot((c[j + 1][0] - c[j][0]) * 99500, (c[j + 1][1] - c[j][1]) * 111320); return a + l; }, 0);
        const longRun = hedges.length && hedgeLen > 600;
        const spacing = longRun ? 2.4 : 1.3;
        const blob = detail => {
          const geo = new THREE.IcosahedronGeometry(1, detail), p = geo.attributes.position, nrm = geo.attributes.normal, col = [];
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 0.88 + hash3(x * 4.3, y * 4.3, z * 4.3) * 0.24;
            p.setXYZ(i, x * n, y * n, z * n);
            nrm.setXYZ(i, x, y, z);   // smooth, rounded shading (the lumps stay in the outline)
            const c = (0.62 + 0.38 * (y + 1) / 2) * (0.85 + hash3(z * 5, x * 5, y * 5) * 0.3);
            col.push(0.36 * c, 0.55 * c, 0.24 * c);
          }
          geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
          return geo;
        };
        const pts = [];
        hedges.forEach(f => {
          const cs = f.geometry.coordinates.map(c => toLocal(...c)), zs = f.properties.zs || [], { h, w } = f.properties;
          for (let j = 0; j < cs.length - 1; j++) {
            const [ax, az] = cs[j], [bx, bz] = cs[j + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / spacing));
            for (let s = 0; s < n; s++) {
              const t = s / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
              pts.push({ x, z, y0: ((zs[j] || 0) * (1 - t) + (zs[j + 1] || 0) * t) * exaggeration, h, w });
            }
          }
        });
        // hedge blobs away from the hole being played: same size, place and colour, a coarser ball (80 triangles, not 180/320)
        const hedgeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
        [pts.filter(q => nearXZ(q.x, q.z)), pts.filter(q => !nearXZ(q.x, q.z))].forEach((list, far) => {
        if (!list.length) return;
        const hedgeMesh = new THREE.InstancedMesh(blob(far ? 1 : longRun ? 2 : 3), hedgeMat, list.length);
        list.forEach(({ x, z, y0, h, w }, i) => {
          const jx = (hash3(x, z, 3) - 0.5) * 0.8, jz = (hash3(z, x, 4) - 0.5) * 0.8, hh = h * (0.9 + hash3(x, 9, z) * 0.2);
          dummy.position.set(x + jx, y0 + hh / 2 - 0.15, z + jz);
          dummy.rotation.set(0, hash3(x, z, 5) * Math.PI * 2, 0);
          dummy.scale.set(w / 2 * (0.9 + hash3(z, 2, x) * 0.25), hh / 2, w / 2 * (0.9 + hash3(2, x, z) * 0.25));
          dummy.updateMatrix();
          hedgeMesh.setMatrixAt(i, dummy.matrix);
        });
        hedgeMesh.castShadow = hedgeMesh.receiveShadow = true; hedgeMesh.frustumCulled = false;
        scene.add(hedgeMesh);
        });
      }

      // Practice-range nets: tall poles every ~12 m and a dark, see-through netting between them
      const nets = course.features.filter(f => f.properties.kind === "net");
      if (nets.length) {
        const poleG = new THREE.CylinderGeometry(0.11, 0.14, 1, 6), poleM = new THREE.MeshStandardMaterial({ color: 0x23201c, roughness: 0.8 });
        const sheets = new Map(), poles = [];                 // netting per colour/opacity (range nets dark, tennis nets white, fences green)
        nets.forEach(f => {
          const p = f.properties, key = `${p.color || "#1c2a22"}|${p.op ?? 0.38}`;
          if (!sheets.has(key)) sheets.set(key, []);
          const netPos = sheets.get(key), sp = p.sp || 12;
          const cs = f.geometry.coordinates.map(c => toLocal(...c)), zs = p.zs || [], h = p.h, tall = h > 2;
          for (let j = 0; j < cs.length - 1; j++) {
            const [ax, az] = cs[j], [bx, bz] = cs[j + 1], ya = (zs[j] || 0) * exaggeration, yb = (zs[j + 1] || 0) * exaggeration;
            const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / sp));
            for (let q = 0; q <= n; q++) {
              const t = q / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ya + (yb - ya) * t;
              if (q < n || j === cs.length - 2) poles.push({ x, y, z, h: h + (tall ? 0 : 0.1) });
              if (q < n) {
                const t2 = (q + 1) / n, x2 = ax + (bx - ax) * t2, z2 = az + (bz - az) * t2, y2 = ya + (yb - ya) * t2;
                const y0 = tall && h < 4 ? 0 : 0;               // fences and nets stand on the ground
                netPos.push(x, y + y0, z, x2, y2 + y0, z2, x2, y2 + h, z2, x, y + y0, z, x2, y2 + h, z2, x, y + h, z);
              }
            }
          }
        });
        sheets.forEach((pos, key) => {
          const [col, op] = key.split("|"), ng = new THREE.BufferGeometry();
          ng.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); ng.computeVertexNormals();
          const m = new THREE.Mesh(ng, new THREE.MeshBasicMaterial({ color: new THREE.Color(col), transparent: true, opacity: +op, side: THREE.DoubleSide, depthWrite: false }));
          m.frustumCulled = false; scene.add(m);
        });
        const poleMesh = new THREE.InstancedMesh(poleG, poleM, poles.length);
        poles.forEach(({ x, y, z, h }, i) => { dummy.position.set(x, y + h / 2, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(h < 1.5 ? 0.45 : 1, h, h < 1.5 ? 0.45 : 1); dummy.updateMatrix(); poleMesh.setMatrixAt(i, dummy.matrix); });
        poleMesh.castShadow = true; poleMesh.frustumCulled = false; scene.add(poleMesh);
      }

      // Flagstick on the green, at the green's measured height (2.1 m white pole, red flag,
      // white cup liner), so it stands on the surface in every view
      if (pin) {
        const [px, pz] = toLocal(pin.lng, pin.lat), py = pin.z || 0;
        const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.13, 20), white);
        pole.position.set(px, py + 2.13 / 2, pz);
        // White flag with the hole number on both sides; its cloth ripples in the wind (render())
        const flagTex = (() => {
          const cv = document.createElement("canvas"); cv.width = 512; cv.height = 352;   // 2x texels (was 256x176) so the hole number stays sharp up close
          const x = cv.getContext("2d"); x.scale(2, 2);
          x.fillStyle = "#fbfbf8"; x.fillRect(0, 0, 256, 176);
          x.fillStyle = "#0f3b22"; x.font = "900 128px Inter, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
          x.fillText(String(pin.number ?? ""), 128, 96);
          const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
          return t;
        })();
        const flagGeo = new THREE.PlaneGeometry(0.72, 0.5, 16, 6);
        flagGeo.translate(0.36, 0, 0);
        flagBase = Float32Array.from(flagGeo.attributes.position.array);
        const backGeo = new THREE.BufferGeometry();
        backGeo.setAttribute("position", flagGeo.attributes.position);          // shares the moving cloth
        backGeo.setAttribute("normal", flagGeo.attributes.normal);
        backGeo.setIndex(flagGeo.index);
        const uvs = Float32Array.from(flagGeo.attributes.uv.array);
        for (let k = 0; k < uvs.length; k += 2) uvs[k] = 1 - uvs[k];            // number reads correctly from behind
        backGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        const clothMat = { map: flagTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: flagTex, emissiveIntensity: 0.45 };
        flagMesh = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ ...clothMat, side: THREE.FrontSide }));
        const flagBack = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ ...clothMat, side: THREE.BackSide }));
        const flag = new THREE.Group(); flag.add(flagMesh, flagBack);
        flag.position.set(px + 0.016, py + 2.13 - 0.27, pz);
        flag.rotation.y = -0.4;
        const cup = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.054, 20), white);
        cup.rotation.x = -Math.PI / 2;
        cup.position.set(px, py + 0.02, pz);
        for (const m of [pole, flag, cup]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
      }

      // Tee markers: a pair of small coloured balls for each tee colour, one either side of the tee point and
      // square to the line of play, kept on the traced tee top. Only the hole being played (about 1,800 triangles).
      if (tees?.length) {
        const tops = course.features.filter(f => f.properties.kind === "tee" && f.geometry.type === "Polygon")
          .map(f => f.geometry.coordinates[0].map(p => toLocal(...p)));
        const R = 0.11, ballG = new THREE.SphereGeometry(R, 16, 10);
        // a small soft-dark patch on the turf just north of each ball (the sun is in the south), so it sits on the ground
        const padG = new THREE.CircleGeometry(R * 1.25, 14).rotateX(-Math.PI / 2);
        const padM = new THREE.MeshBasicMaterial({ color: 0x0c2212, transparent: true, opacity: 0.34, depthWrite: false });
        for (const t of tees) {
          const [tx, tz] = toLocal(t.lng, t.lat), [ax, az] = toLocal(...t.aim);
          const L = Math.hypot(ax - tx, az - tz) || 1, nx = -(az - tz) / L, nz = (ax - tx) / L;   // across the line of play
          const top = tops.find(p => insidePoly(tx, tz, p));
          let half = 2.3;                                    // markers 4.6 m apart, closer on a narrow tee
          if (top) while (half > 0.8 && !(insidePoly(tx + nx * (half + 0.5), tz + nz * (half + 0.5), top) && insidePoly(tx - nx * (half + 0.5), tz - nz * (half + 0.5), top))) half -= 0.1;
          else half = 1.5;
          const mat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.35, emissive: t.color, emissiveIntensity: 0.18 });
          for (const sgn of [-1, 1]) {
            const ball = new THREE.Mesh(ballG, mat);
            ball.position.set(tx + sgn * nx * half, (t.z || 0) + R * 0.9, tz + sgn * nz * half);
            ball.castShadow = true; ball.frustumCulled = false; scene.add(ball);
            const pad = new THREE.Mesh(padG, padM);
            pad.position.set(ball.position.x - 0.03, (t.z || 0) + 0.015, ball.position.z - 0.07);
            pad.frustumCulled = false; scene.add(pad);
          }
        }
      }

      // Houses
      const houses = new THREE.Mesh(buildingsGeometry(buildings, toLocal, exaggeration), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide }));
      houses.castShadow = houses.receiveShadow = true;
      houses.frustumCulled = false;
      scene.add(houses);
      const bridgeGeo = bridgesGeometry(course.features.filter(f => f.properties.kind === "bridge"), toLocal, exaggeration);
      if (bridgeGeo) {
        const bridges = new THREE.Mesh(bridgeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
        bridges.castShadow = bridges.receiveShadow = true; bridges.frustumCulled = false;
        scene.add(bridges);
      }

      // Shadow area: everything we placed (ground shadows are drawn by the map, draped on the terrain)
      const box = new THREE.Box3().setFromObject(houses);
      allPts.forEach(p => { const [x, z] = toLocal(...p); box.expandByPoint(new THREE.Vector3(x, 0, z)); });
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());

      const ext = Math.max(size.x, size.z) / 2 + 60;
      sun.position.set(mid.x + 140, 420, mid.z + 330);
      sun.target.position.copy(mid);
      Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 10, far: 1400 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.mapSize.set(4096, 4096);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.4;
      sun.shadow.radius = 3;
      sun.castShadow = !low;   // Low graphics: no shadows

      // Triangle budget check for the graphics runs (GRAPHICS.md): total and the heaviest meshes, computed once
      { let tot = 0; const st = []; scene.traverse(o => { if (!o.isMesh) return; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3, inst = o.isInstancedMesh ? o.count : 1; tot += n * inst; st.push([Math.round(n * inst), Math.round(n), inst]); }); st.sort((x, y) => y[0] - x[0]); window.__mggSceneStats = { triangles: Math.round(tot), meshes: st.slice(0, 12) }; }
      window.__mggMap = map;   // same purpose: lets a graphics run put the camera in the same place before and after a change
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.shadowMap.enabled = !low;
      renderer.shadowMap.type = THREE.PCFShadowMap;      // cheaper than PCFSoft on phones; shadow.radius keeps edges soft
      renderer.shadowMap.autoUpdate = false;   // the scene and sun never move: draw shadows once
      renderer.shadowMap.needsUpdate = true;
      THREE.DefaultLoadingManager.onLoad = () => { renderer.shadowMap.needsUpdate = true; map.triggerRepaint(); };
    },
    render(gl, args) {
      if (flagMesh && flagBase) {                       // wind ripple: stronger toward the free edge
        const pa = flagMesh.geometry.attributes.position, t = performance.now() / 1000;
        for (let k = 0; k < pa.count; k++) {
          const x = flagBase[k * 3], y = flagBase[k * 3 + 1], f = x / 0.72;
          pa.setZ(k, f * (0.06 * Math.sin(x * 11 - t * 6.5) + 0.025 * Math.sin(y * 9 + t * 4.1)));
          pa.setX(k, x * (1 - 0.04 * f * (1 + Math.sin(t * 3))));
        }
        pa.needsUpdate = true;
        flagMesh.geometry.computeVertexNormals();
      }
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(model);
      // Where the flagstick lands on screen, so the flag icon can follow it exactly (or hide)
      if (pin && onPin) {
        const [px, pz] = toLocal(pin.lng, pin.lat), py = pin.z || 0, cv = map.getCanvas();
        const W = cv.clientWidth, H = cv.clientHeight;
        const toScreen = y => {
          const v = new THREE.Vector4(px, y, pz, 1).applyMatrix4(camera.projectionMatrix);
          return v.w <= 0 ? null : { x: (v.x / v.w + 1) / 2 * W, y: (1 - v.y / v.w) / 2 * H };
        };
        const base = toScreen(py), top = toScreen(py + 2.13);
        onPin(base && top ? { x: base.x, y: base.y, height: base.y - top.y } : null);
      }
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      scene?.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(mt => { mt.map?.dispose?.(); mt.dispose?.(); }); });
      renderer?.dispose?.();
    },
  };
}

// ── Ground textures: high-resolution, seamless turf and sand used as MapLibre fill patterns ──
// Tileable value noise (period p) for soft color variation
function tileNoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (i, j) => hash3(((i % p) + p) % p, ((j % p) + p) % p, seed);
  const s = t => t * t * (3 - 2 * t), u = s(fx), v = s(fy);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y, size, seed) {
  let a = 0, w = 0.5, f = 4;
  for (let o = 0; o < 4; o++) { a += w * tileNoise(x / size * f, y / size * f, f, seed + o); w *= 0.5; f *= 2; }
  return a;
}
function canvasPattern(size, paint) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const x = cv.getContext("2d");
  paint(x, size);
  return x.getImageData(0, 0, size, size);
}
// Draw something at a point and its wrapped copies so the tile has no seams
const wrapDraw = (size, px, py, pad, fn) => {
  for (const dx of [0, -size, size]) for (const dy of [0, -size, size]) {
    const X = px + dx, Y = py + dy;
    if (X > -pad && X < size + pad && Y > -pad && Y < size + pad) fn(X, Y);
  }
};

function turf(size, { base, light, dark, bladeLen, blades, angle, seed, drift = 1, res = 1 }) {
  // res: supersampling factor. Same footprint on the ground (pair with pixelRatio 2*res), res x more texels per metre.
  size *= res; bladeLen *= res; blades *= res * res;
  return canvasPattern(size, (x, n) => {
    // base with large and small scale color variation
    const img = x.createImageData(n, n), d = img.data;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = (fbm(i, j, n, seed) - 0.5) * drift, k = (j * n + i) * 4, grain = (hash3(i, j, seed) - 0.5) * 10;
      d[k] = base[0] + v * 34 + grain; d[k + 1] = base[1] + v * 40 + grain * 1.2; d[k + 2] = base[2] + v * 22 + grain * 0.6; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // blades of grass in several shades, mostly upright with some lean
    const r = rng(seed * 977);
    x.lineCap = "round";
    // finer, softer blades (2x count, ~60% length, thin hairline strokes) so the turf reads as soft grain, not scratchy noise
    const fineBlades = Math.round(blades * 2);
    for (let b = 0; b < fineBlades; b++) {
      const px = r() * n, py = r() * n, len = bladeLen * 0.6 * (0.6 + r() * 0.8);
      const a = angle + (r() - 0.5) * 0.9, dx = Math.sin(a) * len, dy = -Math.cos(a) * len;
      const t = r();
      x.strokeStyle = t < 0.45 ? `rgba(${light[0]},${light[1]},${light[2]},${0.2 + r() * 0.25})`
        : t < 0.9 ? `rgba(${dark[0]},${dark[1]},${dark[2]},${0.18 + r() * 0.25})` : `rgba(214,206,120,${0.12 + r() * 0.18})`;
      x.lineWidth = (0.45 + r() * 0.4) * res;
      wrapDraw(n, px, py, len + 2, (X, Y) => { x.beginPath(); x.moveTo(X, Y); x.quadraticCurveTo(X + dx * 0.4, Y + dy * 0.6, X + dx, Y + dy); x.stroke(); });
    }
  });
}

// Coarse clumps for the rough: a see-through tile of grass tufts (a soft shaded base and a fan of longer,
// thicker blades) laid over the fine rough texture only when the camera is close (layer `rough-tufts`),
// so uncut rough reads coarser than the mown fairway beside it. Zoomed out it is not drawn at all:
// the pattern's size is fixed on screen, so from far away the clumps would be metres across.
function tufts(size, { light, dark, count, angle, seed, scale = 1 }) {
  return canvasPattern(size, (x, n) => {
    const r = rng(seed * 613);
    x.lineCap = "round";
    for (let t = 0; t < count; t++) {
      const px = r() * n, py = r() * n, sz = (0.7 + r() * 0.7) * scale, lean = angle + (r() - 0.5) * 0.8, nb = 5 + Math.floor(r() * 5);
      const fan = [];
      for (let b = 0; b < nb; b++) {
        const a = lean + (r() - 0.5) * 1.5, len = (7 + r() * 8) * sz, q = r();
        fan.push([Math.sin(a) * len, -Math.cos(a) * len, (r() - 0.5) * 3 * sz, (0.6 + r() * 0.6) * sz,
          q < 0.5 ? `rgba(${light[0]},${light[1]},${light[2]},${0.3 + r() * 0.3})` : q < 0.88 ? `rgba(${dark[0]},${dark[1]},${dark[2]},${0.3 + r() * 0.3})` : `rgba(206,198,116,${0.22 + r() * 0.22})`]);
      }
      wrapDraw(n, px, py, 18 * sz, (X, Y) => {
        x.fillStyle = `rgba(${dark[0]},${dark[1]},${dark[2]},0.22)`;
        x.beginPath(); x.ellipse(X, Y, 4.5 * sz, 2.6 * sz, 0, 0, Math.PI * 2); x.fill();
        for (const [dx, dy, ox, w, col] of fan) {
          x.strokeStyle = col; x.lineWidth = w;
          x.beginPath(); x.moveTo(X + ox, Y); x.quadraticCurveTo(X + ox + dx * 0.3, Y + dy * 0.65, X + ox + dx, Y + dy); x.stroke();
        }
      });
    }
  });
}

// Fine blades for the mown surfaces (fairway, collar, fringe, green, tees): a see-through tile of short,
// hairline grass blades, one texel wide, laid over the smooth turf only when the camera is very close
// (layers `fine-fairway` and `fine-green`). The turf tiles themselves are drawn finer than a screen pixel,
// so close up the mown grass was an even wash; this gives it a crisp, short nap that still reads far
// smoother than the clumps in the rough. No geometry; not drawn at all from further out.
function fineBlades(size, { light, dark, count, angle, seed }) {
  return canvasPattern(size, (x, n) => {
    const r = rng(seed * 331);
    x.lineCap = "round";
    for (let b = 0; b < count; b++) {
      const px = r() * n, py = r() * n, len = 3 + r() * 4, a = angle + (r() - 0.5) * 1.1, q = r();
      const dx = Math.sin(a) * len, dy = -Math.cos(a) * len, bend = (r() - 0.5) * 1.6;
      x.strokeStyle = q < 0.48 ? `rgba(${light[0]},${light[1]},${light[2]},${0.2 + r() * 0.26})`
        : q < 0.95 ? `rgba(${dark[0]},${dark[1]},${dark[2]},${0.16 + r() * 0.22})` : `rgba(214,206,128,${0.14 + r() * 0.16})`;
      x.lineWidth = 0.7 + r() * 0.5;
      wrapDraw(n, px, py, len + 2, (X, Y) => { x.beginPath(); x.moveTo(X, Y); x.quadraticCurveTo(X + dx * 0.5 + bend, Y + dy * 0.5, X + dx, Y + dy); x.stroke(); });
    }
  });
}

function sand(size, seed, res = 1) {
  // res: supersampling; same ground footprint (pair with pixelRatio 2*res), res x more texels per metre
  const sz = size * res;
  return canvasPattern(sz, (x, n) => {
    const img = x.createImageData(n, n), d = img.data, r = rng(seed);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 4;
      const v = fbm(i, j, n, seed) - 0.5;
      // rake lines: soft parallel ridges with a slight wave
      const rake = Math.sin((j + 6 * Math.sin(i / n * Math.PI * 4)) / n * Math.PI * 2 * 22) * 5;
      const g = (r() - 0.5) * 30;                     // per-grain brightness
      let R = 231 + v * 24 + rake + g, G = 197 + v * 22 + rake + g * 0.95, B = 152 + v * 18 + rake + g * 0.85;   // warm tan, like the real traps
      const q = r();
      if (q < 0.025) { R -= 70; G -= 66; B -= 58; }               // dark mineral grains
      else if (q < 0.05) { R -= 30; G -= 38; B -= 52; }            // tan/orange grains
      else if (q < 0.065) { R += 22; G += 24; B += 30; }           // bright quartz sparkles
      d[k] = R; d[k + 1] = G; d[k + 2] = B; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // a few small pebbles and footprints-like soft dents
    for (let p = 0; p < 26 * res * res; p++) {
      const px = r() * n, py = r() * n, rad = (1 + r() * 1.6) * res;
      x.fillStyle = `rgba(${150 + r() * 40},${135 + r() * 35},${110 + r() * 30},0.85)`;
      wrapDraw(n, px, py, 4 * res, (X, Y) => { x.beginPath(); x.ellipse(X, Y, rad, rad * 0.75, r() * 3, 0, Math.PI * 2); x.fill(); });
    }
  });
}

function plain(size, base, seed) {
  return canvasPattern(size, (x, n) => {
    const img = x.createImageData(n, n), d = img.data;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = fbm(i, j, n, seed) - 0.5, k = (j * n + i) * 4, g = (hash3(i, j, seed) - 0.5) * 8;
      d[k] = base[0] + v * 14 + g; d[k + 1] = base[1] + v * 14 + g; d[k + 2] = base[2] + v * 12 + g; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  });
}

// Per-texture pixelRatio (default 2); res-2 textures draw 2x the texels over the same ground area
export const GROUND_PIXEL_RATIO = { "tex-rough": 4, "tex-rough-tufts": 2, "tex-fine-blades": 2, "tex-fairway": 4, "tex-stripe": 4, "tex-collar": 4, "tex-fringe": 4, "tex-green": 4, "tex-tee": 4, "tex-sand": 4, "tex-ground": 4 };
export const GROUND_TEXTURES = {
  "tex-rough": () => turf(512, { base: [64, 122, 48], light: [118, 172, 78], dark: [34, 78, 28], bladeLen: 8, blades: 9000, angle: 0.15, seed: 3, drift: 1.5, res: 2 }),
  "tex-rough-tufts": () => tufts(512, { light: [118, 172, 78], dark: [34, 78, 28], count: 860, angle: 0.15, seed: 3, scale: 1.2 }),
  "tex-fairway": () => turf(512, { base: [104, 170, 70], light: [150, 206, 104], dark: [70, 128, 48], bladeLen: 4, blades: 9000, angle: 0, seed: 5, res: 2 }),
  "tex-stripe": () => turf(512, { base: [118, 184, 82], light: [164, 216, 116], dark: [82, 140, 58], bladeLen: 4, blades: 9000, angle: 3.14, seed: 7, res: 2 }),
  "tex-collar": () => turf(256, { base: [100, 168, 68], light: [146, 204, 102], dark: [66, 122, 46], bladeLen: 3.5, blades: 4000, angle: 1.57, seed: 21, res: 2 }),
  "tex-fringe": () => turf(256, { base: [88, 156, 62], light: [138, 196, 96], dark: [58, 112, 42], bladeLen: 3, blades: 3500, angle: 0.3, seed: 9, res: 2 }),
  "tex-green": () => turf(256, { base: [128, 196, 92], light: [168, 222, 124], dark: [100, 164, 72], bladeLen: 1.6, blades: 4500, angle: 0, seed: 11, res: 2 }),
  "tex-tee": () => turf(256, { base: [116, 186, 82], light: [160, 214, 114], dark: [84, 146, 58], bladeLen: 2.4, blades: 4000, angle: 0, seed: 13, res: 2 }),
  "tex-fine-blades": () => fineBlades(512, { light: [186, 232, 136], dark: [48, 104, 38], count: 15000, angle: 0, seed: 29 }),
  "tex-sand": () => sand(512, 17, 2),
  "tex-ground": () => plain(512, [203, 210, 190], 19),
};

// ── Turf colour drift: one soft light/dark mottle laid over the whole rough and the lawns ──
// The turf patterns above repeat every few metres, so from any distance the rough was one flat green.
// This is a single small image pinned to the ground (not a repeating tile): broad patches a little
// darker and a little more sun-bleached, 20-130 m across, clipped to the rough and lawn outlines.
// Built once per page load; no geometry and no per-frame work.
let driftCache = null;
export function turfDrift(features) {
  if (driftCache) return driftCache;
  const polys = [];
  for (const f of features) {
    const k = f.properties.kind;
    if (k !== "course" && k !== "lawn") continue;
    if (f.geometry.type === "Polygon") polys.push(f.geometry.coordinates); else polys.push(...f.geometry.coordinates);
  }
  if (!polys.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, nn = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); nn = Math.max(nn, y); }
  const N = 512, mx = (e - w) * 111320 * Math.cos((s + nn) / 2 * Math.PI / 180), my = (nn - s) * 110574;   // box size in metres
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const x = cv.getContext("2d"), img = x.createImageData(N, N), d = img.data;
  // smooth value noise in metres (not tileable: the image is used once)
  const vn = (px, py, cell, seed) => {
    const gx = px / cell, gy = py / cell, xi = Math.floor(gx), yi = Math.floor(gy), sm = t => t * t * (3 - 2 * t), u = sm(gx - xi), v = sm(gy - yi);
    return (hash3(xi, yi, seed) * (1 - u) + hash3(xi + 1, yi, seed) * u) * (1 - v) + (hash3(xi, yi + 1, seed) * (1 - u) + hash3(xi + 1, yi + 1, seed) * u) * v;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = i / N * mx, py = j / N * my, k = (j * N + i) * 4;
    const v = ((vn(px, py, 130, 41) - 0.5) * 1.0 + (vn(px, py, 55, 43) - 0.5) * 0.8 + (vn(px, py, 22, 47) - 0.5) * 0.55 + (vn(px, py, 9, 53) - 0.5) * 0.3) * 1.5;   // about -1..1
    if (v < 0) { d[k] = 16; d[k + 1] = 50; d[k + 2] = 20; d[k + 3] = Math.min(0.23, -v * 0.34) * 255; }        // deeper, lusher patches
    else { d[k] = 200; d[k + 1] = 208; d[k + 2] = 108; d[k + 3] = Math.min(0.24, v * 0.34) * 255; }           // thinner, sun-bleached patches
  }
  x.putImageData(img, 0, 0);
  // keep it on the rough and lawns only (the photo, water and roads outside stay untouched)
  x.globalCompositeOperation = "destination-in";
  x.beginPath();
  for (const p of polys) for (const ring of p) {
    ring.forEach(([lx, ly], q) => { const X = (lx - w) / (e - w) * N, Y = (nn - ly) / (nn - s) * N; if (q) x.lineTo(X, Y); else x.moveTo(X, Y); });
    x.closePath();
  }
  x.fill("evenodd");
  driftCache = { url: cv.toDataURL("image/png"), coordinates: [[w, nn], [e, nn], [e, s], [w, s]] };
  return driftCache;
}

// Cross-cut mowing pattern for one green: two sets of mower passes at right angles, each pass MOW metres
// wide and alternately brushed toward and away from the viewer, which gives the checkerboard of slightly
// lighter and darker squares seen on a cut green. A fill pattern cannot do this (its size is fixed on
// screen, not on the ground), so it is one small see-through image, made once when the hole opens,
// pinned to the ground and clipped to the traced green. No triangles, no per-frame work.
// `bearing` is the hole's tee-to-green bearing: the passes run at 45 degrees either side of it.
export function greenCut(features, holeNumber, bearing, MOW = 1.5) {
  const f = features.find(q => q.properties.kind === "green" && q.properties.hole === holeNumber && q.geometry.type === "Polygon");
  if (!f) return null;
  const ring = f.geometry.coordinates[0];
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const kx = 111320 * Math.cos((s + n) / 2 * Math.PI / 180), ky = 110574, pad = 0.5;
  w -= pad / kx; e += pad / kx; s -= pad / ky; n += pad / ky;
  const mx = (e - w) * kx, my = (n - s) * ky, px = Math.max(mx, my) / 512 > 0.06 ? Math.max(mx, my) / 512 : 0.06;   // metres per texel
  const W = Math.max(8, Math.round(mx / px)), H = Math.max(8, Math.round(my / px));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d"), img = x.createImageData(W, H), d = img.data;
  const a = (bearing + 45) * Math.PI / 180, sa = Math.sin(a), ca = Math.cos(a), soft = 0.09;
  // one set of passes: +1 on one pass, -1 on the next, with a soft 9 cm join between them
  const pass = t => { const u = ((t / MOW) % 2 + 2) % 2, r = u < 1 ? u : u - 1, edge = Math.min(r, 1 - r) * MOW; return (u < 1 ? 1 : -1) * Math.min(1, edge / soft); };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = (i + 0.5) * px, Y = my - (j + 0.5) * px, k = (j * W + i) * 4;
    const v = (pass(X * sa + Y * ca) + pass(X * ca - Y * sa)) / 2;          // -1, 0 or +1: both dark, one each, both light
    if (v < 0) { d[k] = 24; d[k + 1] = 84; d[k + 2] = 36; d[k + 3] = -v * 0.1 * 255; }
    else { d[k] = 236; d[k + 1] = 248; d[k + 2] = 176; d[k + 3] = v * 0.115 * 255; }
  }
  x.putImageData(img, 0, 0);
  x.globalCompositeOperation = "destination-in";
  x.beginPath();
  ring.forEach(([lx, ly], q) => { const X = (lx - w) / (e - w) * W, Y = (n - ly) / (n - s) * H; if (q) x.lineTo(X, Y); else x.moveTo(X, Y); });
  x.closePath();
  x.fill();
  return { url: cv.toDataURL("image/png"), coordinates: [[w, n], [e, n], [e, s], [w, s]] };
}
