import fs from "node:fs";
const noop = new Proxy(function () {}, { get: (t, p) => p === "data" ? new Uint8ClampedArray(4) : noop, apply: () => noop, construct: () => noop });
const ctx = new Proxy({}, { get: (t, p) => p === "createImageData" || p === "getImageData" ? (w, h, a, b) => ({ data: new Uint8ClampedArray((a || w) * (b || h) * 4) }) : p === "createLinearGradient" ? () => ({ addColorStop() {} }) : (typeof p === "string" ? () => {} : undefined), set: () => true });
const mkEl = () => ({ style: {}, getContext: () => ctx, addEventListener() {}, removeEventListener() {}, set src(v) {}, width: 0, height: 0 });
globalThis.document = { createElement: mkEl, createElementNS: (_, n) => mkEl() };
globalThis.window = globalThis;
globalThis.self = globalThis;
const { createRealisticLayer } = await import(process.env.SCENE);
const course = JSON.parse(fs.readFileSync(process.env.COURSE, "utf8"));
const src = fs.readFileSync(process.env.APP, "utf8"), holes = [];
for (const m of src.matchAll(/number:\s*(\d+),[\s\S]*?tees:\s*\{([\s\S]*?)\},\s*green:\s*\{\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)/g)) {
  const tees = [...m[2].matchAll(/lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)/g)].map(q => ({ lat: +q[1], lng: +q[2] }));
  holes.push({ number: +m[1], tee: tees[0], green: { lat: +m[3], lng: +m[4] } });
}
const out = {};
for (const low of [false, true]) {
  for (const h of holes) {
    const tees = h.tees || [];
    const t = h.tee || tees[tees.length - 1] || tees[0];
    const layer = createRealisticLayer(course, 1, null, null, "x", low, [[t.lng, t.lat], [h.green.lng, h.green.lat]]);
    try { layer.onAdd({ getCanvas: () => ({}), triggerRepaint() {} }, {}); } catch (e) { if (!globalThis.__mggSceneStats) throw e; }
    const s = globalThis.__mggSceneStats; globalThis.__mggSceneStats = null;
    (out[low ? "LOW" : "HIGH"] ||= []).push([h.number, s.triangles, s.meshes]);
  }
}
for (const k of Object.keys(out)) {
  const a = out[k].map(x => x[1]);
  console.log(k, "min", Math.min(...a), "max", Math.max(...a), "per hole", out[k].map(x => `${x[0]}:${(x[1] / 1e6).toFixed(2)}`).join(" "));
  const worst = out[k].reduce((p, c) => c[1] > p[1] ? c : p);
  console.log(" worst hole", worst[0], JSON.stringify(worst[2]));
}
for (const k of Object.keys(out)) for (const n of [1, 7]) { const h = out[k].find(x => x[0] === n); console.log(k, "hole", n, h[1], h[2].map(m => m.join("/")).join("  ")); }
