import * as THREE from "three";
import { Tree } from "../vendor/ez-tree/tree";
import { getBarkTexture, getLeafTexture } from "../vendor/ez-tree/textures";

// Trees of the 3D course. The course data only says "palm" or "oak" (any broadleaf tree), where it stands, how wide its
// crown is and how tall it is. Everything else here is how it is drawn:
//
//   PALMS      nine kinds seen around Stuart (cabbage palm, coconut, queen, royal, Mexican fan, date, foxtail, Bismarck,
//              Christmas palm), each with its own trunk and several crown shapes: 25 crowns in all.
//   BROADLEAF  nine forms picked by the tree's measured size and proportions (spreading live oak, round oak, banyan with
//              prop roots for the giants, upright shade tree, open vase, small round ornamental, sea grape, pine, tall oak),
//              two shapes of each near the hole, with five kinds of foliage.
//
// A tree's kind, shape, lean, size and colour come from its position (treeRand), so the same tree looks the same from every
// hole. Detail follows distance from the hole being played: lod 0 = near on GFX HIGH, 1 = near on GFX LOW, 2 = beyond NEAR,
// 3 = beyond FAR2. Shapes are built once and kept (geoCache), so the second hole of a round opens faster than the first.

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
// 0..1 from a tree's position (to a tenth of a metre) and a salt
export function treeRand(lng, lat, salt) {
  let h = Math.imul(Math.round(lng * 1e6) | 0, 0x9E3779B1) ^ Math.imul(Math.round(lat * 1e6) | 0, 0x85EBCA77) ^ Math.imul((salt | 0) + 1, 0xC2B2AE3D);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ── Textures (drawn in code, no downloads) ─────────────────────────────────────────────────────────────────────────────────
// Foliage is drawn on a canvas and handed to the GPU as plain pixels, with the colour of the leaves copied under the
// see-through parts: a canvas keeps black there, and the smaller copies the GPU makes for distant trees would then have a
// dark fringe round every leaf.
const texCache = new Map();
function pixelTexture(key, w, h, draw, { srgb = true, repeat = false } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const x = cv.getContext("2d");
  draw(x, w, h);
  const src = x.getImageData(0, 0, w, h).data, px = new Uint8Array(w * h * 4);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < src.length; i += 4) if (src[i + 3] > 200) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
  if (n) { r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n); }
  for (let y = 0; y < h; y++) {                       // rows flipped: the canvas starts at the top, the GPU at the bottom
    const s0 = y * w * 4, d0 = (h - 1 - y) * w * 4;
    for (let i = 0; i < w * 4; i += 4) {
      const a = src[s0 + i + 3];
      if (a < 24) { px[d0 + i] = r; px[d0 + i + 1] = g; px[d0 + i + 2] = b; px[d0 + i + 3] = 0; }
      else { px[d0 + i] = src[s0 + i]; px[d0 + i + 1] = src[s0 + i + 1]; px[d0 + i + 2] = src[s0 + i + 2]; px[d0 + i + 3] = a; }
    }
  }
  cv.width = cv.height = 0;                           // give the canvas memory back straight away (phones keep it otherwise)
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}
// every texture carries a small solid square in its bottom-left corner: fruit, boots and leaf stalks are painted from it
const SOLID_UV = [0.045, 0.012];

// One palm frond, base at the bottom: a stalk with a row of leaflets down each side. Drawn in greys; the colour of the palm
// comes from the crown itself, so one drawing serves a green coconut, a silver date palm and a dead brown frond.
const FRONDS = {
  // n leaflets a side, their angle to the stalk at the base and the tip (degrees), width (px), and how far they reach
  regular: { seed: 11, n: 62, a0: 64, a1: 26, wid: 6.6, jit: 0.1, solid: 0.78, reach: t => Math.pow(Math.sin(Math.PI * (0.13 + 0.85 * t)), 0.55) },
  fine: { seed: 23, n: 92, a0: 58, a1: 22, wid: 4.2, jit: 0.3, solid: 0.6, reach: t => 0.72 + 0.28 * Math.pow(Math.sin(Math.PI * (0.1 + 0.88 * t)), 0.5) * (0.75 + 0.25 * Math.sin(t * 40)) },
  stiff: { seed: 37, n: 74, a0: 52, a1: 30, wid: 5.0, jit: 0.06, solid: 0.72, reach: t => (t < 0.16 ? 0.25 + 2.2 * t : 0.62) * (1 - 0.5 * smooth(0.75, 1, t)) + 0.2 },
};
function frondTexture(kind) {
  const P = FRONDS[kind];
  return pixelTexture("frond-" + kind, 256, 1024, (x, W, H) => {
    const r = rng(P.seed), cx = W / 2, lf = [];
    for (let i = 0; i < P.n; i++) for (const sd of [-1, 1]) {
      const t = (i + r() * 0.8) / P.n;
      const y0 = H * (1 - (0.045 + 0.94 * t));
      const ang = (lerp(P.a0, P.a1, t) * Math.PI) / 180 + (r() - 0.5) * P.jit;
      const hx = (W / 2 - 3) * clamp(P.reach(t), 0.08, 1) * (0.86 + 0.14 * r());
      lf.push({ sd, y0, dx: sd * hx, dy: -hx / Math.tan(ang), w: P.wid * (0.8 + 0.4 * r()), g: Math.round(165 + 90 * r()) });
    }
    // The inner part of the blade is solid (leaflets overlap there), in the darker tone of the gaps between leaflets, so the
    // frond still reads as a frond when it is a few pixels wide; the leaflets stand free only toward their tips.
    for (const sd of [-1, 1]) {
      x.fillStyle = "rgb(128,128,128)";
      x.beginPath(); x.moveTo(cx, H);
      for (const l of lf) if (l.sd === sd) x.lineTo(cx + l.dx * P.solid, l.y0 + l.dy * P.solid);
      x.lineTo(cx, H * 0.015); x.closePath(); x.fill();
    }
    for (const l of lf) {
      const L = Math.hypot(l.dx, l.dy), px = -l.dy / L, py = l.dx / L;
      x.fillStyle = `rgb(${l.g},${l.g},${l.g})`;
      x.beginPath();
      x.moveTo(cx, l.y0);
      x.quadraticCurveTo(cx + l.dx * 0.42 + px * l.w, l.y0 + l.dy * 0.42 + py * l.w, cx + l.dx, l.y0 + l.dy);
      x.quadraticCurveTo(cx + l.dx * 0.42 - px * l.w, l.y0 + l.dy * 0.42 - py * l.w, cx, l.y0);
      x.fill();
      x.strokeStyle = "rgba(255,255,255,0.22)"; x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(cx, l.y0); x.lineTo(cx + l.dx, l.y0 + l.dy); x.stroke();
    }
    x.fillStyle = "rgb(214,208,176)";                 // the stalk, thick at the base
    x.beginPath(); x.moveTo(cx - 4.5, H); x.lineTo(cx + 4.5, H); x.lineTo(cx + 0.9, H * 0.02); x.lineTo(cx - 0.9, H * 0.02); x.fill();
    x.fillStyle = "rgb(215,215,215)"; x.fillRect(0, H - 24, 24, 24);
  });
}
// One fan leaf (cabbage palm, Mexican fan palm, Bismarck): the stalk comes in at the bottom, the blade is a pleated fan
// whose outer half splits into pointed segments.
function fanTexture() {
  return pixelTexture("fan", 512, 512, (x, S) => {
    const r = rng(77), hx = S / 2, hy = S * 0.8, R = S * 0.74, n = 46, span = 2.3;
    const segs = [];
    for (let i = 0; i < n; i++) segs.push({ th: -span + (2 * span * (i + 0.5)) / n + (r() - 0.5) * 0.03, k: 0.88 + 0.2 * r(), g: Math.round(140 + 105 * r()) });
    for (const s of segs) {
      const L = R * (0.8 + 0.2 * Math.cos(s.th * 0.75)) * s.k, dx = Math.sin(s.th), dy = -Math.cos(s.th), w = R * 0.062;
      x.fillStyle = `rgb(${s.g},${s.g},${s.g})`;
      x.beginPath();
      x.moveTo(hx, hy);
      x.quadraticCurveTo(hx + dx * L * 0.5 - dy * w, hy + dy * L * 0.5 + dx * w, hx + dx * L, hy + dy * L);
      x.quadraticCurveTo(hx + dx * L * 0.5 + dy * w, hy + dy * L * 0.5 - dx * w, hx, hy);
      x.fill();
    }
    x.fillStyle = "rgb(196,196,196)";                 // the joined inner half of the fan
    x.beginPath(); x.moveTo(hx, hy); x.arc(hx, hy, R * 0.47, -Math.PI / 2 - span, -Math.PI / 2 + span); x.closePath(); x.fill();
    for (const s of segs) {                           // pleats
      x.strokeStyle = s.g > 190 ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)"; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx + Math.sin(s.th) * R * 0.5, hy - Math.cos(s.th) * R * 0.5); x.stroke();
    }
    x.fillStyle = "rgb(205,200,170)"; x.fillRect(hx - 4, hy - 2, 8, S - hy + 2);
    x.fillStyle = "rgb(215,215,215)"; x.fillRect(0, S - 24, 24, 24);
  });
}
// Palm bark: vertical fissures and growth rings, light grey so each kind of palm can tint it
function trunkTexture() {
  return pixelTexture("trunk", 128, 1024, (x, W, H) => {
    const img = x.createImageData(W, H), d = img.data;
    const vn = (u, v, px, py, sd) => {
      const xi = Math.floor(u), yi = Math.floor(v), fx = u - xi, fy = v - yi;
      const h = (a, b) => hash3(((a % px) + px) % px, ((b % py) + py) % py, sd);
      const sm = t => t * t * (3 - 2 * t), ux = sm(fx), uy = sm(fy);
      return (h(xi, yi) * (1 - ux) + h(xi + 1, yi) * ux) * (1 - uy) + (h(xi, yi + 1) * (1 - ux) + h(xi + 1, yi + 1) * ux) * uy;
    };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 4;
      const ridge = vn((i / W) * 16, (j / H) * 4, 16, 4, 41) * 0.6 + vn((i / W) * 32, (j / H) * 12, 32, 12, 43) * 0.4;
      const fis = Math.abs(ridge - 0.5) < 0.05 ? -1 : 0;
      const band = Math.sin((j / H) * Math.PI * 2 * 38 + ridge * 5) * 0.5;
      const v = (ridge - 0.5) * 46 + band * 16 + fis * 40 + (hash3(i, j, 47) - 0.5) * 16;
      d[k] = 196 + v; d[k + 1] = 190 + v * 0.97; d[k + 2] = 180 + v * 0.92; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { repeat: true });
}

// A spray of leaves on a twig, the "card" a broadleaf crown is built from. Five kinds, so the trees are not all one species.
const SPRIGS = {
  // n leaves, leaf length (fraction of the card), width/length, colours
  liveoak: { seed: 5, n: 280, len: [0.085, 0.125], asp: 0.4, cols: ["#3a7a2a", "#479034", "#2e6626", "#589c3c", "#68a846"], twig: "#5a4a36", gloss: 0.1 },
  ficus: { seed: 9, n: 96, len: [0.15, 0.2], asp: 0.5, cols: ["#267028", "#318332", "#1f5c24", "#409636", "#2a7a2c"], twig: "#6a5a48", gloss: 0.35 },
  round: { seed: 13, n: 46, len: [0.2, 0.27], asp: 0.92, cols: ["#4f8a3a", "#5c9a45", "#6ea34f", "#7f9c44", "#447c36"], twig: "#70583e", gloss: 0.2, vein: "rgba(190,90,70,0.5)" },
  fine: { seed: 17, n: 30, len: [0.3, 0.4], asp: 0.3, cols: ["#5e9a3c", "#6cab45", "#52893a", "#78b450"], twig: "#5f5038", pinnate: 13 },
  pine: { seed: 21, n: 46, len: [0.2, 0.27], asp: 0, cols: ["#35683a", "#427840", "#2c5a36", "#528648"], twig: "#5b4632", needles: 44, back: "#274a2c" },
};
function sprigTexture(kind, S) {
  const P = SPRIGS[kind];
  return pixelTexture(`sprig-${kind}-${S}`, S, S, (x) => {
    const r = rng(P.seed), bx = S * 0.5, by = S * 0.97, cx = S * 0.5, cy = S * 0.46, rx = S * 0.45, ry = S * 0.46;
    const leaf = (px, py, ang, len, col) => {
      const dx = Math.cos(ang), dy = Math.sin(ang), tx = px + dx * len, ty = py + dy * len, w = (len * P.asp) / 2;
      const mx = px + dx * len * 0.45, my = py + dy * len * 0.45, nx = -dy, ny = dx;
      for (const [ox, oy, style] of [[2, 3, "rgba(8,22,6,0.45)"], [0, 0, col]]) {
        x.fillStyle = style;
        x.beginPath();
        x.moveTo(px + ox, py + oy);
        x.quadraticCurveTo(mx + nx * w * 1.9 + ox, my + ny * w * 1.9 + oy, tx + ox, ty + oy);
        x.quadraticCurveTo(mx - nx * w * 1.9 + ox, my - ny * w * 1.9 + oy, px + ox, py + oy);
        x.fill();
      }
      x.fillStyle = "rgba(255,255,255,0.09)";                             // one half of the blade catches the light
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(mx + nx * w * 1.9, my + ny * w * 1.9, tx, ty); x.closePath(); x.fill();
      x.strokeStyle = P.vein || "rgba(225,240,190,0.3)"; x.lineWidth = Math.max(0.7, S / 512);
      x.beginPath(); x.moveTo(px, py); x.lineTo(tx, ty); x.stroke();
      if (r() < P.gloss) { x.strokeStyle = "rgba(255,255,255,0.28)"; x.lineWidth = Math.max(1, w * 0.35); x.beginPath(); x.moveTo(px + dx * len * 0.3 + nx * w * 0.5, py + dy * len * 0.3 + ny * w * 0.5); x.lineTo(px + dx * len * 0.7 + nx * w * 0.4, py + dy * len * 0.7 + ny * w * 0.4); x.stroke(); }
    };
    const pick = () => P.cols[Math.floor(r() * P.cols.length)];
    const spot = () => { for (;;) { const u = r() * 2 - 1, v = r() * 2 - 1; if (u * u + v * v <= 1) return [cx + u * rx, cy + v * ry]; } };
    // the middle of the spray is solid, in the dark tone seen between leaves: a crown made of these cards is a closed mass
    // with a leafy edge, not a cloud of specks
    x.fillStyle = P.back || "rgb(" + [1, 3, 5].map(q => Math.round(parseInt(P.cols[2].slice(q, q + 2), 16) * 0.62)).join(",") + ")";
    for (let i = 0; i < 46; i++) { const u = r() * 2 - 1, v = r() * 2 - 1; if (u * u + v * v > 0.62) continue; x.beginPath(); x.arc(cx + u * rx, cy + v * ry, S * (0.06 + 0.05 * r()), 0, 7); x.fill(); }
    x.strokeStyle = P.twig; x.lineCap = "round";                           // twigs from the base of the card out into the spray
    for (let i = 0; i < 7; i++) { const [tx, ty] = spot(); x.lineWidth = S * (0.006 + 0.008 * r()); x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + (tx - bx) * 0.3, by + (ty - by) * 0.7, tx, ty); x.stroke(); }
    for (let i = 0; i < P.n; i++) {
      const [px, py] = spot(), out = Math.atan2(py - by, px - bx) + (r() - 0.5) * 1.5, len = S * lerp(P.len[0], P.len[1], r());
      if (P.needles) {                                                     // a tuft of needles fanning out from one point
        for (let k = 0; k < P.needles; k++) {
          const a = out + (r() - 0.5) * 2.3, l = len * (0.6 + 0.4 * r());
          x.strokeStyle = pick(); x.lineWidth = Math.max(1.1, S / 250);
          x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l * 0.5, py + Math.sin(a) * l * 0.5 + l * 0.05, px + Math.cos(a) * l, py + Math.sin(a) * l + l * 0.12); x.stroke();
        }
      } else if (P.pinnate) {                                              // a feather of small paired leaflets on a thin stalk
        const dx = Math.cos(out), dy = Math.sin(out), col = pick();
        x.strokeStyle = P.twig; x.lineWidth = Math.max(0.8, S / 420); x.beginPath(); x.moveTo(px, py); x.lineTo(px + dx * len, py + dy * len); x.stroke();
        for (let k = 1; k <= P.pinnate; k++) for (const sd of [-1, 1]) {
          const t = k / (P.pinnate + 0.5), l = len * 0.2 * Math.sin(Math.PI * (0.15 + 0.8 * t));
          leaf(px + dx * len * t, py + dy * len * t, out + sd * 1.05, l / P.asp * 0.42, col);
        }
      } else leaf(px - Math.cos(out) * len * 0.5, py - Math.sin(out) * len * 0.5, out, len, pick());
    }
    x.fillStyle = P.cols[0]; x.fillRect(0, S - Math.round(S * 0.047), Math.round(S * 0.047), Math.round(S * 0.047));
  });
}

// ── Geometry helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────
class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; }
  vert(p, n, u, v, c) { this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.uv.push(u, v); this.col.push(c.r, c.g, c.b); return this.pos.length / 3 - 1; }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  tri(a, b, c) { this.idx.push(a, b, c); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
// colours here are written the way they look on screen (sRGB); three.js keeps them in linear light
const rgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace);
// soft leaf shading: part the leaf's own facing, part "away from the middle of the crown", part straight up
const softNormal = (face, p, mid) => face.clone().multiplyScalar(0.3).addScaledVector(p.clone().sub(mid).normalize(), 0.45).addScaledVector(UP, 0.6).normalize();

const PALM_LIGHT = 1.25;   // every palm's leaf lightness is multiplied by this (the frond drawing itself is mid-grey)

// ── Palm crowns ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Feather palms. Each frond is the frond drawing on a strip that follows the arching stalk, folded along the stalk like a
// real frond: up in a V (date palms), flat, or hanging in a curtain (coconut). Bushy kinds (queen, foxtail) add a second
// pair of strips at another angle. All sizes in metres; the crown's origin is the top of the trunk.
function featherCrown(P, seed, lod) {
  const r = rng(seed), B = new Builder(), mid = V(0, 0.4, 0);
  const K = [8, 5, 3, 2][lod], nLive = Math.max(6, Math.round(P.n * [1, 0.85, 0.6, 0.45][lod]));
  const nDead = Math.round((P.dead || 0) * [1, 0.6, 0.35, 0][lod]), pairs = lod >= 2 ? 0 : P.plume || 0, wide = lod >= 2 && P.plume ? 1.2 : 1;
  const strip = (pts, tans, sideH, W, fold0, fold1, colAt, vTop = 1) => {
    for (const sd of [-1, 1]) {
      const rows = [];
      for (let j = 0; j <= K; j++) {
        const s = j / K, t = tans[j], n = new THREE.Vector3().crossVectors(sideH, t).normalize(), f = lerp(fold0, fold1, s);
        const out = sideH.clone().multiplyScalar(sd * Math.cos(f)).addScaledVector(n, Math.sin(f));
        const edge = pts[j].clone().addScaledVector(out, W / 2);
        const face = new THREE.Vector3().crossVectors(out, t).multiplyScalar(sd).normalize();
        if (face.dot(n) < 0) face.negate();
        const c = colAt(s);
        rows.push([B.vert(pts[j], softNormal(face, pts[j], mid), 0.5, s * vTop, c), B.vert(edge, softNormal(face, edge, mid), sd < 0 ? 0 : 1, s * vTop, c)]);
      }
      for (let j = 0; j < K; j++) B.quad(rows[j][0], rows[j][1], rows[j + 1][1], rows[j + 1][0]);
    }
  };
  for (let f = 0; f < nLive + nDead; f++) {
    const dead = f >= nLive, u = dead ? 1 : (f + r() * 0.6) / nLive;          // u: 0 = newest frond at the top, 1 = oldest at the bottom
    const az = f * 2.39996 + (r() - 0.5) * 0.5;
    const elev = dead ? -1.15 - r() * 0.3 : lerp(P.elev[0], P.elev[1], Math.pow(u, P.pow || 1)) + (r() - 0.5) * 0.16;
    const L = (dead ? 0.6 + 0.2 * r() : lerp(0.72, 1, smooth(0, 0.35, u)) * (0.9 + 0.2 * r())) * P.L;
    const g = dead ? 0.15 : lerp(P.g[0], P.g[1], u) * (0.8 + 0.4 * r());
    const dirH = V(Math.cos(az), 0, Math.sin(az)), sideH = V(-Math.sin(az), 0, Math.cos(az));
    const sway = (r() - 0.5) * 0.25 * L, start = V(0, dead ? -0.25 - 0.3 * r() : -0.12 * u, 0).addScaledVector(dirH, P.core || 0.08);
    const pts = [], tans = [];
    for (let j = 0; j <= K; j++) {
      const s = (j / K) * L, q = s / L;
      pts.push(start.clone().addScaledVector(dirH, Math.cos(elev) * s).addScaledVector(UP, Math.sin(elev) * s - g * L * q * q).addScaledVector(sideH, sway * q * q));
    }
    for (let j = 0; j <= K; j++) tans.push(pts[Math.min(K, j + 1)].clone().sub(pts[Math.max(0, j - 1)]).normalize());
    const k = 0.86 + 0.28 * r(), young = 1 - smooth(0, 0.3, u);
    const base = dead ? rgb(0.62 * k, 0.5 * k, 0.3 * k) : hsl(P.hue + young * 0.025 + (r() - 0.5) * 0.02, P.sat * (0.9 + 0.2 * r()), PALM_LIGHT * P.lit * k * (1 + 0.22 * young - 0.16 * smooth(0.6, 1, u)));
    const colAt = s => base.clone().multiplyScalar(lerp(0.62, 1.05, smooth(0, 0.55, s)));   // darker in toward the heart of the crown
    const W = (dead ? 0.7 : 1) * P.W * wide * (0.9 + 0.2 * r());
    strip(pts, tans, sideH, W, dead ? -0.9 : P.fold[0], dead ? -1.2 : P.fold[1], colAt);
    for (let p = 0; p < pairs && !dead; p++) strip(pts, tans, sideH, W * 0.8, P.fold[0] + (p ? -1.0 : 1.05), P.fold[1] + (p ? -0.9 : 1.15), colAt);
  }
  // fruit under the crown (coconuts, strings of dates): a few small solid balls
  if (P.fruit && lod <= 1) {
    const ball = new THREE.IcosahedronGeometry(1, lod ? 0 : 1), bp = ball.attributes.position;
    for (let i = 0; i < P.fruit.n; i++) {
      const a = r() * Math.PI * 2, c = V(Math.cos(a) * P.fruit.at, -0.25 - 0.35 * r(), Math.sin(a) * P.fruit.at), rad = P.fruit.r * (0.8 + 0.4 * r());
      const col = rgb(...P.fruit.col).multiplyScalar(0.8 + 0.4 * r()), i0 = B.pos.length / 3;
      for (let q = 0; q < bp.count; q++) { const n = V(bp.getX(q), bp.getY(q), bp.getZ(q)); B.vert(c.clone().addScaledVector(n, rad), n, SOLID_UV[0], SOLID_UV[1], col); }
      for (let q = 0; q < bp.count; q += 3) B.tri(i0 + q, i0 + q + 1, i0 + q + 2);
    }
    ball.dispose();
  }
  return B.geometry();
}

// Fan palms. Each leaf is the fan drawing on a small bent card at the end of a stalk; the crown is a ball of them, with
// dead brown leaves hanging underneath (the long "skirt" of a Mexican fan palm).
function fanCrown(P, seed, lod) {
  const r = rng(seed), B = new Builder(), mid = V(0, 0.2, 0);
  const nLive = Math.max(7, Math.round(P.n * [1, 0.85, 0.55, 0.4][lod])), nDead = Math.round((P.dead || 0) * [1, 0.7, 0.4, 0.25][lod]);
  const big = lod >= 2 ? 1.25 : 1;
  for (let f = 0; f < nLive + nDead; f++) {
    const dead = f >= nLive, u = dead ? 1 : (f + r() * 0.6) / nLive;
    const az = f * 2.39996 + (r() - 0.5) * 0.5;
    const elev = dead ? -1.0 - r() * 0.45 : lerp(P.elev[0], P.elev[1], Math.pow(u, P.pow || 1)) + (r() - 0.5) * 0.2;
    const dirH = V(Math.cos(az), 0, Math.sin(az)), sideH = V(-Math.sin(az), 0, Math.cos(az));
    const stalk = P.stalk * (dead ? 0.55 : 0.8 + 0.4 * r()), D = P.D * big * (dead ? 0.85 : 0.85 + 0.3 * r());
    const start = V(0, dead ? -0.2 - (P.skirt || 0.4) * r() : -0.1 * u, 0).addScaledVector(dirH, P.core || 0.1);
    const dir = dirH.clone().multiplyScalar(Math.cos(elev)).addScaledVector(UP, Math.sin(elev));
    const hub = start.clone().addScaledVector(dir, stalk);
    // the blade tips over past the end of the stalk: more on old, low leaves
    const tip = elev - (dead ? 0.5 : lerp(P.tip[0], P.tip[1], u)), m = dirH.clone().multiplyScalar(Math.cos(tip)).addScaledVector(UP, Math.sin(tip));
    const n = new THREE.Vector3().crossVectors(sideH, m).normalize();
    const k = 0.84 + 0.3 * r(), young = 1 - smooth(0, 0.3, u);
    const col = dead ? rgb(0.6 * k, 0.48 * k, 0.3 * k) : hsl(P.hue + young * 0.02 + (r() - 0.5) * 0.02, P.sat * (0.9 + 0.2 * r()), PALM_LIGHT * P.lit * k * (1 + 0.18 * young - 0.15 * smooth(0.6, 1, u)));
    if (lod <= 1) {                                   // the stalk: a thin strip painted from the solid corner
      const w = sideH.clone().multiplyScalar(0.035), sc = dead ? col : hsl(P.hue + 0.02, P.sat * 0.8, P.lit * 1.25);
      const a = B.vert(start.clone().sub(w), UP, ...SOLID_UV, sc), b = B.vert(start.clone().add(w), UP, ...SOLID_UV, sc);
      const c = B.vert(hub.clone().add(w), UP, ...SOLID_UV, sc), d = B.vert(hub.clone().sub(w), UP, ...SOLID_UV, sc);
      B.quad(a, b, c, d);
    }
    // the blade: the card's bottom centre (20% up the drawing) sits on the hub; it curls down along its length and
    // folds down either side of the midrib
    const rows = lod >= 2 ? [0, 1] : [0, 0.5, 1], cols = lod >= 2 ? [0, 1] : [0, 0.5, 1], grid = [];
    for (const v of rows) {
      const row = [];
      for (const uu of cols) {
        const p = hub.clone().addScaledVector(m, (v - 0.2) * D).addScaledVector(sideH, (uu - 0.5) * D)
          .addScaledVector(n, -P.fold * Math.abs(uu - 0.5) * D - P.curl * v * v * D);
        row.push(B.vert(p, softNormal(n, p, mid), uu, v, col.clone().multiplyScalar(lerp(0.7, 1.05, v))));
      }
      grid.push(row);
    }
    for (let a = 0; a < rows.length - 1; a++) for (let b = 0; b < cols.length - 1; b++) B.quad(grid[a][b], grid[a][b + 1], grid[a + 1][b + 1], grid[a + 1][b]);
  }
  return B.geometry();
}

// ── Palm trunks ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Unit height (each palm stretches it to its own height); radius and lean in metres. T.rad(y) = radius, T.lean(y) = [x, z]
// sideways offset, T.col(y) = colour (grey trunk, green crownshaft under the fronds, brown fibre). Boots are the stubs of
// old leaf stalks: the criss-cross on a cabbage palm, the diamonds on a date palm.
function palmTrunk(T, seed, lod) {
  const r = rng(seed), B = new Builder(), S = [10, 7, 5, 4][lod], R = [16, 9, 5, 3][lod];
  const ringY = i => { const t = i / R; return t < 0.5 ? 0.5 * Math.pow(2 * t, 1.5) : 1 - 0.5 * Math.pow(2 * (1 - t), 1.25); };   // rings closer together at the base and the top
  for (let i = 0; i <= R; i++) {
    const y = ringY(i), [lx, lz] = T.lean(y), rad = T.rad(y), c = rgb(...T.col(y));
    for (let j = 0; j <= S; j++) {
      const a = (j / S) * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
      B.vert(V(lx + nx * rad, y, lz + nz * rad), V(nx, 0, nz), (j / S) * (T.uRep || 1), y * (T.vRep || 6), c);
    }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) { const a = i * (S + 1) + j; B.quad(a, a + S + 1, a + S + 2, a + 1); }
  if (T.boots && lod <= 1) {
    const b = T.boots, rings = Math.round(b.rings * (lod ? 0.5 : 1)), per = lod ? Math.max(4, b.per - 2) : b.per;
    for (let i = 0; i < rings; i++) for (let j = 0; j < per; j++) {
      const y0 = lerp(b.from, b.to, (i + 0.5 * (j % 2)) / rings), a = ((j + 0.5 * (i % 2)) / per) * Math.PI * 2 + r() * 0.2;
      const [lx, lz] = T.lean(y0), rad = T.rad(y0), dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(b.w * (0.8 + 0.4 * r()));
      const p0 = V(lx, y0, lz).addScaledVector(dir, rad * 0.92), p1 = V(lx, y0 + b.rise, lz).addScaledVector(dir, rad + b.out * (0.7 + 0.6 * r()));
      const k = 0.75 + 0.5 * r(), c = rgb(b.col[0] * k, b.col[1] * k, b.col[2] * k), n = dir.clone().addScaledVector(UP, 0.4).normalize();
      B.quad(B.vert(p0.clone().sub(side), n, 0.2, y0 * 6, c), B.vert(p0.clone().add(side), n, 0.3, y0 * 6, c),
        B.vert(p1.clone().addScaledVector(side, 0.55), n, 0.3, y0 * 6 + 0.05, c), B.vert(p1.clone().addScaledVector(side, -0.55), n, 0.2, y0 * 6 + 0.05, c));
    }
  }
  const g = B.geometry(), [tx, tz] = T.lean(1), [ux, uz] = T.lean(0.9);
  g.userData.top = [tx, 1, tz];
  g.userData.tilt = [(tx - ux) / 0.1, (tz - uz) / 0.1];   // sideways metres per unit height at the top: the crown tips with the trunk
  return g;
}
const taper = (base, low, top, flareTo = 0.08) => y => (y < flareTo ? lerp(base, low, Math.pow(y / flareTo, 0.6)) : lerp(low, top, (y - flareTo) / (1 - flareTo)));
const straight = () => [0, 0];
const GREY = [0.74, 0.71, 0.66], TAN = [0.68, 0.6, 0.5], PALE = [0.9, 0.88, 0.84], BROWN = [0.5, 0.4, 0.3], FIBRE = [0.46, 0.36, 0.25];
// a green crownshaft: the smooth sleeve of leaf bases at the top of a royal, foxtail or Christmas palm
const shaft = (trunk, from, green) => y => (y < from ? trunk : y < from + 0.02 ? [lerp(trunk[0], green[0], (y - from) / 0.02), lerp(trunk[1], green[1], (y - from) / 0.02), lerp(trunk[2], green[2], (y - from) / 0.02)] : green);
const fibreTop = (trunk, from) => y => (y < from ? trunk : [lerp(trunk[0], FIBRE[0], (y - from) / (1 - from)), lerp(trunk[1], FIBRE[1], (y - from) / (1 - from)), lerp(trunk[2], FIBRE[2], (y - from) / (1 - from))]);

// ── The palms ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// share: how common it is. tall / short: how much more (or less) likely for a palm measured taller than 9.5 m / shorter
// than 6 m. hMul: height range for the many palms whose height was never measured (they all carry a default of 7 to 8.6 m).
// crowns: the variations, each a seed plus what to change from the kind's basic crown.
const feather = (o) => ({ type: "feather", pow: 1, plume: 0, dead: 0, ...o });
const fan = (o) => ({ type: "fan", pow: 1, dead: 0, ...o });
export const PALMS = {
  sabal: {                                            // cabbage palm, the Florida native: a round ball of grey-green fans
    name: "Cabbage palm", share: 26, tall: 1, short: 1.5, hMul: [0.6, 1.15], size: [0.85, 1.15],
    crown: fan({ n: 34, D: 1.55, stalk: 1.25, elev: [1.45, -0.75], tip: [0.25, 0.85], fold: 0.22, curl: 0.3, hue: 0.275, sat: 0.4, lit: 0.34, dead: 9, skirt: 0.5, core: 0.14, tex: "fan" }),
    crowns: [{ seed: 101 }, { seed: 102, n: 40, D: 1.7, dead: 14, lit: 0.31 }, { seed: 103, n: 22, elev: [1.45, 0.1], dead: 0, lit: 0.37 }, { seed: 104, n: 28, D: 1.35, stalk: 1.0, dead: 5, hue: 0.29 }],
    trunks: [
      { seed: 1, rad: taper(0.25, 0.19, 0.2), lean: straight, col: fibreTop(BROWN, 0.5), boots: { from: 0.38, to: 0.98, rings: 15, per: 7, rise: 0.035, out: 0.13, w: 0.07, col: [0.55, 0.45, 0.33] } },
      { seed: 2, rad: taper(0.24, 0.17, 0.16), lean: y => [0.25 * y * y, 0], col: fibreTop(GREY, 0.86) },
    ],
  },
  coconut: {                                          // leaning, curving trunk and long arching fronds whose leaflets hang
    name: "Coconut palm", share: 18, tall: 1.5, short: 0.6, hMul: [0.85, 1.45], size: [0.9, 1.15],
    crown: feather({ n: 26, L: 4.6, W: 1.2, elev: [1.35, -0.55], g: [0.25, 0.6], fold: [0.25, -0.95], hue: 0.262, sat: 0.6, lit: 0.36, dead: 3, core: 0.1, tex: "regular", fruit: { n: 7, r: 0.13, at: 0.22, col: [0.5, 0.52, 0.2] } }),
    crowns: [{ seed: 201 }, { seed: 202, n: 30, L: 5.1, g: [0.3, 0.7], dead: 5 }, { seed: 203, n: 18, L: 4.0, elev: [1.4, -0.2], lit: 0.4, hue: 0.25, fruit: null }, { seed: 204, n: 28, L: 4.8, fold: [0.1, -1.1], lit: 0.33, hue: 0.275, fruit: { n: 10, r: 0.13, at: 0.22, col: [0.62, 0.5, 0.18] } }],
    trunks: [
      { seed: 1, rad: taper(0.3, 0.17, 0.13), lean: y => [1.1 * y * y, 0], col: () => TAN, vRep: 9 },
      { seed: 2, rad: taper(0.32, 0.18, 0.13), lean: y => [2.3 * Math.pow(y, 1.5) - 0.7 * y * y * y, 0.3 * Math.sin(y * 3)], col: () => TAN, vRep: 9 },
      { seed: 3, rad: taper(0.28, 0.16, 0.12), lean: y => [0.5 * Math.sin(y * 2.6) + 0.4 * y * y, 0], col: () => GREY, vRep: 9 },
    ],
  },
  queen: {                                            // straight smooth trunk, long feathery fronds that droop
    name: "Queen palm", share: 16, tall: 1, short: 0.5, hMul: [0.85, 1.3], size: [0.9, 1.15],
    crown: feather({ n: 18, L: 4.2, W: 1.15, elev: [1.3, -0.35], g: [0.5, 0.95], fold: [0.15, -0.35], plume: 1, hue: 0.29, sat: 0.6, lit: 0.31, dead: 4, core: 0.09, tex: "fine", fruit: { n: 5, r: 0.09, at: 0.2, col: [0.85, 0.5, 0.12] } }),
    crowns: [{ seed: 301 }, { seed: 302, n: 22, L: 4.6, g: [0.6, 1.1], dead: 6 }, { seed: 303, n: 14, L: 3.6, elev: [1.35, 0], lit: 0.35, fruit: null }],
    trunks: [{ seed: 1, rad: y => taper(0.26, 0.18, 0.15)(y) + 0.02 * Math.sin(Math.PI * y), lean: straight, col: () => GREY, vRep: 11 }, { seed: 2, rad: taper(0.27, 0.19, 0.16), lean: y => [0.3 * y * y, 0], col: () => [0.8, 0.78, 0.74], vRep: 11 }],
  },
  royal: {                                            // tall pale column with a bulge, bright green crownshaft, big neat crown
    name: "Royal palm", share: 10, tall: 3, short: 0.2, hMul: [1.15, 1.7], size: [0.95, 1.2],
    crown: feather({ n: 16, L: 4.0, W: 1.25, elev: [1.25, -0.4], g: [0.3, 0.6], fold: [0.3, -0.3], plume: 1, hue: 0.295, sat: 0.62, lit: 0.32, dead: 1, core: 0.12, tex: "regular" }),
    crowns: [{ seed: 401 }, { seed: 402, n: 19, L: 4.3, g: [0.35, 0.7] }, { seed: 403, n: 13, elev: [1.3, -0.1], lit: 0.36 }],
    trunks: [
      { seed: 1, rad: y => (y > 0.8 ? lerp(0.2, 0.12, (y - 0.8) / 0.2) : taper(0.42, 0.29, 0.24)(y) + 0.07 * Math.exp(-Math.pow((y - 0.42) / 0.16, 2))), lean: straight, col: shaft(PALE, 0.8, [0.42, 0.62, 0.26]), vRep: 7 },
      { seed: 2, rad: y => (y > 0.83 ? lerp(0.19, 0.12, (y - 0.83) / 0.17) : taper(0.4, 0.27, 0.23)(y) + 0.05 * Math.exp(-Math.pow((y - 0.3) / 0.14, 2))), lean: straight, col: shaft([0.84, 0.82, 0.77], 0.83, [0.38, 0.58, 0.24]), vRep: 7 },
    ],
  },
  washingtonia: {                                     // Mexican fan palm: very tall and thin, small crown, long brown skirt
    name: "Mexican fan palm", share: 8, tall: 4, short: 0, hMul: [1.3, 1.95], size: [0.85, 1.1],
    crown: fan({ n: 26, D: 1.3, stalk: 1.15, elev: [1.45, -0.3], tip: [0.2, 0.7], fold: 0.15, curl: 0.25, hue: 0.29, sat: 0.55, lit: 0.36, dead: 22, skirt: 1.6, core: 0.12, tex: "fan" }),
    crowns: [{ seed: 501 }, { seed: 502, n: 30, dead: 34, skirt: 2.4 }, { seed: 503, n: 20, dead: 6, skirt: 0.5, elev: [1.45, 0.05] }],
    trunks: [{ seed: 1, rad: taper(0.4, 0.2, 0.15, 0.06), lean: y => [0.35 * y * y, 0], col: fibreTop([0.62, 0.52, 0.45], 0.9), vRep: 14 }, { seed: 2, rad: taper(0.42, 0.21, 0.16, 0.06), lean: y => [0.9 * y * y - 0.3 * y, 0.2 * y * y], col: fibreTop(GREY, 0.9), vRep: 14 }],
  },
  date: {                                             // thick diamond-patterned trunk, dense stiff crown like a firework
    name: "Date palm", share: 8, tall: 0.3, short: 2, hMul: [0.6, 0.95], size: [0.9, 1.15],
    crown: feather({ n: 58, L: 3.0, W: 0.95, elev: [1.5, -0.6], pow: 1.15, g: [0.04, 0.3], fold: [0.4, 0.3], hue: 0.31, sat: 0.3, lit: 0.4, dead: 0, core: 0.3, tex: "stiff", fruit: { n: 9, r: 0.11, at: 0.42, col: [0.9, 0.5, 0.1] } }),
    crowns: [{ seed: 601 }, { seed: 602, n: 70, L: 3.4, W: 1.05, hue: 0.29, sat: 0.55, lit: 0.33 }, { seed: 603, n: 46, L: 2.6, elev: [1.5, -0.25], hue: 0.35, sat: 0.2, lit: 0.46, fruit: null }],
    trunks: [
      { seed: 1, rad: y => taper(0.4, 0.31, 0.3)(y) + 0.2 * smooth(0.84, 0.97, y), lean: straight, col: () => BROWN, vRep: 10, boots: { from: 0.04, to: 0.97, rings: 26, per: 9, rise: 0.02, out: 0.07, w: 0.1, col: [0.56, 0.44, 0.32] } },
      { seed: 2, rad: y => taper(0.34, 0.26, 0.25)(y) + 0.16 * smooth(0.86, 0.97, y), lean: y => [0.2 * y * y, 0], col: () => [0.56, 0.48, 0.4], vRep: 10, boots: { from: 0.04, to: 0.97, rings: 22, per: 8, rise: 0.02, out: 0.06, w: 0.09, col: [0.6, 0.5, 0.38] } },
    ],
  },
  foxtail: {                                          // slim ringed trunk, crownshaft, a few very bushy bright fronds
    name: "Foxtail palm", share: 6, tall: 0.5, short: 1, hMul: [0.75, 1.1], size: [0.9, 1.1],
    crown: feather({ n: 11, L: 3.0, W: 1.0, elev: [1.2, -0.25], g: [0.45, 0.8], fold: [0.5, 0.2], plume: 2, hue: 0.285, sat: 0.62, lit: 0.4, dead: 0, core: 0.09, tex: "fine", fruit: { n: 6, r: 0.08, at: 0.16, col: [0.85, 0.3, 0.12] } }),
    crowns: [{ seed: 701 }, { seed: 702, n: 13, L: 3.3, g: [0.55, 0.95], fruit: null }],
    trunks: [{ seed: 1, rad: y => (y > 0.82 ? lerp(0.15, 0.09, (y - 0.82) / 0.18) : taper(0.24, 0.15, 0.13)(y)), lean: straight, col: shaft([0.78, 0.76, 0.72], 0.82, [0.5, 0.64, 0.36]), vRep: 16 }],
  },
  bismarck: {                                         // stout trunk, huge stiff silver-blue fans
    name: "Bismarck palm", share: 4, tall: 0.2, short: 3, hMul: [0.55, 0.9], size: [0.9, 1.15],
    crown: fan({ n: 24, D: 2.3, stalk: 1.7, elev: [1.4, -0.35], tip: [0.1, 0.45], fold: 0.3, curl: 0.12, hue: 0.42, sat: 0.14, lit: 0.52, dead: 3, skirt: 0.3, core: 0.2, tex: "fan" }),
    crowns: [{ seed: 801 }, { seed: 802, n: 19, D: 2.0, hue: 0.38, sat: 0.2, lit: 0.47, dead: 0 }],
    trunks: [{ seed: 1, rad: taper(0.32, 0.25, 0.24), lean: straight, col: fibreTop([0.56, 0.5, 0.44], 0.7), vRep: 8, boots: { from: 0.6, to: 0.97, rings: 7, per: 7, rise: 0.05, out: 0.16, w: 0.1, col: [0.6, 0.55, 0.45] } }],
  },
  christmas: {                                        // small and neat: thin trunk, crownshaft, short arching fronds, red fruit
    name: "Christmas palm", share: 4, tall: 0, short: 4, hMul: [0.5, 0.72], size: [0.9, 1.1],
    crown: feather({ n: 10, L: 1.9, W: 0.8, elev: [1.25, -0.2], g: [0.3, 0.6], fold: [0.45, 0.1], hue: 0.285, sat: 0.6, lit: 0.38, dead: 0, core: 0.06, tex: "regular", fruit: { n: 8, r: 0.06, at: 0.1, col: [0.85, 0.12, 0.08] } }),
    crowns: [{ seed: 901 }, { seed: 902, n: 12, L: 2.1, g: [0.4, 0.7], fruit: null }],
    trunks: [{ seed: 1, rad: y => (y > 0.78 ? lerp(0.1, 0.06, (y - 0.78) / 0.22) : taper(0.16, 0.1, 0.085)(y)), lean: y => [0.15 * y * y, 0], col: shaft([0.76, 0.74, 0.7], 0.78, [0.45, 0.62, 0.3]), vRep: 20 }],
  },
};
const PALM_KEYS = Object.keys(PALMS);

// Which palm stands here. Half of the palms take the kind of the "grove" they are in (a 24 m patch), so rows and clumps
// read as planted together; the rest are whatever they are.
function palmKind(lng, lat, h0) {
  const weights = PALM_KEYS.map(k => PALMS[k].share * (h0 >= 9.5 ? PALMS[k].tall : h0 < 6 ? PALMS[k].short : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const pickAt = u => { let x = u * total; for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return PALM_KEYS[i]; } return PALM_KEYS[0]; };
  if (treeRand(lng, lat, 31) < 0.5) {
    const gx = Math.round(lng * 4100), gy = Math.round(lat * 4600);     // about 24 m each way
    return pickAt(treeRand(gx / 1e6, gy / 1e6, 77));
  }
  return pickAt(treeRand(lng, lat, 32));
}

const geoCache = new Map();
const cached = (key, make) => { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; };
function palmCrownGeo(kind, v, lod) {
  const K = PALMS[kind], i = lod >= 2 ? 0 : v % K.crowns.length;          // away from the hole: one crown per kind
  return cached(`pc|${kind}|${i}|${lod}`, () => { const P = { ...K.crown, ...K.crowns[i] }; return (P.type === "fan" ? fanCrown : featherCrown)(P, P.seed, lod); });
}
function palmTrunkGeo(kind, v, lod) {
  const K = PALMS[kind], i = v % K.trunks.length;
  return cached(`pt|${kind}|${i}|${lod}`, () => palmTrunk(K.trunks[i], K.trunks[i].seed, lod));
}

// ── Broadleaf trees ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Branching trunks from ez-tree, in nine forms. `cards` is how many sprays of leaves a crown gets at each level of detail,
// `leaf` the size of one spray next to the tree, `tex` the foliage, `tint` the colour it is multiplied by.
export const BROADLEAF = {
  oak_round: {                                        // the everyday live oak: short trunk, round full crown
    name: "Live oak", preset: "Oak Medium", tex: "liveoak", tint: [1, 1, 1], bark: [0.75, 0.72, 0.68], cards: [3000, 1100, 520, 300], leaf: 5.4,
    shape: o => { o.branch.length[0] *= 0.75; o.branch.angle[1] = 62; o.branch.angle[2] = 60; o.branch.length[1] *= 1.15; o.branch.children[2] = 2; o.branch.force.strength = 0.003; o.branch.start[1] = 0.5; },
  },
  oak_spread: {                                       // old live oak: low heavy limbs reaching far out, wider than tall
    name: "Spreading live oak", preset: "Oak Medium", tex: "liveoak", tint: [0.95, 1, 0.92], bark: [0.68, 0.66, 0.63], cards: [3400, 1200, 560, 320], leaf: 5.8, squat: 0.72,
    shape: o => { o.branch.length[0] *= 0.82; o.branch.radius[0] *= 1.3; o.branch.angle[1] = 67; o.branch.angle[2] = 55; o.branch.length[1] *= 1.45; o.branch.children[0] = 7; o.branch.children[2] = 2; o.branch.force.strength = 0.004; o.branch.start[1] = 0.55; o.branch.gnarliness[1] = 0.18; },
  },
  banyan: {                                           // the giants: a huge dark dome on a massive trunk, with prop roots dropping from the limbs
    name: "Banyan", preset: "Oak Medium", tex: "ficus", tint: [0.92, 1, 0.92], bark: [0.78, 0.76, 0.72], cards: [3600, 1300, 600, 340], leaf: 6.2, props: 9, squat: 0.68,
    shape: o => { o.branch.length[0] *= 0.72; o.branch.radius[0] *= 2.1; o.branch.radius[1] *= 1.4; o.branch.angle[1] = 66; o.branch.angle[2] = 52; o.branch.length[1] *= 1.45; o.branch.children[0] = 9; o.branch.children[1] = 4; o.branch.children[2] = 2; o.branch.force.strength = 0.004; o.branch.start[1] = 0.5; },
  },
  upright: {                                          // mahogany-like shade tree: clear trunk, oval crown taller than wide, lighter fine foliage
    name: "Mahogany", preset: "Oak Medium", tex: "fine", tint: [1, 1, 0.95], bark: [0.62, 0.56, 0.52], cards: [2800, 1000, 480, 280], leaf: 5.6,
    shape: o => { o.branch.length[0] *= 0.95; o.branch.angle[1] = 40; o.branch.angle[2] = 44; o.branch.children[0] = 7; o.branch.children[2] = 2; o.branch.force.strength = 0.012; o.branch.start[1] = 0.42; },
  },
  vase: {                                             // gumbo limbo-like: a few big limbs opening like a vase, airy crown, coppery bark
    name: "Gumbo limbo", preset: "Oak Medium", tex: "round", tint: [0.95, 1, 0.9], bark: [0.86, 0.6, 0.48], cards: [2000, 800, 400, 240], leaf: 5.0,
    shape: o => { o.branch.length[0] *= 0.5; o.branch.radius[0] *= 1.25; o.branch.radius[1] *= 1.3; o.branch.angle[1] = 36; o.branch.angle[2] = 46; o.branch.length[1] *= 1.7; o.branch.children[0] = 4; o.branch.children[1] = 3; o.branch.children[2] = 2; o.branch.force.strength = 0.006; o.branch.start[1] = 0.3; o.leaves.start = 0.35; },
  },
  ball: {                                             // small clipped ornamental (black olive, ligustrum): a tight dark ball on a short stem
    name: "Black olive", preset: "Oak Small", tex: "liveoak", tint: [0.82, 0.95, 0.8], bark: [0.6, 0.58, 0.55], cards: [2000, 800, 380, 220], leaf: 3.4,
    shape: o => { o.branch.length[0] *= 0.55; o.branch.angle[1] = 62; o.branch.angle[2] = 66; o.branch.length[1] *= 1.3; o.branch.length[2] *= 0.75; o.branch.children[0] = 6; o.branch.children[1] = 3; o.branch.children[2] = 2; },
  },
  seagrape: {                                         // sea grape: low, sprawling, several stems, big round leaves
    name: "Sea grape", preset: "Oak Small", tex: "round", tint: [1, 1, 0.92], bark: [0.7, 0.62, 0.55], cards: [1500, 650, 320, 200], leaf: 4.2, squat: 0.8,
    shape: o => { o.branch.length[0] *= 0.3; o.branch.radius[0] *= 1.3; o.branch.angle[1] = 72; o.branch.angle[2] = 58; o.branch.length[1] *= 2.0; o.branch.children[0] = 6; o.branch.children[1] = 3; o.branch.children[2] = 2; o.branch.gnarliness[1] = 0.3; o.branch.force.strength = -0.02; },
  },
  pine: {                                             // slash pine / Australian pine: tall bare trunk, open tiers of needles
    name: "Pine", preset: "Oak Medium", tex: "pine", tint: [1, 1, 1], bark: [0.72, 0.52, 0.42], cards: [2400, 900, 420, 240], leaf: 9.5,
    shape: o => { o.branch.levels = 2; o.branch.length[0] *= 1.5; o.branch.radius[0] *= 0.85; o.branch.taper[0] = 0.8; o.branch.angle[1] = 68; o.branch.angle[2] = 50; o.branch.length[1] *= 1.3; o.branch.length[2] *= 0.8; o.branch.children[0] = 20; o.branch.children[1] = 5; o.branch.start[1] = 0.45; o.branch.gnarliness[0] = 0.02; o.branch.gnarliness[1] = 0.12; o.branch.force.strength = -0.004; o.leaves.start = 0.1; },
  },
  oak_tall: {                                         // laurel oak: taller, with a longer trunk and a high rounded crown
    name: "Laurel oak", preset: "Oak Medium", tex: "photo", tint: [0.77, 0.83, 0.66], bark: [0.7, 0.67, 0.63], cards: [2800, 1000, 480, 280], leaf: 5.4,
    shape: o => { o.branch.length[0] *= 0.85; o.branch.angle[1] = 50; o.branch.angle[2] = 56; o.branch.length[1] *= 1.2; o.branch.children[0] = 7; o.branch.children[2] = 2; o.branch.force.strength = 0.004; o.branch.start[1] = 0.45; },
  },
};

function broadleafGeo(form, v, lod) {
  const near = lod <= 1, i = near ? v % 2 : 0;
  return cached(`bl|${form}|${i}|${lod}`, () => {
    const F = BROADLEAF[form], tree = new Tree();
    tree.loadPreset(F.preset);
    const o = tree.options;
    o.seed = 4211 + PALM_KEYS.length * 131 + Object.keys(BROADLEAF).indexOf(form) * 7919 + i * 104729;
    F.shape(o);
    for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * (near ? 0.6 : 0.4)));
    for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(1, Math.round(o.branch.sections[k] * (near ? 0.6 : 0.3)));
    let twigs = 1;
    for (let l = 0; l < o.branch.levels; l++) twigs *= o.branch.children[l] + 1;   // + 1: each branch also carries on past its last child
    const want = F.cards[lod], base = F.cards[0];
    o.leaves.count = Math.max(1, Math.round(want / twigs));
    o.leaves.size = F.leaf * Math.sqrt(base / (o.leaves.count * twigs)) * (near ? 1 : 1.12);   // fewer sprays, each bigger: the crown covers the same area
    o.leaves.sizeVariance = 0.5;
    o.leaves.billboard = "single";
    // away from the hole the last level of twigs is thinner than a pixel and sits inside the leaves: grown (the leaves hang on
    // it) but not drawn. Branches are generated level by level, so the twigs are the tail of the buffers.
    let twigI = -1, twigV = -1;
    if (!near) {
      const gen = tree.generateBranch.bind(tree);
      tree.generateBranch = br => {
        if (twigI < 0 && br.level === o.branch.levels) { twigI = tree.branches.indices.length; twigV = tree.branches.verts.length / 3; }
        gen(br);
      };
    }
    tree.generate();
    let bGeo = tree.branchesMesh.geometry;
    const lGeo = tree.leavesMesh.geometry;
    if (twigI > 0) {
      const g1 = new THREE.BufferGeometry();
      for (const [name, n] of [["position", 3], ["normal", 3], ["uv", 2]]) g1.setAttribute(name, new THREE.BufferAttribute(bGeo.attributes[name].array.slice(0, twigV * n), n));
      g1.setIndex(new THREE.BufferAttribute(bGeo.index.array.slice(0, twigI), 1));
      bGeo.dispose();
      bGeo = g1;
    }
    tree.branchesMesh.material.dispose(); tree.leavesMesh.material.dispose();
    lGeo.computeBoundingBox(); bGeo.computeBoundingBox();
    const lb = lGeo.boundingBox, bb = lb.clone().union(bGeo.boundingBox);
    // Leaves are shaded as one rounded mass, not as hundreds of flat cards facing every way: each point is lit as if it faced
    // away from the middle of the crown, and is darker the deeper it sits inside and the lower it hangs.
    const mid = lb.getCenter(new THREE.Vector3()), half = lb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    mid.y -= half.y * 0.15;
    const p = lGeo.attributes.position, nrm = new Float32Array(p.count * 3), col = new Float32Array(p.count * 3), rc = rng(o.seed);
    for (let c = 0; c < p.count; c += 4) {
      const warm = rc(), k = 0.9 + 0.2 * rc();                                // each spray a touch lighter, darker, yellower or bluer
      for (let q = c; q < Math.min(c + 4, p.count); q++) {
        const d = V((p.getX(q) - mid.x) / half.x, (p.getY(q) - mid.y) / half.y, (p.getZ(q) - mid.z) / half.z), depth = Math.min(1, d.length());
        const n = d.normalize().multiplyScalar(0.8).addScaledVector(UP, 0.4).normalize();
        nrm[q * 3] = n.x; nrm[q * 3 + 1] = n.y; nrm[q * 3 + 2] = n.z;
        const shade = k * lerp(0.5, 1.06, depth * depth) * lerp(0.78, 1.04, clamp((p.getY(q) - lb.min.y) / (2 * half.y), 0, 1));
        col[q * 3] = shade * (0.94 + 0.14 * warm); col[q * 3 + 1] = shade; col[q * 3 + 2] = shade * (1.0 - 0.14 * warm);
      }
    }
    lGeo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    lGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const radius = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2, height = bb.max.y;
    // Banyan: prop roots, thin trunks dropping from the big limbs to the ground under the dome
    if (F.props && near) {
      const add = new Builder(), rp = rng(o.seed + 5), n = lod ? Math.ceil(F.props / 2) : F.props, S = 5;
      for (let q = 0; q < n; q++) {
        const a = (q / n) * Math.PI * 2 + rp() * 0.5, dist = radius * (0.2 + 0.28 * rp()), top = height * (0.4 + 0.12 * rp()), r0 = radius * (0.01 + 0.01 * rp());
        const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist, lean = (rp() - 0.5) * 0.12 * radius;
        const i0 = add.pos.length / 3;
        for (let ring = 0; ring <= 3; ring++) for (let j = 0; j <= S; j++) {
          const t = ring / 3, b = (j / S) * Math.PI * 2, rr = r0 * (1.5 - 0.6 * t);
          add.vert(V(cx + lean * t + Math.cos(b) * rr, top * t, cz + Math.sin(b) * rr), V(Math.cos(b), 0, Math.sin(b)), j / S, ring % 2, rgb(1, 1, 1));
        }
        for (let ring = 0; ring < 3; ring++) for (let j = 0; j < S; j++) { const a0 = i0 + ring * (S + 1) + j; add.quad(a0, a0 + S + 1, a0 + S + 2, a0 + 1); }
      }
      const P0 = bGeo.attributes.position.array, N0 = bGeo.attributes.normal.array, U0 = bGeo.attributes.uv.array, I0 = bGeo.index.array, off = P0.length / 3;
      const g1 = new THREE.BufferGeometry();
      g1.setAttribute("position", new THREE.Float32BufferAttribute([...P0, ...add.pos], 3));
      g1.setAttribute("normal", new THREE.Float32BufferAttribute([...N0, ...add.nrm], 3));
      g1.setAttribute("uv", new THREE.Float32BufferAttribute([...U0, ...add.uv], 2));
      g1.setIndex([...I0, ...add.idx.map(q => q + off)]);
      bGeo.dispose();
      bGeo = g1;
    }
    return { bGeo, lGeo, radius, height };
  });
}

// Which broadleaf form suits a tree of this crown radius r and height h (metres)
function broadleafForm(lng, lat, r, h) {
  const u = treeRand(lng, lat, 41), slim = h / (2 * r);       // > 1: taller than wide
  if (r >= 6.5) return u < 0.6 ? "banyan" : "oak_spread";
  if (slim >= 1.6 && h >= 8) return u < 0.7 ? "pine" : "upright";
  if (r >= 4.5) return u < 0.38 ? "oak_spread" : u < 0.7 ? "oak_round" : u < 0.85 ? "oak_tall" : "upright";
  if (r >= 3) return slim > 1.15 ? (u < 0.45 ? "upright" : u < 0.8 ? "oak_tall" : "pine") : u < 0.36 ? "oak_round" : u < 0.56 ? "oak_tall" : u < 0.72 ? "vase" : u < 0.88 ? "upright" : "oak_spread";
  return slim > 1.4 ? (u < 0.5 ? "upright" : u < 0.8 ? "oak_tall" : "pine") : u < 0.32 ? "ball" : u < 0.56 ? "seagrape" : u < 0.76 ? "vase" : "oak_round";
}

// Leaves and fronds are lit the same from both sides (a card seen from behind must not turn black), so the shader's
// "flip the normal on back faces" is switched off for them.
const sameBothSides = mat => { mat.onBeforeCompile = sh => { sh.fragmentShader = "#undef DOUBLE_SIDED\n" + sh.fragmentShader; }; return mat; };
// Smooth leaf edges on GFX HIGH (alpha to coverage) make the shader write "partly see-through" into the picture's alpha
// channel, and the map's canvas lets the page behind it show through wherever alpha is below 1: pale specks all over the
// foliage. So foliage is drawn with the alpha channel switched off.
export const keepOpaque = mesh => {
  mesh.onBeforeRender = r => r.getContext().colorMask(true, true, true, false);
  mesh.onAfterRender = r => r.getContext().colorMask(true, true, true, true);
  return mesh;
};

// ── Placing them ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// trees: the course's tree features. toLocal(lng, lat) -> [x, z] in the scene. tier(lng, lat) -> 0 near the hole, 1 beyond
// NEAR, 2 beyond FAR2. Returns the meshes to add to the scene.
export function buildTrees(trees, { toLocal, exaggeration = 1, low = false, tier = () => 0 }) {
  const out = [], dummy = new THREE.Object3D(), tmp = new THREE.Color(), tv = new THREE.Vector3(), ax = new THREE.Vector3(), qt = new THREE.Quaternion();
  const lodOf = t => (t === 0 ? (low ? 1 : 0) : t + 1);
  // Lambert (matt) shading for everything on a tree: leaves have no mirror-like shine worth drawing from here, and the grey
  // sheen the glossier material added washed the deep greens out to olive. It is also the cheapest lit shader for a phone.
  const leafOpts = { alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, alphaToCoverage: !low };
  const add = (mesh, shadow = true) => { mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.frustumCulled = false; out.push(mesh); return mesh; };
  const group = (map, key, item) => { if (!map.has(key)) map.set(key, []); map.get(key).push(item); };

  // Palms
  const crownMats = {}, crownMat = tex => (crownMats[tex] ||= sameBothSides(new THREE.MeshLambertMaterial({ ...leafOpts, map: tex === "fan" ? fanTexture() : frondTexture(tex) })));
  const trunkMat = new THREE.MeshLambertMaterial({ map: trunkTexture(), vertexColors: true });
  const byTrunk = new Map(), byCrown = new Map();
  for (const f of trees) {
    if (f.properties.type !== "palm") continue;
    const [lng, lat] = f.geometry.coordinates, h0 = f.properties.h, R = s => treeRand(lng, lat, s);
    const kind = palmKind(lng, lat, h0), K = PALMS[kind], lod = lodOf(tier(lng, lat)), v = Math.floor(R(33) * 12);
    // Height: most palms carry one of three default heights (7.0, 7.8, 8.6 m: found on the photo, never measured), spread here
    // over the kind's own range; a palm whose height was read off its shadow keeps it to within 4%.
    const guessed = [7, 7.8, 8.6].some(q => Math.abs(h0 - q) < 0.01);
    const h = h0 * (guessed ? lerp(K.hMul[0], K.hMul[1], R(34)) : 0.96 + 0.08 * R(34));
    const [x, z] = toLocal(lng, lat), y0 = (f.properties.z || 0) * exaggeration - 0.2;
    const item = { x, y0, z, h, rot: R(35) * Math.PI * 2, thick: 0.85 + 0.35 * R(36), size: lerp(K.size[0], K.size[1], R(37)) * clamp(Math.sqrt(h / 7.5), 0.8, 1.2), R, kind };
    group(byTrunk, `${kind}|${v % K.trunks.length}|${lod}`, item);
    item.trunkKey = `${kind}|${v % K.trunks.length}|${lod}`;
    group(byCrown, `${kind}|${lod >= 2 ? 0 : Math.floor(R(38) * K.crowns.length)}|${lod}|${v % K.trunks.length}`, item);
  }
  const trunkGeos = new Map();
  for (const [key, list] of byTrunk) {
    const [kind, v, lod] = key.split("|"), geo = palmTrunkGeo(kind, +v, +lod), mesh = add(new THREE.InstancedMesh(geo, trunkMat, list.length));
    trunkGeos.set(key, geo);
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y0, it.z); dummy.rotation.set(0, it.rot, 0); dummy.scale.set(it.thick, it.h, it.thick); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const k = 0.85 + 0.3 * it.R(39);
      mesh.setColorAt(i, tmp.setRGB(k, k * (0.97 + 0.06 * it.R(40)), k * 0.96));
    });
  }
  for (const [key, list] of byCrown) {
    const [kind, v, lod] = key.split("|"), K = PALMS[kind], geo = palmCrownGeo(kind, +v, +lod);
    const mesh = keepOpaque(add(new THREE.InstancedMesh(geo, crownMat(K.crown.tex), list.length)));
    list.forEach((it, i) => {
      const tg = trunkGeos.get(it.trunkKey), top = tg.userData.top, tilt = tg.userData.tilt;
      dummy.position.set(it.x, it.y0, it.z); dummy.rotation.set(0, it.rot, 0); dummy.scale.set(it.thick, it.h, it.thick); dummy.updateMatrix();
      tv.set(top[0], top[1], top[2]).applyMatrix4(dummy.matrix);
      // the crown sits on the end of the trunk and tips the way the trunk is leaning there
      dummy.position.copy(tv);
      const c = Math.cos(it.rot), sn = Math.sin(it.rot), dx = tilt[0] * c + tilt[1] * sn, dz = -tilt[0] * sn + tilt[1] * c, dl = Math.hypot(dx, dz);
      dummy.quaternion.setFromAxisAngle(UP, it.rot + (it.R(42) - 0.5));
      if (dl > 1e-4) dummy.quaternion.premultiply(qt.setFromAxisAngle(ax.set(dz / dl, 0, -dx / dl), Math.atan2(dl * it.thick, it.h) * 0.7));
      dummy.scale.setScalar(it.size); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const kc = 0.82 + 0.36 * it.R(43);                                    // some crowns lighter, some darker, warmer or cooler
      mesh.setColorAt(i, tmp.setRGB(kc * (0.94 + 0.14 * it.R(44)), kc, kc * (0.88 + 0.2 * it.R(45))));
    });
  }

  // Broadleaf trees
  const S = low ? 256 : 512, leafMats = {};
  const leafMat = tex => (leafMats[tex] ||= sameBothSides(new THREE.MeshLambertMaterial({ ...leafOpts, alphaTest: 0.5, map: tex === "photo" ? getLeafTexture("oak") : sprigTexture(tex, S) })));
  const barkMat = new THREE.MeshLambertMaterial({ map: getBarkTexture("oak", "color", { x: 1, y: 10 }), normalMap: low ? null : getBarkTexture("oak", "normal", { x: 1, y: 10 }) });
  const byForm = new Map();
  for (const f of trees) {
    if (f.properties.type === "palm") continue;
    const [lng, lat] = f.geometry.coordinates, { r, h } = f.properties;
    const form = broadleafForm(lng, lat, r, h), lod = lodOf(tier(lng, lat));
    group(byForm, `${form}|${lod <= 1 ? Math.floor(treeRand(lng, lat, 46) * 2) : 0}|${lod}`, f);
  }
  for (const [key, list] of byForm) {
    const [form, v, lod] = key.split("|"), F = BROADLEAF[form], G = broadleafGeo(form, +v, +lod);
    const branches = add(new THREE.InstancedMesh(G.bGeo, barkMat, list.length)), leaves = keepOpaque(add(new THREE.InstancedMesh(G.lGeo, leafMat(F.tex), list.length)));
    list.forEach((f, i) => {
      const [lng, lat] = f.geometry.coordinates, { r, h } = f.properties, R = s => treeRand(lng, lat, s);
      const [x, z] = toLocal(lng, lat), y0 = (f.properties.z || 0) * exaggeration;
      // sized to the measured crown: as wide as traced, and as tall as measured within what the form can take without
      // looking stretched or squashed
      const s = (r * 1.1) / G.radius, sy = clamp((Math.max(h, 2.5) * 1.2) / G.height, s * 0.72, s * 1.3);
      dummy.position.set(x, y0 - 0.2, z); dummy.rotation.set(0, R(47) * Math.PI * 2, 0); dummy.scale.set(s, sy, s); dummy.updateMatrix();
      branches.setMatrixAt(i, dummy.matrix); leaves.setMatrixAt(i, dummy.matrix);
      const kb = 0.85 + 0.3 * R(48);
      branches.setColorAt(i, tmp.setRGB(F.bark[0] * kb, F.bark[1] * kb, F.bark[2] * kb));
      const k = 0.84 + 0.3 * R(49);                                           // each tree its own shade of green
      leaves.setColorAt(i, tmp.setRGB(F.tint[0] * k * (0.92 + 0.14 * R(50)), F.tint[1] * k, F.tint[2] * k * (0.84 + 0.16 * R(51))));
    });
  }
  return out;
}

// For the tree catalogue page (tools/course3d/preview/catalog.html): one of everything
export function catalog(lod = 0) {
  const palms = [], broad = [];
  for (const kind of PALM_KEYS) PALMS[kind].crowns.forEach((_, i) => palms.push({ kind, name: PALMS[kind].name, crown: palmCrownGeo(kind, i, lod), trunk: palmTrunkGeo(kind, i, lod), tex: PALMS[kind].crown.tex, h: 7.8 * (PALMS[kind].hMul[0] + PALMS[kind].hMul[1]) / 2 }));
  for (const form of Object.keys(BROADLEAF)) for (const v of lod <= 1 ? [0, 1] : [0]) broad.push({ form, name: BROADLEAF[form].name, ...broadleafGeo(form, v, lod), F: BROADLEAF[form] });
  return { palms, broad, frondTexture, fanTexture, trunkTexture, sprigTexture, sameBothSides, photoLeaf: getLeafTexture("oak"), bark: getBarkTexture("oak", "color", { x: 1, y: 10 }) };
}
