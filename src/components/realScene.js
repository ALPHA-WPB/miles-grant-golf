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
function oakVariants(low = false) {
  return ["Oak Medium", "Oak Medium", "Oak Small", "Oak Medium"].map((name, i) => {
    const tree = new Tree();
    tree.loadPreset(name);
    const o = tree.options;
    o.seed = 4211 + i * 7919;
    // Florida live oaks: short trunk, wide spreading limbs, dense foliage
    o.branch.length[0] *= 0.6;
    o.branch.angle[1] = Math.min(80, (o.branch.angle[1] || 50) + 14);
    o.branch.angle[2] = Math.min(75, (o.branch.angle[2] || 50) + 8);
    o.branch.length[1] *= 1.15;
    o.leaves.count = Math.max(7, Math.round(o.leaves.count * (low ? 0.35 : 0.7)));   // Low graphics: half the leaf cards, bigger so the canopy still fills
    o.leaves.size *= low ? 3.1 : 2.3;
    o.leaves.billboard = "single";
    o.branch.children[2] = Math.max(2, (o.branch.children[2] || 3) - 1);
    for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * 0.6));
    for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(1, Math.round(o.branch.sections[k] * 0.6));
    tree.generate();
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
function palmCrown(seed) {
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
  const nF = 17;
  for (let f = 0; f < nF; f++) {
    const az = (f / nF) * Math.PI * 2 + r() * 0.35;
    const tier = f % 3;                                   // 0 young/upright, 1 spreading, 2 old/hanging
    const elev = tier === 0 ? 0.95 + r() * 0.3 : tier === 1 ? 0.35 + r() * 0.25 : -0.15 - r() * 0.3;
    const L = 0.34 + r() * 0.08;
    const dirH = V(Math.cos(az), 0, Math.sin(az));
    const start = top.clone().add(V(0, -0.015 * tier, 0));
    const pts = [], tans = [];
    const N = 14;
    for (let j = 0; j <= N; j++) {
      const s = (j / N) * L;
      const rise = Math.sin(elev) * s - (tier === 2 ? 1.8 : 1.0) * s * s;
      const p = start.clone().addScaledVector(dirH, Math.cos(elev) * s).add(V(0, rise, 0));
      pts.push(p);
    }
    for (let j = 0; j <= N; j++) tans.push(pts[Math.min(N, j + 1)].clone().sub(pts[Math.max(0, j - 1)]).normalize());
    const shade = tier === 2 ? 0.78 : tier === 0 ? 1.08 : 0.95;
    const stemTint = c.set("#7d7a3e").clone();
    // stem (a thin ribbon facing up)
    for (let j = 0; j < N; j++) {
      const side = new THREE.Vector3().crossVectors(tans[j], V(0, 1, 0)).normalize().multiplyScalar(0.004 * (1 - j / N) + 0.0015);
      quad(pts[j].clone().sub(side), pts[j].clone().add(side), pts[j + 1].clone().add(side), pts[j + 1].clone().sub(side), stemTint);
    }
    // leaflets
    const nL = 26;
    for (let k = 2; k < nL; k++) {
      const t = k / nL, j = Math.min(N - 1, Math.floor(t * N)), fr = t * N - j;
      const base = pts[j].clone().lerp(pts[j + 1], fr), tan = tans[j];
      const sideV = new THREE.Vector3().crossVectors(tan, V(0, 1, 0)).normalize();
      const len = 0.16 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.7) + 0.02;
      const w = 0.0075 + 0.004 * (1 - t);
      for (const sd of [-1, 1]) {
        const droop = tier === 0 ? 0.25 : tier === 1 ? 0.55 : 0.85;
        const dir = sideV.clone().multiplyScalar(sd * 0.72).addScaledVector(tan, 0.42).add(V(0, -droop * (0.4 + t * 0.6), 0)).normalize();
        const mid = base.clone().addScaledVector(dir, len * 0.55).add(V(0, -len * 0.12 * droop, 0));
        const tip = base.clone().addScaledVector(dir, len).add(V(0, -len * 0.3 * droop, 0));
        const across = new THREE.Vector3().crossVectors(dir, tan).normalize().multiplyScalar(w);
        const tint = c.setHSL(0.22 + (r() - 0.5) * 0.03, 0.42 + r() * 0.12, (0.3 + r() * 0.08) * shade).clone();
        quad(base.clone().sub(across.clone().multiplyScalar(0.4)), base.clone().add(across.clone().multiplyScalar(0.4)),
             mid.clone().add(across), mid.clone().sub(across), tint);
        quad(mid.clone().sub(across), mid.clone().add(across), tip.clone().addScaledVector(across, 0.15), tip.clone().addScaledVector(across, -0.15), tint);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function palmTrunkGeo() {
  const g = new THREE.CylinderGeometry(0.016, 0.03, 1, 12, 20, true);
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
const WALLS = ["#f4efe4", "#efe6d6", "#f7f3ec", "#e9dfcf", "#f1ead9"];
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
  const pos = [], col = [];
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
      for (let q = 0; q < parts; q++) {
        const ua = u1 + (u2 - u1) * q / parts, va = v1 + (v2 - v1) * q / parts, ub = u1 + (u2 - u1) * (q + 1) / parts, vb = v1 + (v2 - v1) * (q + 1) / parts;
        const a0 = world(ua, va, -1), b0 = world(ub, vb, -1), a1 = world(ua, va, hAt(ua, va) - 0.03), b1 = world(ub, vb, hAt(ub, vb) - 0.03);
        tri(a0, b0, b1, k); tri(a0, b1, a1, k);
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
    const long = d01 >= d12, L = Math.max(d01, d12) + 3, Wd = Math.max(2.6, Math.min(d01, d12));
    const cx = (r[0][0] + r[2][0]) / 2, cz = (r[0][1] + r[2][1]) / 2;
    const a = long ? Math.atan2(r[1][1] - r[0][1], r[1][0] - r[0][0]) : Math.atan2(r[2][1] - r[1][1], r[2][0] - r[1][0]);
    const box = (w, h, d, ox, oy, oz, hex) => {
      const b = new THREE.BoxGeometry(w, h, d).toNonIndexed(); b.translate(ox, oy, oz); b.rotateY(-a); b.translate(cx, y, cz);
      const k = color(hex), c = new Float32Array(b.attributes.position.count * 3);
      for (let i = 0; i < c.length; i += 3) { c[i] = k.r; c[i + 1] = k.g; c[i + 2] = k.b; }
      b.setAttribute("color", new THREE.BufferAttribute(c, 3)); b.deleteAttribute("uv");
      geos.push(b);
    };
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

export function createRealisticLayer(course, exaggeration = 1, pin = null, onPin = null, id = "real3d", low = false) {
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

      const dummy = new THREE.Object3D(), tmpColor = new THREE.Color();
      const oaks = trees.filter(f => f.properties.type !== "palm"), palms = trees.filter(f => f.properties.type === "palm");

      // Oaks: ez-tree shapes, instanced; each scaled to the tree's measured canopy
      const variants = oakVariants(low);
      const leafMat = new THREE.MeshStandardMaterial({ map: getLeafTexture("oak"), color: 0xc4d4a8, alphaTest: 0.5,
        side: THREE.DoubleSide, roughness: 0.92 });
      variants.forEach((V, v) => {
        const mine = oaks.filter((_, i) => i % variants.length === v);
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

      // Palms: ringed trunk + crown of fronds with individual leaflets (scaled by height)
      const trunkMat = new THREE.MeshStandardMaterial({ map: trunkTexture(), roughness: 1 });
      const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo(), trunkMat, palms.length);
      const leafletMat = new THREE.MeshStandardMaterial({ map: leafletTexture(), vertexColors: true, alphaTest: 0.4,
        side: THREE.DoubleSide, roughness: 0.75 });
      const crownGeos = [0, 1, 2].map(v => palmCrown(11 + v * 29));
      const crowns = crownGeos.map(g => new THREE.InstancedMesh(g, leafletMat, Math.ceil(palms.length / 3)));
      const counts = [0, 0, 0];
      palms.forEach((f, i) => {
        const [x, z] = toLocal(...f.geometry.coordinates), h = f.properties.h, y0 = (f.properties.z || 0) * exaggeration;
        dummy.position.set(x, y0 - 0.2, z);
        dummy.rotation.set(0, hash3(x, z, 7) * Math.PI * 2, 0);
        dummy.scale.set(h, h * (0.95 + hash3(z, x, 2) * 0.1), h);
        dummy.updateMatrix();
        palmTrunks.setMatrixAt(i, dummy.matrix);
        const v = i % 3;
        crowns[v].setMatrixAt(counts[v]++, dummy.matrix);
      });
      crowns.forEach((c, v) => { c.count = counts[v]; c.castShadow = true; c.receiveShadow = true; c.frustumCulled = false; scene.add(c); });
      palmTrunks.castShadow = true; palmTrunks.frustumCulled = false;
      scene.add(palmTrunks);

      // Hedges: thick shrub rows traced by hand (e.g. behind back yards), a solid leafy wall from
      // the ground up, so only the roofs of the houses behind them show
      const hedges = course.features.filter(f => f.properties.kind === "hedge");
      if (hedges.length) {
        // long runs (the perimeter border is ~2 km): coarser blobs, wider spacing, to keep the triangle count down
        const hedgeLen = hedges.reduce((a, f) => { const c = f.geometry.coordinates; let l = 0; for (let j = 0; j < c.length - 1; j++) l += Math.hypot((c[j + 1][0] - c[j][0]) * 99500, (c[j + 1][1] - c[j][1]) * 111320); return a + l; }, 0);
        const longRun = hedges.length && hedgeLen > 600;
        const spacing = longRun ? 2.4 : 1.3;
        const geo = new THREE.IcosahedronGeometry(1, longRun ? 2 : 3), p = geo.attributes.position, nrm = geo.attributes.normal, col = [];
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 0.88 + hash3(x * 4.3, y * 4.3, z * 4.3) * 0.24;
          p.setXYZ(i, x * n, y * n, z * n);
          nrm.setXYZ(i, x, y, z);   // smooth, rounded shading (the lumps stay in the outline)
          const c = (0.62 + 0.38 * (y + 1) / 2) * (0.85 + hash3(z * 5, x * 5, y * 5) * 0.3);
          col.push(0.36 * c, 0.55 * c, 0.24 * c);
        }
        geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
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
        const hedgeMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), pts.length);
        pts.forEach(({ x, z, y0, h, w }, i) => {
          const jx = (hash3(x, z, 3) - 0.5) * 0.8, jz = (hash3(z, x, 4) - 0.5) * 0.8, hh = h * (0.9 + hash3(x, 9, z) * 0.2);
          dummy.position.set(x + jx, y0 + hh / 2 - 0.15, z + jz);
          dummy.rotation.set(0, hash3(x, z, 5) * Math.PI * 2, 0);
          dummy.scale.set(w / 2 * (0.9 + hash3(z, 2, x) * 0.25), hh / 2, w / 2 * (0.9 + hash3(2, x, z) * 0.25));
          dummy.updateMatrix();
          hedgeMesh.setMatrixAt(i, dummy.matrix);
        });
        hedgeMesh.castShadow = hedgeMesh.receiveShadow = true; hedgeMesh.frustumCulled = false;
        scene.add(hedgeMesh);
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
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.13, 10), white);
        pole.position.set(px, py + 2.13 / 2, pz);
        // White flag with the hole number on both sides; its cloth ripples in the wind (render())
        const flagTex = (() => {
          const cv = document.createElement("canvas"); cv.width = 256; cv.height = 176;
          const x = cv.getContext("2d");
          x.fillStyle = "#fbfbf8"; x.fillRect(0, 0, 256, 176);
          x.fillStyle = "#0f3b22"; x.font = "900 128px Inter, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
          x.fillText(String(pin.number ?? ""), 128, 96);
          const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
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
export const GROUND_PIXEL_RATIO = { "tex-rough": 4, "tex-fairway": 4, "tex-stripe": 4, "tex-collar": 4, "tex-fringe": 4, "tex-green": 4, "tex-tee": 4, "tex-sand": 4, "tex-ground": 4 };
export const GROUND_TEXTURES = {
  "tex-rough": () => turf(512, { base: [64, 122, 48], light: [118, 172, 78], dark: [34, 78, 28], bladeLen: 8, blades: 9000, angle: 0.15, seed: 3, drift: 1.5, res: 2 }),
  "tex-fairway": () => turf(512, { base: [104, 170, 70], light: [150, 206, 104], dark: [70, 128, 48], bladeLen: 4, blades: 9000, angle: 0, seed: 5, res: 2 }),
  "tex-stripe": () => turf(512, { base: [118, 184, 82], light: [164, 216, 116], dark: [82, 140, 58], bladeLen: 4, blades: 9000, angle: 3.14, seed: 7, res: 2 }),
  "tex-collar": () => turf(256, { base: [100, 168, 68], light: [146, 204, 102], dark: [66, 122, 46], bladeLen: 3.5, blades: 4000, angle: 1.57, seed: 21, res: 2 }),
  "tex-fringe": () => turf(256, { base: [88, 156, 62], light: [138, 196, 96], dark: [58, 112, 42], bladeLen: 3, blades: 3500, angle: 0.3, seed: 9, res: 2 }),
  "tex-green": () => turf(256, { base: [128, 196, 92], light: [168, 222, 124], dark: [100, 164, 72], bladeLen: 1.6, blades: 4500, angle: 0, seed: 11, res: 2 }),
  "tex-tee": () => turf(256, { base: [116, 186, 82], light: [160, 214, 114], dark: [84, 146, 58], bladeLen: 2.4, blades: 4000, angle: 0, seed: 13, res: 2 }),
  "tex-sand": () => sand(512, 17, 2),
  "tex-ground": () => plain(512, [203, 210, 190], 19),
};
