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
function oakVariants() {
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
    o.leaves.count = Math.max(7, Math.round(o.leaves.count * 0.7));
    o.leaves.size *= 2.3;
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
  const cv = document.createElement("canvas");
  cv.width = 32; cv.height = 256;
  const x = cv.getContext("2d");
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
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function trunkTexture() {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 512;
  const x = cv.getContext("2d");
  x.fillStyle = "#8c8273"; x.fillRect(0, 0, 64, 512);
  for (let y = 0; y < 512; y += 9 + (y % 5)) {
    x.fillStyle = `rgba(60,52,42,${0.35 + (y % 7) * 0.04})`; x.fillRect(0, y, 64, 2.5);
    x.fillStyle = "rgba(190,180,160,0.35)"; x.fillRect(0, y + 3, 64, 1.5);
  }
  for (let i = 0; i < 900; i++) {
    const px = (i * 37) % 64, py = (i * 101) % 512;
    x.fillStyle = `rgba(${i % 2 ? 50 : 170},${i % 2 ? 45 : 160},${i % 2 ? 38 : 140},0.25)`; x.fillRect(px, py, 2, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
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

// ── Houses: walls from the footprint, hip roof on its best-fit rectangle ──────────────────
const WALLS = ["#f4efe4", "#efe6d6", "#f7f3ec", "#e9dfcf", "#f1ead9"];
const ROOFS = ["#9d5a45", "#8a8580", "#b07a5a", "#6f6a66", "#c9b8a2"];
function housesGeometry(buildings, toLocal, exaggeration) {
  const pos = [], col = [];
  let lift = 0;   // ground height under the current house
  const tri = (a, b, c, hex) => {
    pos.push(a[0], a[1] + lift, a[2], b[0], b[1] + lift, b[2], c[0], c[1] + lift, c[2]);
    const k = color(hex);
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b);
  };
  buildings.forEach(f => {
    const ring = f.geometry.coordinates[0].map(([lng, lat]) => toLocal(lng, lat));
    if (ring.length < 4) return;
    const tall = f.properties.h > 7, wallH = tall ? 6 : 3.1, base = (f.properties.z || 0) * exaggeration;
    lift = base;
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

export function createRealisticLayer(course, exaggeration = 1, pin = null, onPin = null, id = "real3d") {
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
      const variants = oakVariants();
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
      const houses = new THREE.Mesh(housesGeometry(buildings, toLocal, exaggeration), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
      houses.castShadow = houses.receiveShadow = true;
      houses.frustumCulled = false;
      scene.add(houses);

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
      sun.castShadow = true;

      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

function turf(size, { base, light, dark, bladeLen, blades, angle, seed }) {
  return canvasPattern(size, (x, n) => {
    // base with large and small scale color variation
    const img = x.createImageData(n, n), d = img.data;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = fbm(i, j, n, seed) - 0.5, k = (j * n + i) * 4, grain = (hash3(i, j, seed) - 0.5) * 10;
      d[k] = base[0] + v * 34 + grain; d[k + 1] = base[1] + v * 40 + grain * 1.2; d[k + 2] = base[2] + v * 22 + grain * 0.6; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // blades of grass in several shades, mostly upright with some lean
    const r = rng(seed * 977);
    x.lineCap = "round";
    for (let b = 0; b < blades; b++) {
      const px = r() * n, py = r() * n, len = bladeLen * (0.6 + r() * 0.8);
      const a = angle + (r() - 0.5) * 0.9, dx = Math.sin(a) * len, dy = -Math.cos(a) * len;
      const t = r();
      x.strokeStyle = t < 0.45 ? `rgba(${light[0]},${light[1]},${light[2]},${0.35 + r() * 0.4})`
        : t < 0.9 ? `rgba(${dark[0]},${dark[1]},${dark[2]},${0.3 + r() * 0.4})` : `rgba(214,206,120,${0.25 + r() * 0.3})`;
      x.lineWidth = 0.7 + r() * 0.7;
      wrapDraw(n, px, py, len + 2, (X, Y) => { x.beginPath(); x.moveTo(X, Y); x.quadraticCurveTo(X + dx * 0.4, Y + dy * 0.6, X + dx, Y + dy); x.stroke(); });
    }
  });
}

function sand(size, seed) {
  return canvasPattern(size, (x, n) => {
    const img = x.createImageData(n, n), d = img.data, r = rng(seed);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 4;
      const v = fbm(i, j, n, seed) - 0.5;
      // rake lines: soft parallel ridges with a slight wave
      const rake = Math.sin((j + 6 * Math.sin(i / n * Math.PI * 4)) / n * Math.PI * 2 * 22) * 5;
      const g = (r() - 0.5) * 30;                     // per-grain brightness
      let R = 236 + v * 24 + rake + g, G = 220 + v * 22 + rake + g * 0.95, B = 176 + v * 18 + rake + g * 0.85;
      const q = r();
      if (q < 0.025) { R -= 70; G -= 66; B -= 58; }               // dark mineral grains
      else if (q < 0.05) { R -= 30; G -= 38; B -= 52; }            // tan/orange grains
      else if (q < 0.065) { R += 22; G += 24; B += 30; }           // bright quartz sparkles
      d[k] = R; d[k + 1] = G; d[k + 2] = B; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // a few small pebbles and footprints-like soft dents
    for (let p = 0; p < 26; p++) {
      const px = r() * n, py = r() * n, rad = 1 + r() * 1.6;
      x.fillStyle = `rgba(${150 + r() * 40},${135 + r() * 35},${110 + r() * 30},0.85)`;
      wrapDraw(n, px, py, 4, (X, Y) => { x.beginPath(); x.ellipse(X, Y, rad, rad * 0.75, r() * 3, 0, Math.PI * 2); x.fill(); });
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

export const GROUND_TEXTURES = {
  "tex-rough": () => turf(512, { base: [70, 132, 52], light: [126, 182, 82], dark: [38, 84, 30], bladeLen: 7, blades: 9000, angle: 0.15, seed: 3 }),
  "tex-fairway": () => turf(512, { base: [104, 170, 70], light: [150, 206, 104], dark: [70, 128, 48], bladeLen: 4, blades: 9000, angle: 0, seed: 5 }),
  "tex-stripe": () => turf(512, { base: [118, 184, 82], light: [164, 216, 116], dark: [82, 140, 58], bladeLen: 4, blades: 9000, angle: 3.14, seed: 7 }),
  "tex-fringe": () => turf(256, { base: [88, 156, 62], light: [138, 196, 96], dark: [58, 112, 42], bladeLen: 3, blades: 3500, angle: 0.3, seed: 9 }),
  "tex-green": () => turf(256, { base: [128, 196, 92], light: [168, 222, 124], dark: [100, 164, 72], bladeLen: 1.6, blades: 4500, angle: 0, seed: 11 }),
  "tex-tee": () => turf(256, { base: [116, 186, 82], light: [160, 214, 114], dark: [84, 146, 58], bladeLen: 2.4, blades: 4000, angle: 0, seed: 13 }),
  "tex-sand": () => sand(512, 17),
  "tex-ground": () => plain(256, [203, 210, 190], 19),
};
