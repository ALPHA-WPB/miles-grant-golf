// Close-up detail for the hole being played: its own fairway, green and tee boxes.
//
// The turf patterns (realScene.js GROUND_TEXTURES) repeat every few metres, so every fairway, green and tee on the course
// was the same even wash. Now that only one hole is loaded at a time, each hole gets pictures made just for it when it
// opens, pinned to the ground and cut to the traced outline:
//
//   fairway  broad lush and dry patches, the mower's individual passes, a second cut at an angle (different on every
//            hole), and divots where shots are played from: thick in the landing and lay-up areas, thin elsewhere
//   green    the mowing pattern (diamond, square, single cut or diagonal, by hole), soft mottling, old cup plugs, ball marks
//   tees     mower passes along the box and the scuffed, sand-filled strip between the markers
//
// Each is one see-through image (no repeating tile, no triangles, no per-frame work). A fill pattern costs memory once per
// map tile; an image like this costs it once, which is why GFX LOW gets these too, at half the resolution.

const M_LAT = 110574, M_LNG = 111320;
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
// smooth noise in metres
function vnoise(x, y, cell, seed) {
  const gx = x / cell, gy = y / cell, xi = Math.floor(gx), yi = Math.floor(gy), sm = t => t * t * (3 - 2 * t), u = sm(gx - xi), v = sm(gy - yi);
  return (hash3(xi, yi, seed) * (1 - u) + hash3(xi + 1, yi, seed) * u) * (1 - v) + (hash3(xi, yi + 1, seed) * (1 - u) + hash3(xi + 1, yi + 1, seed) * u) * v;
}
const ringsOf = f => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);

// A drawing board laid on the ground, turned to face down the hole: up the canvas is toward the green.
// pts: [lng, lat] points it must cover; bearing: degrees from north; maxPx: the long side in pixels; finest: m per pixel floor
function board(pts, bearing, pad, maxPx, finest) {
  const lng0 = pts[0][0], lat0 = pts[0][1], kx = M_LNG * Math.cos(lat0 * Math.PI / 180), b = bearing * Math.PI / 180;
  const u = [Math.sin(b), Math.cos(b)], r = [Math.cos(b), -Math.sin(b)];           // along the hole, and to its right (east, north)
  const local = ([lng, lat]) => { const e = (lng - lng0) * kx, n = (lat - lat0) * M_LAT; return [e * u[0] + n * u[1], e * r[0] + n * r[1]]; };
  let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (const p of pts) { const [a, c] = local(p); a0 = Math.min(a0, a); a1 = Math.max(a1, a); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  a0 -= pad; a1 += pad; c0 -= pad; c1 += pad;
  const mpp = Math.max(finest, Math.max(a1 - a0, c1 - c0) / maxPx), W = Math.max(8, Math.round((c1 - c0) / mpp)), H = Math.max(8, Math.round((a1 - a0) / mpp));
  const ll = (a, c) => { const e = a * u[0] + c * r[0], n = a * u[1] + c * r[1]; return [lng0 + e / kx, lat0 + n / M_LAT]; };
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  return {
    cv, x: cv.getContext("2d"), W, H, mpp, a0, a1,
    xy: p => { const [a, c] = local(p); return [(c - c0) / mpp, (a1 - a) / mpp]; },   // lng/lat -> pixel
    along: py => a1 - py * mpp,                                                      // pixel row -> metres along the hole
    coordinates: [ll(a1, c0), ll(a1, c1), ll(a0, c1), ll(a0, c0)],                   // top-left, top-right, bottom-right, bottom-left
  };
}
// keep only what lies inside the outlines, and hand back the finished picture
function finish(B, polys) {
  const x = B.x;
  x.globalCompositeOperation = "destination-in";
  x.globalAlpha = 1;
  x.beginPath();
  for (const poly of polys) for (const ring of poly) {
    ring.forEach((p, q) => { const [X, Y] = B.xy(p); if (q) x.lineTo(X, Y); else x.moveTo(X, Y); });
    x.closePath();
  }
  x.fill("evenodd");
  const out = { url: B.cv.toDataURL("image/png"), coordinates: B.coordinates };
  B.cv.width = B.cv.height = 0;      // the picture now lives in the PNG; give the canvas memory back
  return out;
}
// light and dark tone as see-through pixels: v < 0 darkens (lusher grass), v > 0 lightens (thinner, drier grass)
function tone(B, fn, dark, light) {
  const img = B.x.createImageData(B.W, B.H), d = img.data, m = B.mpp;
  for (let j = 0; j < B.H; j++) for (let i = 0; i < B.W; i++) {
    const v = fn(i * m, j * m), k = (j * B.W + i) * 4, c = v < 0 ? dark : light;
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = Math.min(c[3], Math.abs(v)) * 255;
  }
  B.x.putImageData(img, 0, 0);
}
// parallel mower passes across the whole board: every other pass a little lighter, with a soft join
function passes(B, angle, width, alpha, lightRGB = "235,248,170", darkRGB = "20,60,20") {
  const x = B.x, R = Math.hypot(B.W, B.H), w = width / B.mpp;
  x.save();
  x.translate(B.W / 2, B.H / 2); x.rotate(angle);
  for (let i = Math.floor(-R / w) - 1, n = 0; i * w < R; i++, n++) {
    x.fillStyle = `rgba(${n % 2 ? lightRGB : darkRGB},${alpha})`;
    x.fillRect(i * w, -R, w, 2 * R);
  }
  x.restore();
}
// one divot: a short scar pointing down the line of play; most are filled with sand and seed, some are fresh
function divot(B, r, X, Y, len, aim) {
  const x = B.x, l = len / B.mpp, w = l * (0.42 + 0.2 * r()), a = aim + (r() - 0.5) * 0.7, filled = r() < 0.62;
  x.save();
  x.translate(X, Y); x.rotate(a);
  x.fillStyle = filled ? `rgba(${222 + r() * 16},${208 + r() * 14},${160 + r() * 20},${0.7 + r() * 0.25})` : `rgba(${96 + r() * 20},${72 + r() * 14},${40 + r() * 12},${0.65 + r() * 0.25})`;
  x.beginPath(); x.ellipse(0, 0, w / 2, l / 2, 0, 0, Math.PI * 2); x.fill();
  if (l > 4) { x.strokeStyle = "rgba(30,60,24,0.22)"; x.lineWidth = Math.max(0.6, l * 0.06); x.beginPath(); x.ellipse(0, 0, w / 2, l / 2, 0, 0, Math.PI * 2); x.stroke(); }
  x.restore();
}

// The fairway of one hole. yards: the hole's length from the tees in play (for where shots land).
export function fairwayDetail(features, hole, bearing, yards, low) {
  const fs = features.filter(f => f.properties.kind === "fairway" && f.properties.hole === hole);
  if (!fs.length) return null;
  const polys = fs.flatMap(ringsOf), B = board(polys.flatMap(p => p[0]), bearing, 1, low ? 1024 : 2048, low ? 0.1 : 0.05), r = rng(hole * 7919 + 13), s = hole * 17;
  // broad patches (30 m), smaller ones (9 m) and a fine grain: lush dark and dry light
  tone(B, (px, py) => ((vnoise(px, py, 30, s + 1) - 0.5) * 0.5 + (vnoise(px, py, 9, s + 2) - 0.5) * 0.34 + (vnoise(px, py, 2.4, s + 3) - 0.5) * 0.16 + (hash3(Math.floor(px / B.mpp), Math.floor(py / B.mpp), s) - 0.5) * 0.05),
    [14, 62, 20, 0.2], [214, 222, 118, 0.2]);
  const x = B.x;
  x.globalCompositeOperation = "source-over";
  // the mower's single passes (0.56 m reels) down the hole, and a second, wider cut at an angle that differs hole by hole
  passes(B, 0, 0.56, 0.045);
  const cut = [0.62, -0.62, 0.38, -0.38, 0.9, -0.9, 0.5, -0.5][hole % 8];
  passes(B, cut, 2.4 + (hole % 3) * 0.5, 0.075);
  // divots: where tee shots finish (about 200-250 yards out on a long hole), where lay-ups and approaches are played from
  // (150 down to 70 yards from the green), and a thin scatter everywhere else
  const len = yards / 1.09361, total = B.a1 - B.a0;
  const zones = len > 250 ? [[len * 0.5 - 20, len * 0.5 + 35, 1], [len - 140, len - 65, 0.8]] : [];
  const fromTee = py => B.along(py) - B.a0 + (len - total) * 0.5;            // metres from the tee, near enough (the board starts where the fairway does)
  const area = B.W * B.H * B.mpp * B.mpp, n = Math.round(area / (low ? 9 : 5));
  for (let i = 0; i < n; i++) {
    const X = r() * B.W, Y = r() * B.H, d = fromTee(Y);
    const heat = zones.reduce((h, [a, b, k]) => Math.max(h, d > a && d < b ? k : 0), 0.06);
    if (r() > heat) continue;
    divot(B, r, X, Y, 0.18 + 0.16 * r(), 0);
  }
  return finish(B, polys);
}

// The green of one hole: its own mowing pattern, mottling, old cup plugs and ball marks
export function greenDetail(features, hole, bearing, low) {
  const f = features.find(q => q.properties.kind === "green" && q.properties.hole === hole);
  if (!f) return null;
  const polys = ringsOf(f), B = board(polys.flatMap(p => p[0]), bearing, 0.5, low ? 512 : 1024, low ? 0.06 : 0.03), r = rng(hole * 104729 + 7), s = hole * 31;
  // 0 diamond, 1 square to the line of play, 2 one cut down the line, 3 one cut on the diagonal: no two neighbouring holes alike
  const style = (hole * 3 + 1) % 4, mow = 1.3 + ((hole * 5) % 4) * 0.12, soft = 0.09;
  const a1 = [Math.PI / 4, 0, 0, 0.6][style], a2 = style < 2 ? a1 + Math.PI / 2 : null;
  const set = (px, py, a) => { const t = (px * Math.cos(a) + py * Math.sin(a)) / mow, fr = t - Math.floor(t), edge = Math.min(fr, 1 - fr) * mow; return (Math.floor(t) % 2 ? 1 : -1) * Math.min(1, edge / soft); };
  tone(B, (px, py) => {
    const cutV = a2 == null ? set(px, py, a1) * 0.13 : (set(px, py, a1) + set(px, py, a2)) * 0.085;
    return cutV + (vnoise(px, py, 5, s + 1) - 0.5) * 0.14 + (vnoise(px, py, 1.1, s + 2) - 0.5) * 0.07 + (hash3(Math.floor(px / B.mpp), Math.floor(py / B.mpp), s) - 0.5) * 0.03;
  }, [18, 70, 26, 0.26], [236, 250, 176, 0.26]);
  const x = B.x;
  x.globalCompositeOperation = "source-over";
  const spot = () => [B.W * (0.12 + 0.76 * r()), B.H * (0.12 + 0.76 * r())];
  for (let i = 0; i < 6; i++) {                        // where the hole was cut on other days: a plug a shade off the turf round it
    const [X, Y] = spot(), rad = 0.054 / B.mpp;
    x.fillStyle = r() < 0.5 ? "rgba(196,226,138,0.45)" : "rgba(74,120,56,0.4)"; x.beginPath(); x.arc(X, Y, rad, 0, 7); x.fill();
    x.strokeStyle = "rgba(40,84,34,0.4)"; x.lineWidth = Math.max(0.5, rad * 0.25); x.beginPath(); x.arc(X, Y, rad, 0, 7); x.stroke();
  }
  for (let i = 0; i < (low ? 14 : 30); i++) {          // ball marks
    const [X, Y] = spot(), rad = (0.02 + 0.015 * r()) / B.mpp;
    x.fillStyle = `rgba(${150 + r() * 40},${150 + r() * 30},${84 + r() * 20},${0.3 + r() * 0.25})`; x.beginPath(); x.arc(X, Y, Math.max(0.7, rad), 0, 7); x.fill();
  }
  return finish(B, polys);
}

// The tee boxes of one hole: mown along their length, scuffed and sand-filled between the markers
export function teeDetail(features, hole, bearing, low) {
  const out = [];
  features.filter(q => q.properties.kind === "tee" && q.properties.hole === hole && q.geometry.type === "Polygon").forEach((f, t) => {
    const polys = ringsOf(f), B = board(polys[0][0], bearing, 0.3, low ? 384 : 768, low ? 0.07 : 0.035), r = rng(hole * 613 + t * 97 + 3), s = hole * 53 + t;
    tone(B, (px, py) => (vnoise(px, py, 4, s + 1) - 0.5) * 0.2 + (vnoise(px, py, 0.9, s + 2) - 0.5) * 0.1, [16, 66, 22, 0.16], [226, 236, 150, 0.16]);
    const x = B.x;
    x.globalCompositeOperation = "source-over";
    passes(B, 0, 0.56, 0.12);
    // the strip in use (set a third of the way back on this box, a different third on each): worn pale, thick with divots
    const band = B.H * (0.3 + 0.4 * r()), deep = 2.2 / B.mpp;
    const g = x.createLinearGradient(0, band - deep, 0, band + deep);
    g.addColorStop(0, "rgba(206,200,140,0)"); g.addColorStop(0.5, "rgba(206,200,140,0.3)"); g.addColorStop(1, "rgba(206,200,140,0)");
    x.fillStyle = g; x.fillRect(0, band - deep, B.W, 2 * deep);
    for (let i = 0; i < (low ? 50 : 110); i++) divot(B, r, r() * B.W, band + (r() + r() - 1) * deep, 0.18 + 0.16 * r(), 0);
    out.push(finish(B, polys));
  });
  return out;
}
