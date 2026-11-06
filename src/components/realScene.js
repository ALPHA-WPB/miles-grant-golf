import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import maplibregl from "maplibre-gl";

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
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = t => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
           l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const color = hex => new THREE.Color(hex);

// ── Broadleaf crown: lumpy cluster of smooth, noise-displaced puffs, unit size ─────────────
function oakCrown(seed, tint) {
  const r = rng(seed), parts = [];
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.32 + r() * 0.28;
    const py = i === 0 ? 0.58 : 0.4 + r() * 0.32, pr = i === 0 ? 0.62 : 0.42 + r() * 0.16;
    let g = new THREE.IcosahedronGeometry(pr, 2);
    g.deleteAttribute("normal"); g.deleteAttribute("uv");
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const n = noise3(x * 3.2 + seed, y * 3.2, z * 3.2) * 0.22 - 0.11 + noise3(x * 8, y * 8 + seed, z * 8) * 0.06;
      const f = 1 + n / pr;
      p.setXYZ(k, x * f + Math.cos(a) * d, y * f + py, z * f + Math.sin(a) * d);
    }
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, sx = 2 / (bb.max.x - bb.min.x), sz = 2 / (bb.max.z - bb.min.z), sy = 1 / (bb.max.y - bb.min.y);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(sx, sy, sz);
  geo.computeVertexNormals();
  // Leaf color: darker underneath and inside, sunlit top, speckled like foliage clumps
  const p = geo.attributes.position, cols = new Float32Array(p.count * 3), base = color(tint), c = new THREE.Color();
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const shade = 0.6 + 0.55 * y + (noise3(x * 11 + seed, y * 11, z * 11) - 0.5) * 0.4;
    c.copy(base).multiplyScalar(Math.max(0.35, shade));
    cols.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return geo;
}

function trunkGeo(top, bottom, segs, hSegs, bend, barkHex) {
  const g = new THREE.CylinderGeometry(top, bottom, 1, segs, hSegs, true);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position, cols = new Float32Array(p.count * 3), base = color(barkHex), c = new THREE.Color();
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k);
    p.setX(k, p.getX(k) + bend * y * y);
    const band = 0.85 + 0.15 * Math.sin(y * 90) + (hash3(k, y, 3) - 0.5) * 0.1;
    c.copy(base).multiplyScalar(band);
    cols.set([c.r, c.g, c.b], k * 3);
  }
  g.computeVertexNormals();
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}

// ── Palm frond texture: rib and many thin leaflets, transparent between them ──────────────
function frondTexture() {
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 512;
  const x = cv.getContext("2d");
  x.clearRect(0, 0, 128, 512);
  x.lineCap = "round";
  // Leaflets: dense, slightly overlapping strokes from the rib to the edges
  for (let v = 8; v < 500; v += 5) {
    const t = v / 512, w = 58 * Math.sin(Math.PI * Math.min(1, t * 1.12)) + 4;
    const l = 24 + (v % 9), hue = 88 + (v % 4) * 5;
    x.strokeStyle = `hsl(${hue}, 48%, ${l}%)`;
    x.lineWidth = 5;
    x.beginPath(); x.moveTo(64, v); x.quadraticCurveTo(64 - w * 0.5, v + 6, 64 - w, v + 22); x.stroke();
    x.strokeStyle = `hsl(${hue}, 48%, ${l + 4}%)`;
    x.beginPath(); x.moveTo(64, v); x.quadraticCurveTo(64 + w * 0.5, v + 6, 64 + w, v + 22); x.stroke();
  }
  x.strokeStyle = "#7a7442"; x.lineWidth = 6;
  x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 512); x.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;           // keep the leaflets from fading out at a distance
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// Palm crown in unit-height space (tree height 1): arching, drooping fronds around the top
function palmCrown(seed, bend) {
  const r = rng(seed), fronds = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r() * 0.3, old = i % 3 === 0;
    const L = 0.3 + r() * 0.06, lift = old ? 0.05 : 0.32, droop = old ? 1.6 : 1.05;
    const segs = 10, pos = [], uv = [], idx = [];
    for (let j = 0; j <= segs; j++) {
      const t = j / segs, along = t * L, w = 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.006;
      const y = lift * along - droop * along * along;
      for (const s of [-1, 1]) {
        pos.push(s * w, y - Math.abs(s) * w * 0.35, along);
        uv.push((s + 1) / 2, t);
      }
      if (j < segs) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.rotateY(az);
    g.translate(bend, 1, 0);
    fronds.push(g);
  }
  const geo = mergeGeometries(fronds);
  geo.computeVertexNormals();
  return geo;
}

// ── Houses: walls from the footprint, hip roof on its best-fit rectangle ──────────────────
const WALLS = ["#f4efe4", "#efe6d6", "#f7f3ec", "#e9dfcf", "#f1ead9"];
const ROOFS = ["#9d5a45", "#8a8580", "#b07a5a", "#6f6a66", "#c9b8a2"];
function housesGeometry(buildings, toLocal) {
  const pos = [], col = [];
  const tri = (a, b, c, hex) => {
    pos.push(...a, ...b, ...c);
    const k = color(hex);
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b);
  };
  buildings.forEach(f => {
    const ring = f.geometry.coordinates[0].map(([lng, lat]) => toLocal(lng, lat));
    if (ring.length < 4) return;
    const tall = f.properties.h > 7, wallH = tall ? 6 : 3.1;
    const wall = WALLS[f.properties.c % WALLS.length];
    const roof = f.properties.roof || ROOFS[(f.properties.c * 7 + ring.length) % ROOFS.length];
    // walls (shaded a touch darker than the roof color would suggest at the base)
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, z1] = ring[i], [x2, z2] = ring[i + 1];
      tri([x1, 0, z1], [x2, 0, z2], [x2, wallH, z2], wall);
      tri([x1, 0, z1], [x2, wallH, z2], [x1, wallH, z1], wall);
    }
    // best-fit (minimum-area) rectangle
    let best = null;
    for (let i = 0; i < ring.length - 1; i++) {
      const ang = Math.atan2(ring[i + 1][1] - ring[i][1], ring[i + 1][0] - ring[i][0]);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      ring.forEach(([x, z]) => { const u = x * ca + z * sa, v = -x * sa + z * ca; minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v); });
      const area = (maxU - minU) * (maxV - minV);
      if (!best || area < best.area) best = { area, ca, sa, minU, maxU, minV, maxV };
    }
    let fpArea = 0;
    for (let i = 0; i < ring.length - 1; i++) fpArea += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    fpArea = Math.abs(fpArea) / 2;
    const { ca, sa } = best, o = 0.45;
    const minU = best.minU - o, maxU = best.maxU + o, minV = best.minV - o, maxV = best.maxV + o;
    const back = (u, v, y) => [u * ca - v * sa, y, u * sa + v * ca];
    if (fpArea / best.area > 0.72) {
      let L = maxU - minU, W = maxV - minV, swap = false;
      if (W > L) { swap = true; [L, W] = [W, L]; }
      const rise = W * 0.24, y0 = wallH, y1 = wallH + rise;
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2, ridge = (L - W) / 2;
      // corners and ridge ends in (along, across) of the long axis
      const P = (a, b, y) => swap ? back(cu + b, cv + a, y) : back(cu + a, cv + b, y);
      const A = P(-L / 2, -W / 2, y0), B = P(L / 2, -W / 2, y0), C = P(L / 2, W / 2, y0), D = P(-L / 2, W / 2, y0);
      const R1 = P(-ridge, 0, y1), R2 = P(ridge, 0, y1);
      const shadeA = new THREE.Color(roof).multiplyScalar(0.92).getHexString(), shadeB = new THREE.Color(roof).multiplyScalar(0.8).getHexString();
      tri(A, B, R2, roof); tri(A, R2, R1, roof);
      tri(C, D, R1, `#${shadeA}`); tri(C, R1, R2, `#${shadeA}`);
      tri(B, C, R2, `#${shadeB}`); tri(D, A, R1, `#${shadeB}`);
    } else {
      // irregular footprint: low flat roof slab with the roof color
      const shape = ring.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z));
      THREE.ShapeUtils.triangulateShape(shape, []).forEach(([a, b, c]) =>
        tri([shape[a].x, wallH + 0.4, shape[a].y], [shape[b].x, wallH + 0.4, shape[b].y], [shape[c].x, wallH + 0.4, shape[c].y], roof));
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function createRealisticLayer(course, id = "real3d") {
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

  let renderer, scene, camera, map;
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

      // Oaks: 4 crown variants × instanced, plus trunks
      const tints = ["#4c8c34", "#58983f", "#427e2f", "#64a04a"];
      const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
      const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
      const trunkG = trunkGeo(0.55, 1, 8, 2, 0, "#5b4630");
      const trunks = new THREE.InstancedMesh(trunkG, barkMat, oaks.length);
      for (let v = 0; v < 4; v++) {
        const mine = oaks.filter((_, i) => i % 4 === v);
        const crown = new THREE.InstancedMesh(oakCrown(17 + v * 31, tints[v]), leafMat, mine.length);
        mine.forEach((f, i) => {
          const [x, z] = toLocal(...f.geometry.coordinates), { r, h } = f.properties;
          dummy.position.set(x, h * 0.34, z);
          dummy.rotation.set(0, hash3(x, z, v) * Math.PI * 2, 0);
          dummy.scale.set(r * 1.08, h * 0.74, r * 1.08);
          dummy.updateMatrix();
          crown.setMatrixAt(i, dummy.matrix);
          tmpColor.setHSL(0, 0, 0.88 + hash3(z, x, 1) * 0.24);
          crown.setColorAt(i, tmpColor);
        });
        crown.castShadow = crown.receiveShadow = true;
        crown.frustumCulled = false;
        scene.add(crown);
      }
      oaks.forEach((f, i) => {
        const [x, z] = toLocal(...f.geometry.coordinates), { r, h } = f.properties;
        dummy.position.set(x, 0, z); dummy.rotation.set(0, 0, 0);
        const tw = 0.22 + r * 0.035;
        dummy.scale.set(tw, h * 0.55, tw);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
      });
      trunks.castShadow = true; trunks.frustumCulled = false;
      scene.add(trunks);

      // Palms: curved banded trunk + crown of textured fronds (uniform scale by height)
      const bend = 0.05;
      const palmTrunks = new THREE.InstancedMesh(trunkGeo(0.017, 0.026, 10, 12, bend, "#8a7a62"), barkMat, palms.length);
      const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85 });
      const crowns = [0, 1].map(v => new THREE.InstancedMesh(palmCrown(5 + v * 13, bend), frondMat, Math.ceil(palms.length / 2)));
      const counts = [0, 0];
      palms.forEach((f, i) => {
        const [x, z] = toLocal(...f.geometry.coordinates), h = f.properties.h;
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, hash3(x, z, 7) * Math.PI * 2, 0);
        dummy.scale.setScalar(h);
        dummy.updateMatrix();
        palmTrunks.setMatrixAt(i, dummy.matrix);
        const v = i % 2;
        crowns[v].setMatrixAt(counts[v]++, dummy.matrix);
      });
      crowns.forEach((c, v) => { c.count = counts[v]; c.castShadow = true; c.frustumCulled = false; scene.add(c); });
      palmTrunks.castShadow = true; palmTrunks.frustumCulled = false;
      scene.add(palmTrunks);

      // Houses
      const houses = new THREE.Mesh(housesGeometry(buildings, toLocal), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
      houses.castShadow = houses.receiveShadow = true;
      houses.frustumCulled = false;
      scene.add(houses);

      // Ground that only shows shadows, over the whole area
      const box = new THREE.Box3().setFromObject(houses);
      allPts.forEach(p => { const [x, z] = toLocal(...p); box.expandByPoint(new THREE.Vector3(x, 0, z)); });
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.x + 80, size.z + 80), new THREE.ShadowMaterial({ opacity: 0.42, depthWrite: false }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(mid.x, 0.05, mid.z);
      ground.receiveShadow = true;
      ground.renderOrder = -1;
      scene.add(ground);

      const ext = Math.max(size.x, size.z) / 2 + 60;
      sun.position.set(mid.x + 140, 420, mid.z + 330);
      sun.target.position.copy(mid);
      Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 10, far: 1400 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.mapSize.set(4096, 4096);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.4;
      sun.shadow.radius = 3;
      sun.castShadow = true;

      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;   // the scene and sun never move: draw shadows once
      renderer.shadowMap.needsUpdate = true;
    },
    render(gl, args) {
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(model);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      scene?.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(mt => { mt.map?.dispose?.(); mt.dispose?.(); }); });
      renderer?.dispose?.();
    },
  };
}

// ── Ground textures: subtle grain for turf and sand, used as MapLibre fill patterns ───────
function pattern(size, base, amp, extra) {
  const data = new Uint8Array(size * size * 4), r = rng(base[0] * 7 + base[1]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = (noise3(x / 6, y / 6, 1) - 0.5) * amp * 1.4 + (r() - 0.5) * amp;
    const i = (y * size + x) * 4;
    data[i] = Math.max(0, Math.min(255, base[0] + n));
    data[i + 1] = Math.max(0, Math.min(255, base[1] + n * 1.1));
    data[i + 2] = Math.max(0, Math.min(255, base[2] + n * 0.8));
    data[i + 3] = 255;
  }
  extra?.(data, size, r);
  return { width: size, height: size, data };
}
const blades = (dark) => (data, size, r) => {
  for (let b = 0; b < size * 3; b++) {
    const x = Math.floor(r() * size), y = Math.floor(r() * size), len = 2 + Math.floor(r() * 3);
    for (let j = 0; j < len; j++) {
      const i = (((y + j) % size) * size + x) * 4;
      data[i] = Math.max(0, data[i] - dark); data[i + 1] = Math.max(0, data[i + 1] - dark * 0.7); data[i + 2] = Math.max(0, data[i + 2] - dark);
    }
  }
};
export const GROUND_TEXTURES = {
  "tex-rough": () => pattern(128, [74, 150, 66], 16, blades(22)),
  "tex-fairway": () => pattern(128, [118, 194, 80], 9, blades(10)),
  "tex-stripe": () => pattern(128, [132, 206, 92], 9, blades(10)),
  "tex-fringe": () => pattern(64, [96, 176, 70], 8),
  "tex-green": () => pattern(64, [160, 228, 112], 5),
  "tex-tee": () => pattern(64, [136, 213, 96], 7),
  "tex-sand": () => pattern(128, [240, 224, 178], 18),
  "tex-ground": () => pattern(128, [203, 212, 190], 8),
};
