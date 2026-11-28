// Splits public/course3d/course.json into one small file per hole, so a phone only ever downloads and builds the
// part of the property around the hole being played (the whole property at once ran iPhones out of memory).
//
//   /course3d/index.json      { holes: [...] }                      which holes have 3D graphics
//   /course3d/hole/<n>.json   the course data cut to hole n's area   (same shape as course.json)
//
// Run by the Vite plugin in vite.config.js on every build (and served on the fly by `npm run dev`), so
// build.py keeps writing course.json exactly as before.

const M = 111320;                 // metres per degree of latitude
export const HOLE_MARGIN = 250;   // metres of the property kept either side of the hole (full-detail trees reach 160 m)

const bboxOf = (coords, b = [Infinity, Infinity, -Infinity, -Infinity]) => {
  if (typeof coords[0] === "number") {
    b[0] = Math.min(b[0], coords[0]); b[1] = Math.min(b[1], coords[1]);
    b[2] = Math.max(b[2], coords[0]); b[3] = Math.max(b[3], coords[1]);
  } else coords.forEach(c => bboxOf(c, b));
  return b;
};
const hits = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

// Metres from a point to the hole's line (back tees -> fairway centreline -> green)
function lineDist(line, lng, lat) {
  const k = Math.cos(lat * Math.PI / 180), P = [lng * M * k, lat * M];
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const A = [line[i][0] * M * k, line[i][1] * M], B = [line[i + 1][0] * M * k, line[i + 1][1] * M];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy));
  }
  return best;
}

// Keep a shape (or part of one) when it is near the hole: small things (trees, houses, bunkers, pools) by their
// distance from the hole's line, big ones (the course-wide rough, roads, hedge rows) when they reach into the area.
// Multi-part shapes keep only the parts that do.
function near(coords, line, box) {
  const b = bboxOf(coords);
  if (!hits(b, box)) return false;
  const k = Math.cos(b[1] * Math.PI / 180), size = Math.hypot((b[2] - b[0]) * M * k, (b[3] - b[1]) * M);
  return size > 80 || lineDist(line, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2) <= HOLE_MARGIN + size / 2;
}
function cut(f, line, box) {
  const g = f.geometry;
  if (g.type === "MultiPolygon" || g.type === "MultiLineString") {
    const parts = g.coordinates.filter(p => near(p, line, box));
    if (!parts.length) return null;
    return parts.length === g.coordinates.length ? f : { ...f, geometry: { ...g, coordinates: parts } };
  }
  return near(g.coordinates, line, box) ? f : null;
}
const centre = f => { const b = bboxOf(f.geometry.coordinates); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };

// The ground-height grid cut to the box (heights are int16 centimetres, base64, row 0 = north)
function cutGrid(grid, box) {
  const [w, s, e, n] = grid.bounds, W = grid.w, H = grid.h;
  const col = lng => (lng - w) / (e - w) * (W - 1), row = lat => (n - lat) / (n - s) * (H - 1);
  const x0 = Math.max(0, Math.floor(col(box[0])) - 1), x1 = Math.min(W - 1, Math.ceil(col(box[2])) + 1);
  const y0 = Math.max(0, Math.floor(row(box[3])) - 1), y1 = Math.min(H - 1, Math.ceil(row(box[1])) + 1);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  const src = Buffer.from(grid.cm, "base64"), nw = x1 - x0 + 1, nh = y1 - y0 + 1, out = Buffer.alloc(nw * nh * 2);
  for (let y = 0; y < nh; y++) src.copy(out, y * nw * 2, ((y0 + y) * W + x0) * 2, ((y0 + y) * W + x1 + 1) * 2);
  const lngAt = x => w + x / (W - 1) * (e - w), latAt = y => n - y / (H - 1) * (n - s);
  return { bounds: [lngAt(x0), latAt(y1), lngAt(x1), latAt(y0)], w: nw, h: nh, cm: out.toString("base64") };
}

export function splitCourse(course) {
  const feats = course.features;
  // every green's centre, for the hole-number badges shown when zoomed out over the whole course
  const badges = feats.filter(f => f.properties.kind === "green" && f.properties.hole).map(f => {
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    return { n: f.properties.hole, c: ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length], [0, 0]) };
  });
  const holes = {};
  for (const n of course.holes) {
    const own = feats.filter(f => f.properties.hole === n);
    const green = own.find(f => f.properties.kind === "green"), tees = own.filter(f => f.properties.kind === "tee");
    if (!green || !tees.length) continue;
    // the hole's line: from the tee farthest from the green, along the fairway centreline, to the green
    const g = centre(green), far = tees.map(centre).sort((p, q) => lineDist([q, q], ...g) - lineDist([p, p], ...g));
    const spine = own.find(f => f.properties.kind === "spine")?.geometry.coordinates || [];
    const line = [...far, ...spine, g];
    const b = bboxOf(line);
    const k = Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180);
    const dLng = HOLE_MARGIN / (M * k), dLat = HOLE_MARGIN / M;
    const box = [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat];
    const features = feats.map(f => (f.properties.kind === "outline" ? f : cut(f, line, box))).filter(Boolean);
    const terrain = course.terrain && { ...course.terrain };
    if (terrain?.grid) { const g = cutGrid(terrain.grid, box); if (g) terrain.grid = g; }
    holes[n] = { type: course.type, holes: course.holes, hole: n, area: box, terrain, badges, features };
  }
  return { index: { holes: course.holes.filter(n => holes[n]) }, holes };
}
