import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createRealisticLayer, GROUND_TEXTURES } from "./realScene";

// Illustrated, tilted 3D view of a hole: drawn fairways, greens, bunkers and water
// (public/course3d/course.json), low-poly trees and houses, plus the same overlays as
// the satellite map (yardage arcs, press-and-hold rangefinder, shots, GPS, radar).

const M = 111320;            // meters per degree of latitude
const PITCH = 48;            // standard overview tilt
// Camera angle presets, cycled by the Angle button
const ANGLES = [
  { key: "std", label: "STD", pitch: PITCH },
  { key: "low", label: "LOW", pitch: 66 },
  { key: "ground", label: "GROUND", pitch: 82 },
  { key: "top", label: "TOP", pitch: 0 },
];
const FLY_EYE = 9;           // fly-through camera height: about 30 ft
const STAND_EYE = 2;         // "look from a spot" camera height: standing eye level
const FLAG_ROOM = 56;        // the flag stands above the green, so leave space at the top

// Ground height (meters, already exaggerated like the map's terrain) from the course's
// compact height grid; 0 where there's no grid
const terrainCache = new WeakMap();
function terrainOf(course) {
  if (terrainCache.has(course)) return terrainCache.get(course);
  const t = course.terrain, E = t?.exaggeration || 1;
  let height = () => 0;
  if (t?.grid) {
    const g = t.grid, bin = atob(g.cm), cm = new Int16Array(bin.length / 2);
    for (let i = 0; i < cm.length; i++) cm[i] = ((bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16) >> 16;
    const [w, s, e, n] = g.bounds;
    height = (lng, lat) => {
      const x = (lng - w) / (e - w) * (g.w - 1), y = (n - lat) / (n - s) * (g.h - 1);
      const x0 = Math.floor(x), y0 = Math.floor(y);
      if (x0 < 0 || y0 < 0 || x0 >= g.w - 1 || y0 >= g.h - 1) return 0;
      const fx = x - x0, fy = y - y0, at = (i, j) => cm[j * g.w + i] / 100;
      return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
    };
  }
  const out = { E, ground: (lng, lat) => height(lng, lat) * E };
  terrainCache.set(course, out);
  return out;
}
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t); };

// Convex hull (for a house's shadow: its footprint swept away from the sun)
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const h = lo.slice(0, -1).concat(up.slice(0, -1));
  return [...h, h[0]];
}

// Walking path for the fly-through: tee → fairway centerline (follows doglegs) → green,
// smoothed with a Catmull-Rom curve. at(s) gives the point s meters along it.
function walkPath(tee, green, spine) {
  const k = Math.cos(tee.lat * Math.PI / 180);
  const toM = p => [(p.lng - tee.lng) * M * k, (p.lat - tee.lat) * M];
  const toLL = ([x, y]) => ({ lng: tee.lng + x / (M * k), lat: tee.lat + y / M });
  const toGreen = p => haversineYards(p.lat, p.lng, green.lat, green.lng);
  const teeDist = toGreen(tee);
  const mids = spine.filter(p => toGreen(p) < teeDist - 15 && toGreen(p) > 20);
  const ctrl = [tee, ...mids, green].map(toM);
  const pts = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let j = 0; j < 16; j++) {
      const t = j / 16, t2 = t * t, t3 = t2 * t;
      pts.push([0, 1].map(d => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = s => {
    if (s <= 0) {   // behind the tee: extend the first stretch backwards
      const [a, b] = pts, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return toLL([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]);
    }
    if (s >= total) return toLL(pts[pts.length - 1]);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid; else hi = mid; }
    const f = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return toLL([pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f]);
  };
  return { at, total };
}
const EMPTY = { type: "FeatureCollection", features: [] };
const flown = new Set();     // holes whose tee-to-green fly-over already played this session

const yds2m = y => y / 1.09361;
function haversineYards(lat1, lng1, lat2, lng2) {
  const R = 6371000, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lng2 - lng1) * Math.PI / 360) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a)) * 1.09361;
}
function bearingOf(a, b) {
  const dL = (b.lng - a.lng) * Math.PI / 180, p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
  const y = Math.sin(dL) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dL);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function destPoint(lat, lng, brg, yards) {
  const d = yds2m(yards) / 6371000, br = brg * Math.PI / 180, p1 = lat * Math.PI / 180, l1 = lng * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * 180 / Math.PI, lng: l2 * 180 / Math.PI };
}
function teeOf(hole, tee) {
  const t = hole.tees[tee];
  return t && isFinite(t.lat) && isFinite(t.lng) ? t : hole.tees.mens;
}

// ── Low-poly trees ────────────────────────────────────────────────────────
function ngon(lng, lat, r, n, rot) {
  const k = Math.cos(lat * Math.PI / 180), pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + 2 * Math.PI * i / n;
    pts.push([lng + r * Math.cos(a) / (M * k), lat + r * Math.sin(a) / M]);
  }
  pts.push(pts[0]);
  return [pts];
}
function starPoly(lng, lat, rOut, rIn, n, rot) {
  const k = Math.cos(lat * Math.PI / 180), pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + Math.PI * i / n, r = i % 2 ? rIn : rOut;
    pts.push([lng + r * Math.cos(a) / (M * k), lat + r * Math.sin(a) / M]);
  }
  pts.push(pts[0]);
  return [pts];
}
function buildTrees(features) {
  const solids = [], shadows = [];
  const P = (coordinates, props) => ({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates } });
  features.forEach((f, i) => {
    const [lng, lat] = f.geometry.coordinates;
    const { r, h, type } = f.properties;
    const k = Math.cos(lat * Math.PI / 180), rot = (i * 0.618) % (Math.PI / 4);
    const shade = Math.max(r, 1.6);
    // The sun is to the south in this imagery, so shadows fall to the north
    shadows.push(P(ngon(lng - 0.1 * shade / (M * k), lat + 0.55 * shade / M, shade * 1.05, 12, rot), {}));
    if (type === "palm") {
      solids.push(P(ngon(lng, lat, 0.16, 6, rot), { b: 0, t: h - 0.4, c: 9 }));
      const fr = Math.max(Math.min(r, 2.0), 1.3);
      solids.push(P(starPoly(lng, lat, fr, fr * 0.32, 7, rot), { b: h - 0.8, t: h - 0.4, c: 3 }));
      solids.push(P(ngon(lng, lat, 0.4, 6, rot), { b: h - 0.5, t: h, c: 4 }));
      return;
    }
    // Broadleaf tree: a stack of shrinking round tiers gives a domed crown; wide trees
    // (live oaks and banyans) get extra lobes so they read as one broad, lumpy canopy.
    const c = i % 3, n = r > 6 ? 14 : 10;
    solids.push(P(ngon(lng, lat, 0.3 + r * 0.06, 6, rot), { b: 0, t: h * 0.5, c: 9 }));
    [[0.82, 0.30, 0.52], [1.0, 0.50, 0.74], [0.78, 0.72, 0.90], [0.45, 0.88, 1.0]].forEach(([rf, b, t], j) =>
      solids.push(P(ngon(lng, lat, r * rf, n, rot + j * 0.3), { b: h * b, t: h * t, c })));
    if (r > 6) {
      const lobes = 5;
      for (let j = 0; j < lobes; j++) {
        const a = rot + j * 2 * Math.PI / lobes, off = r * 0.52;
        const lx = lng + off * Math.cos(a) / (M * k), ly = lat + off * Math.sin(a) / M;
        solids.push(P(ngon(lx, ly, r * 0.5, 10, a), { b: h * 0.42, t: h * (0.78 + 0.06 * (j % 2)), c: (c + j) % 3 }));
      }
    }
  });
  return { solids: { type: "FeatureCollection", features: solids }, shadows: { type: "FeatureCollection", features: shadows } };
}

// ── Map style ─────────────────────────────────────────────────────────────
function buildStyle(course) {
  const ground = { type: "FeatureCollection", features: course.features.filter(f => f.properties.kind !== "tree") };
  const trees = buildTrees(course.features.filter(f => f.properties.kind === "tree"));
  const kind = k => ["==", ["get", "kind"], k];
  const fill = (id, k, color, extra = {}) => ({ id, type: "fill", source: "ground", filter: kind(k), paint: { "fill-color": color, "fill-antialias": true, ...extra } });
  const roadW = ["match", ["get", "cls"], "tertiary", 11, "residential", 7, "service", 4.5, 6];
  const houseShadows = { type: "FeatureCollection", features: course.features.filter(f => f.properties.kind === "building").map(f => {
    const ring = f.geometry.coordinates[0], lat = ring[0][1], k = Math.cos(lat * Math.PI / 180);
    const off = (f.properties.h > 7 ? 7.5 : 4.2);   // wall + roof height × sun angle
    const moved = ring.map(([x, y]) => [x - 0.12 * off / (M * k), y + 0.75 * off / M]);
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [hull([...ring, ...moved])] } };
  }) };
  const terr = course.terrain;
  const demSource = terr && { type: "raster-dem", tiles: [location.origin + terr.tiles], encoding: "terrarium", tileSize: 256,
    minzoom: terr.minzoom, maxzoom: terr.maxzoom, bounds: terr.bounds };
  return {
    version: 8,
    ...(terr ? { terrain: { source: "dem", exaggeration: terr.exaggeration } } : {}),
    sources: {
      ...(terr ? { dem: demSource, demShade: { ...demSource } } : {}),
      houseShadows: { type: "geojson", data: houseShadows },
      ground: { type: "geojson", data: ground },
      treeShadows: { type: "geojson", data: trees.shadows },
      trees: { type: "geojson", data: trees.solids },
      guide: { type: "geojson", data: EMPTY },
      arcs: { type: "geojson", data: EMPTY },
      shots: { type: "geojson", data: EMPTY },
      measure: { type: "geojson", data: EMPTY },
    },
    sky: { "sky-color": "#8ccbf0", "horizon-color": "#e3f2f8", "fog-color": "#e8f1ea", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.9, "atmosphere-blend": 0 },
    light: { anchor: "map", position: [1.4, 135, 40], intensity: 0.38, color: "#ffffff" },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#cdd6c1" } },
      fill("course", "course", "#4d9a45"),
      fill("water", "water", "#4aa6dc"),
      fill("pool", "pool", "#6fcbee"),
      { id: "road-case", type: "line", source: "ground", filter: kind("road"), layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#b4ae9e", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 15, ["*", roadW, 0.3], 20, ["*", roadW, 9.6]] } },
      { id: "road", type: "line", source: "ground", filter: kind("road"), layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f3efe4", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 15, ["*", roadW, 0.24], 20, ["*", roadW, 8]] } },
      fill("fairway", "fairway", "#79c552"),
      fill("stripe", "stripe", "#86d05e"),
      { id: "fairway-edge", type: "line", source: "ground", filter: kind("fairway"), paint: { "line-color": "#4f9a45", "line-width": 6, "line-blur": 5, "line-opacity": 0.75 } },
      fill("fringe", "fringe", "#62b348"),
      fill("green", "green", "#a3e672"),
      { id: "green-edge", type: "line", source: "ground", filter: kind("green"), paint: { "line-color": "#6cba4d", "line-width": 3, "line-blur": 3, "line-opacity": 0.8 } },
      fill("tee", "tee", "#8bd862"),
      { id: "house-shadow", type: "fill", source: "houseShadows", paint: { "fill-color": "#0f2a12", "fill-opacity": 0.22 } },
      { id: "tree-shadow", type: "fill", source: "treeShadows", paint: { "fill-color": "#0f2a12", "fill-opacity": 0.24 } },
      fill("bunker", "bunker", "#f3e4b6"),
      { id: "bunker-shade", type: "line", source: "ground", filter: kind("bunker"), paint: { "line-color": "#b39a62", "line-width": 6, "line-blur": 5, "line-opacity": 0.55 } },
      { id: "bunker-edge", type: "line", source: "ground", filter: kind("bunker"), paint: { "line-color": "#3e7d36", "line-width": 1.6, "line-opacity": 0.85 } },
      ...(terr ? [{ id: "hillshade", type: "hillshade", source: "demShade", paint: { "hillshade-exaggeration": 0.5,
        "hillshade-shadow-color": "rgba(16,38,16,0.6)", "hillshade-highlight-color": "rgba(255,255,236,0.35)",
        "hillshade-accent-color": "rgba(24,48,24,0.3)", "hillshade-illumination-direction": 160, "hillshade-illumination-anchor": "map" } }] : []),
      { id: "arcs", type: "line", source: "arcs", paint: { "line-color": "#fff6d8", "line-width": 1.2, "line-opacity": 0.55, "line-dasharray": [1, 4] } },
      { id: "guide", type: "line", source: "guide", paint: { "line-color": "#fff3c4", "line-width": 2, "line-opacity": 0.8, "line-dasharray": [3, 3] } },
      { id: "shots", type: "line", source: "shots", layout: { "line-cap": "round" }, paint: { "line-color": "#16a34a", "line-width": 3.5, "line-opacity": 0.95 } },
      { id: "measure-solid", type: "line", source: "measure", filter: ["!", ["get", "dash"]], paint: { "line-color": "#fbbf24", "line-width": 2.5 } },
      { id: "measure-dash", type: "line", source: "measure", filter: ["get", "dash"], paint: { "line-color": "#fbbf24", "line-width": 2.5, "line-dasharray": [2, 2] } },
      { id: "buildings", type: "fill-extrusion", source: "ground", filter: kind("building"),
        paint: { "fill-extrusion-color": ["match", ["get", "c"], 0, "#f1ebde", 1, "#e9dcc3", 2, "#f6f3ec", "#ecd6c2"],
                 "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.96 } },
      { id: "trees", type: "fill-extrusion", source: "trees",
        paint: { "fill-extrusion-color": ["match", ["get", "c"], 0, "#2f7d33", 1, "#3c8e3a", 2, "#286a2d", 3, "#5aa93e", 4, "#4c8f34", 9, "#7a5636", "#2f7d33"],
                 "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "t"], "fill-extrusion-opacity": 1 } },
    ],
  };
}

// ── Markers ───────────────────────────────────────────────────────────────
function el(html, cls = "") {
  const d = document.createElement("div");
  d.className = cls;
  d.innerHTML = html;
  return d;
}
const dotHtml = c => `<div style="width:14px;height:14px;border-radius:50%;background:${c};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.6)"></div>`;
const flagHtml = `<div style="position:relative;width:24px;height:44px"><div style="position:absolute;left:0;bottom:0;width:3px;height:42px;background:#fff;border-radius:2px;box-shadow:0 0 3px rgba(0,0,0,0.5)"></div><div style="position:absolute;left:3px;top:0;width:16px;height:11px;background:#ef4444;clip-path:polygon(0 0,100% 50%,0 100%)"></div></div>`;
const tagHtml = (txt, border, color) => `<div style="background:rgba(8,26,16,0.9);border:1px solid ${border};color:${color};font:700 11px Inter,sans-serif;padding:2px 7px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${txt}</div>`;

// Yardage label: centered above the dot, or to one side when the dot is near a screen edge
function labelPlacement(x, width) {
  if (x < 120) return { anchor: "left", offset: [12, -16] };
  if (x > width - 120) return { anchor: "right", offset: [-12, -16] };
  return { anchor: "bottom", offset: [0, -12] };
}

// Fit points into the padded viewport of a tilted map. Perspective makes the near end
// bigger than the far end, so measure on screen and correct a few times.
function fitTilted(map, pts, bearing, pitch, padIn, maxZoom = 19.6) {
  const pad = { ...padIn, top: padIn.top + FLAG_ROOM };
  const c = map.getContainer(), W = c.clientWidth, H = c.clientHeight;
  const availW = W - pad.left - pad.right, availH = H - pad.top - pad.bottom;
  if (availW < 40 || availH < 40) return null;
  const mid = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  map.jumpTo({ center: mid, bearing, pitch, zoom: 17 });
  for (let i = 0; i < 6; i++) {
    const ps = pts.map(p => map.project(p));
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = Math.min(availW / Math.max(maxX - minX, 1), availH / Math.max(maxY - minY, 1));
    const zoom = Math.min(map.getZoom() + Math.log2(s), maxZoom);
    const dx = (minX + maxX) / 2 - (pad.left + availW / 2), dy = (minY + maxY) / 2 - (pad.top + availH / 2);
    const center = map.unproject([W / 2 + dx, H / 2 + dy]);
    map.jumpTo({ center, zoom });
  }
  return { center: map.getCenter(), zoom: map.getZoom(), bearing, pitch };
}

export default function HoleMap3D({ course, hole, tee, gps, holeShots, pad, recenterTick, approachMode, radarOn,
  onMapTap, onMapMove, onMapMoveEnd, formatShort, playerColor }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const queueRef = useRef([]);
  const gpsRef = useRef(gps);
  const padRef = useRef(pad);
  const gpsMarkerRef = useRef(null);
  const shotMarkersRef = useRef([]);
  const measureMarkersRef = useRef([]);
  const markersRef = useRef(new Set());   // every marker on the map, for hiding ones behind the camera
  const track = m => { markersRef.current.add(m); return m; };
  const ctlRef = useRef({});            // camera actions created along with the map
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const needleRef = useRef(null);
  const [angleIdx, setAngleIdx] = useState(() => {
    try { return Math.max(0, ANGLES.findIndex(a => a.key === localStorage.getItem("mgg_3d_angle"))); } catch { return 0; }
  });
  const pitchRef = useRef(ANGLES[angleIdx].pitch);
  const [looking, setLooking] = useState(false);   // camera is at a "look from here" spot
  // Controls render into the play screen's overlay layer so the app's own overlays can't cover them
  const [overlayHost, setOverlayHost] = useState(null);
  const rootRef = useCallback(node => setOverlayHost(node?.closest(".play-stage") ?? null), []);
  useEffect(() => { gpsRef.current = gps; }, [gps]);
  useEffect(() => { padRef.current = pad; });

  const t = teeOf(hole, tee);
  const bearing = bearingOf(t, hole.green);
  const holePts = [hole.tees.champ, hole.tees.mens, hole.tees.womens, hole.green].map(p => [p.lng, p.lat]);
  const whenReady = fn => { if (readyRef.current && mapRef.current) fn(mapRef.current); else queueRef.current.push(fn); };
  // Hole view at the chosen angle. GROUND is the fly-through's starting spot: about 30 ft up
  // behind the tee, looking down the fairway.
  const frameHole = map => {
    const pitch = pitchRef.current;
    const teeCam = pitch > 75 ? ctlRef.current.teeCam?.() : null;
    if (teeCam) { map.jumpTo(teeCam); return teeCam; }
    return fitTilted(map, holePts, bearing, Math.min(pitch, 75), padRef.current);
  };
  const fit = () => whenReady(map => { setLooking(false); frameHole(map); });

  useEffect(() => {
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: buildStyle(course),
      center: [hole.green.lng, hole.green.lat], zoom: 17, bearing, pitch: pitchRef.current, maxPitch: 89,
      attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: true, keyboard: false,
      canvasContextAttributes: { antialias: true },
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© OpenStreetMap contributors · traced from Esri imagery" }), "bottom-left");
    map.once("idle", () => map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    mapRef.current = map;
    const markerSet = markersRef.current;
    let flyTimer = null, raf = 0, flying = false, skippedAt = 0;

    // Whole-hole camera for the current layout and angle, worked out without visibly moving the map
    const overviewCam = () => {
      const cur = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      const cam = frameHole(map);
      map.jumpTo(cur);
      return cam;
    };

    // The fly-through: a camera about 30 ft up walking the fairway centerline from behind the
    // tee. It follows the fairway until no tree blocks the flag (e.g. round a dogleg), then turns
    // smoothly onto the pin, keeps it centered and glides in, dropping to near ground level.
    // u runs 0 (tee) → 1 (at the green).
    const len = haversineYards(t.lat, t.lng, hole.green.lat, hole.green.lng);
    const { ground } = terrainOf(course);
    const spine = course.features.filter(f => f.properties.kind === "spine" && f.properties.hole === hole.number)
      .flatMap(f => f.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })));
    const path = walkPath(t, hole.green, spine);
    const pin = hole.green, pinAlt = ground(pin.lng, pin.lat) + 1.3;
    const s0 = -12, s1 = Math.max(path.total - 14, path.total * 0.6);
    const eyeAt = s => FLY_EYE - (FLY_EYE - 3) * smoothstep(s1 - 90, s1, s);
    // Where does the flag come into clear view? Check the sight line past every broadleaf tree.
    const kx = Math.cos(t.lat * Math.PI / 180);
    const xy = (lng, lat) => [(lng - t.lng) * M * kx, (lat - t.lat) * M];
    const blockers = course.features.filter(f => f.properties.kind === "tree" && f.properties.type !== "palm")
      .map(f => { const [lng, lat] = f.geometry.coordinates; return { p: xy(lng, lat), r: f.properties.r * 0.85, top: ground(lng, lat) + f.properties.h }; });
    const pinXY = xy(pin.lng, pin.lat);
    let lastBlocked = -Infinity;
    for (let s = s0; s <= s1; s += 4) {
      const P = path.at(s), a = xy(P.lng, P.lat), camAlt = ground(P.lng, P.lat) + eyeAt(s);
      const dx = pinXY[0] - a[0], dy = pinXY[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const hit = blockers.some(b => {
        const tt = ((b.p[0] - a[0]) * dx + (b.p[1] - a[1]) * dy) / L2;
        if (tt < 0.04 || tt > 0.96) return false;
        const d = Math.hypot(a[0] + dx * tt - b.p[0], a[1] + dy * tt - b.p[1]);
        return d < b.r && b.top > camAlt + (pinAlt - camAlt) * tt;
      });
      if (hit) lastBlocked = s;
    }
    const sClear = lastBlocked === -Infinity ? s0 - 60 : lastBlocked + 6;
    const pinWeight = s => smoothstep(sClear - 25, sClear + 35, s);
    const flyCam = u => {
      const s = s0 + (s1 - s0) * u, P = path.at(s), w = pinWeight(s);
      // look-ahead along the fairway, averaged so curves don't make the view sway
      let ax = 0, ay = 0;
      for (const d of [40, 60, 80, 100]) { const q = path.at(Math.min(s + d, path.total)); ax += q.lng / 4; ay += q.lat / 4; }
      const tLng = ax + (pin.lng - ax) * w, tLat = ay + (pin.lat - ay) * w;
      const tAlt = ground(ax, ay) + (pinAlt - ground(ax, ay)) * w;
      return map.calculateCameraOptionsFromTo(new maplibregl.LngLat(P.lng, P.lat), ground(P.lng, P.lat) + eyeAt(s), new maplibregl.LngLat(tLng, tLat), tAlt);
    };
    const setThumb = u => { if (thumbRef.current) thumbRef.current.style.bottom = `calc(${(u * 100).toFixed(1)}% - 11px)`; };

    const stopFly = (toOverview) => {
      if (!flying) return;
      flying = false;
      skippedAt = Date.now();
      clearTimeout(flyTimer);
      cancelAnimationFrame(raf);
      map.stop();
      if (toOverview) frameHole(map);
    };
    const runFly = () => {
      clearTimeout(flyTimer); cancelAnimationFrame(raf); map.stop();
      setLooking(false);
      flying = true;
      map.jumpTo(flyCam(0)); setThumb(0);
      flyTimer = setTimeout(() => {
        if (!flying) return;
        const dur = Math.max(4500, Math.min(11000, path.total / 42 * 1000)), t0 = performance.now();
        const step = now => {
          if (!flying) return;
          const x = Math.min(1, (now - t0) / dur), u = 0.5 - 0.5 * Math.cos(Math.PI * x);
          map.jumpTo(flyCam(u)); setThumb(u);
          if (x < 1) { raf = requestAnimationFrame(step); return; }
          flyTimer = setTimeout(() => {      // a beat on the flag, then the whole hole
            if (!flying) return;
            const cam = overviewCam();
            if (cam) map.easeTo({ ...cam, duration: 1600 });
            map.once("moveend", () => { flying = false; });
          }, 700);
        };
        raf = requestAnimationFrame(step);
      }, 500);
    };

    // Look from a spot: standing at that spot at eye level, looking at the green
    const lookFrom = pt => {
      stopFly(false);
      const cam = map.calculateCameraOptionsFromTo(new maplibregl.LngLat(pt.lng, pt.lat), ground(pt.lng, pt.lat) + STAND_EYE,
        new maplibregl.LngLat(hole.green.lng, hole.green.lat), pinAlt);
      map.easeTo({ ...cam, duration: 1800 });
      setLooking(true);
    };
    const reset = () => {
      stopFly(false);
      setLooking(false);
      const cam = overviewCam();
      if (cam) map.easeTo({ ...cam, duration: 700 });
    };
    ctlRef.current = {
      replay: () => { if (readyRef.current) runFly(); },
      slide: u => { if (!readyRef.current) return; stopFly(false); setLooking(false); map.jumpTo(flyCam(u)); setThumb(u); },
      reset,
      stopFly,
      teeCam: () => flyCam(0),
    };

    // Compass needle shows how far the view is turned from tee-to-green
    const onTurn = () => {
      const off = ((bearing - map.getBearing() + 540) % 360) - 180;
      if (needleRef.current) needleRef.current.style.transform = `rotate(${off.toFixed(1)}deg)`;
    };
    map.on("rotate", onTurn);

    // In low views, hide markers that are behind the camera (or right under it); the map
    // would otherwise draw them mirrored up into the sky
    const hideBehind = () => {
      const cam = map.getPitch() > 30 ? map.transform.getCameraLngLat?.() : null;
      const brg = map.getBearing();
      markersRef.current.forEach(m => {
        if (!m.getElement().isConnected) { markersRef.current.delete(m); return; }
        let hide = false;
        if (cam) {
          const ll = m.getLngLat();
          const off = Math.abs(((bearingOf(cam, ll) - brg + 540) % 360) - 180);
          hide = off > 80 || haversineYards(cam.lat, cam.lng, ll.lat, ll.lng) < 4;
        }
        m.getElement().style.visibility = hide ? "hidden" : "";
      });
    };
    map.on("move", hideBehind);

    map.on("load", () => {
      // Static hole furniture
      map.getSource("guide").setData({ type: "Feature", geometry: { type: "LineString", coordinates: [[t.lng, t.lat], [hole.green.lng, hole.green.lat]] } });
      const back = bearingOf(hole.green, t);
      const arcs = [100, 150, 200].filter(y => y <= len + 15);
      map.getSource("arcs").setData({ type: "FeatureCollection", features: arcs.map(y => ({ type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: Array.from({ length: 73 }, (_, i) => { const p = destPoint(hole.green.lat, hole.green.lng, i * 5, y); return [p.lng, p.lat]; }) } })) });
      arcs.forEach(y => {
        const p = destPoint(hole.green.lat, hole.green.lng, back, y);
        track(new maplibregl.Marker({ element: el(`<div style="color:#fff6d8;font:800 11px Inter,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,0.9)">${y}</div>`) }).setLngLat([p.lng, p.lat]).addTo(map));
      });
      [["champ", "#3b82f6"], ["mens", "#9ca3af"], ["womens", "#ef4444"]].forEach(([k, c]) =>
        track(new maplibregl.Marker({ element: el(dotHtml(c)) }).setLngLat([hole.tees[k].lng, hole.tees[k].lat]).addTo(map)));
      track(new maplibregl.Marker({ element: el(flagHtml), anchor: "bottom-left", offset: [-1, 0], opacityWhenCovered: "1" }).setLngLat([hole.green.lng, hole.green.lat]).addTo(map));

      // Realistic look: textured turf and sand, and the three.js trees and houses in place of
      // the simple block ones (which stay as a fallback if the 3D layer can't start)
      try {
        Object.entries(GROUND_TEXTURES).forEach(([id, make]) => { if (!map.hasImage(id)) map.addImage(id, make(), { pixelRatio: 2 }); });
        [["course", "tex-rough"], ["fairway", "tex-fairway"], ["stripe", "tex-stripe"], ["fringe", "tex-fringe"],
         ["green", "tex-green"], ["tee", "tex-tee"], ["bunker", "tex-sand"]].forEach(([layer, img]) => map.setPaintProperty(layer, "fill-pattern", img));
        map.setPaintProperty("bg", "background-pattern", "tex-ground");
      } catch { /* plain colors remain */ }
      try {
        map.addLayer(createRealisticLayer(course, terrainOf(course).E));
        ["trees", "buildings"].forEach(id => map.setLayoutProperty(id, "visibility", "none"));
      } catch (err) {
        console.warn("3D trees unavailable, using simple shapes", err);
        if (map.getLayer("real3d")) map.removeLayer("real3d");
      }

      readyRef.current = true;
      const final = frameHole(map);
      queueRef.current.splice(0).forEach(fn => fn(map));

      // One tee-to-green fly-over the first time each hole opens
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (final && !still && !flown.has(hole.number)) {
        flown.add(hole.number);
        runFly();
      }
    });

    // A touch during the fly-over skips straight to the whole-hole view
    const canvasBox = map.getCanvasContainer();
    const skip = () => stopFly(true);
    canvasBox.addEventListener("pointerdown", skip, { passive: true });
    canvasBox.addEventListener("wheel", skip, { passive: true });

    // Press-and-hold rangefinder (custom timer: iOS Safari never fires contextmenu)
    let lpTimer = null, lpStart = null, lastMeasure = 0;
    const clearMeasure = () => {
      measureMarkersRef.current.forEach(m => m.remove());
      measureMarkersRef.current = [];
      if (map.getSource("measure")) map.getSource("measure").setData(EMPTY);
    };
    const measureAt = (ll) => {
      lastMeasure = Date.now();
      clearMeasure();
      const pt = { lat: ll.lat, lng: ll.lng }, g = gpsRef.current;
      const onHole = g && haversineYards(g.lat, g.lng, hole.green.lat, hole.green.lng) <= len + 150;
      const origin = onHole ? g : t;
      const fromYds = Math.round(haversineYards(origin.lat, origin.lng, pt.lat, pt.lng));
      const pinYds = Math.round(haversineYards(pt.lat, pt.lng, hole.green.lat, hole.green.lng));
      map.getSource("measure").setData({ type: "FeatureCollection", features: [
        { type: "Feature", properties: { dash: false }, geometry: { type: "LineString", coordinates: [[origin.lng, origin.lat], [pt.lng, pt.lat]] } },
        { type: "Feature", properties: { dash: true }, geometry: { type: "LineString", coordinates: [[pt.lng, pt.lat], [hole.green.lng, hole.green.lat]] } },
      ] });
      const dot = el(dotHtml("#fbbf24"));
      const label = el(`<div style="display:flex;align-items:center;gap:7px;background:rgba(8,26,16,0.92);border:1px solid #fbbf24;color:#f0ead6;font:700 11px Inter,sans-serif;padding:3px 4px 3px 7px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.6)"><span><span style="color:#fbbf24">${fromYds}</span> ${onHole ? "here" : "from tee"} · <span style="color:#4ade80">${pinYds}</span> to pin</span><button data-view type="button" style="font:800 11px Inter,sans-serif;color:#0b1a10;background:#c9a84c;border:0;border-radius:5px;padding:4px 8px;cursor:pointer">👁 View</button></div>`);
      dot.addEventListener("click", e => { e.stopPropagation(); clearMeasure(); });
      label.addEventListener("click", e => {
        e.stopPropagation();
        if (e.target.closest("[data-view]")) lookFrom(pt); else clearMeasure();
      });
      measureMarkersRef.current = [
        track(new maplibregl.Marker({ element: dot }).setLngLat([pt.lng, pt.lat]).addTo(map)),
        track(new maplibregl.Marker({ element: label, ...labelPlacement(map.project([pt.lng, pt.lat]).x, map.getContainer().clientWidth) })
          .setLngLat([pt.lng, pt.lat]).addTo(map)),
      ];
      try { navigator.vibrate?.(12); } catch { /* ignore */ }
    };
    const lpCancel = () => { clearTimeout(lpTimer); lpTimer = null; };
    const onTouchStart = e => {
      if (e.touches.length !== 1) return lpCancel();
      const r = canvasBox.getBoundingClientRect(), tt = e.touches[0];
      lpStart = [tt.clientX - r.left, tt.clientY - r.top];
      lpCancel();
      lpTimer = setTimeout(() => { if (readyRef.current) measureAt(map.unproject(lpStart)); }, 550);
    };
    const onTouchMove = e => {
      if (!lpTimer || !lpStart) return;
      const r = canvasBox.getBoundingClientRect(), tt = e.touches[0];
      if (e.touches.length !== 1 || Math.hypot(tt.clientX - r.left - lpStart[0], tt.clientY - r.top - lpStart[1]) > 10) lpCancel();
    };
    canvasBox.addEventListener("touchstart", onTouchStart, { passive: true });
    canvasBox.addEventListener("touchmove", onTouchMove, { passive: true });
    canvasBox.addEventListener("touchend", lpCancel, { passive: true });
    canvasBox.addEventListener("touchcancel", lpCancel, { passive: true });
    map.on("contextmenu", e => { if (Date.now() - lastMeasure > 900) measureAt(e.lngLat); });

    if (onMapTap) map.on("click", () => { if (Date.now() - lastMeasure > 700 && Date.now() - skippedAt > 700) onMapTap(); });
    if (onMapMove) map.on("movestart", e => { if (e.originalEvent) onMapMove(); });
    if (onMapMoveEnd) map.on("moveend", e => { if (e.originalEvent) onMapMoveEnd(); });

    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    return () => {
      flying = false;
      clearTimeout(flyTimer);
      cancelAnimationFrame(raf);
      lpCancel();
      window.removeEventListener("resize", onResize);
      readyRef.current = false;
      queueRef.current = [];
      ctlRef.current = {};
      gpsMarkerRef.current = null;
      shotMarkersRef.current = [];
      measureMarkersRef.current = [];
      markerSet.clear();
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole.number, tee, course]);

  // Re-fit when overlay sizes change or the recenter button is tapped
  useEffect(() => { fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [pad.top, pad.bottom, pad.left, pad.right, recenterTick]);

  // Angle button: re-frame the whole hole at the chosen tilt (remembered per device)
  const firstAngle = useRef(true);
  useEffect(() => {
    pitchRef.current = ANGLES[angleIdx].pitch;
    try { localStorage.setItem("mgg_3d_angle", ANGLES[angleIdx].key); } catch { /* private mode */ }
    if (firstAngle.current) { firstAngle.current = false; return; }
    ctlRef.current.reset?.();
  }, [angleIdx]);

  // Approach mode: zoom to player → green inside 100 yards
  useEffect(() => {
    if (!gps) return;
    whenReady(map => {
      if (approachMode) fitTilted(map, [[gps.lng, gps.lat], [hole.green.lng, hole.green.lat]], bearing, pitchRef.current, padRef.current, 20);
      else frameHole(map);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approachMode]);

  // GPS dot
  useEffect(() => {
    whenReady(map => {
      if (gpsMarkerRef.current) { gpsMarkerRef.current.remove(); gpsMarkerRef.current = null; }
      if (!gps) return;
      const node = el(`<div style="display:flex;align-items:center;gap:6px"><div style="width:16px;height:16px;border-radius:50%;background:#4ade80;border:2px solid #fff;box-shadow:0 0 0 4px rgba(74,222,128,0.3)"></div>${tagHtml("You", "#4ade80", "#4ade80")}</div>`);
      gpsMarkerRef.current = track(new maplibregl.Marker({ element: node, anchor: "left", offset: [-8, 0] }).setLngLat([gps.lng, gps.lat]).addTo(map));
    });
   
  }, [gps, tee]);

  // Shot lines with distance labels
  useEffect(() => {
    whenReady(map => {
      shotMarkersRef.current.forEach(m => m.remove());
      shotMarkersRef.current = [];
      map.setPaintProperty("shots", "line-color", playerColor || "#4ade80");
      map.getSource("shots").setData({ type: "FeatureCollection", features: holeShots.map(s => ({ type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: [[s.from.lng, s.from.lat], [s.to.lng, s.to.lat]] } })) });
      holeShots.forEach(s => {
        const mid = [(s.from.lng + s.to.lng) / 2, (s.from.lat + s.to.lat) / 2];
        const label = formatShort ? formatShort(s.yards) : `${s.yards} yds`;
        shotMarkersRef.current.push(track(new maplibregl.Marker({ element: el(tagHtml(label, playerColor || "#4ade80", playerColor || "#4ade80")) }).setLngLat(mid).addTo(map)));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeShots, tee]);

  // Live rain radar (RainViewer), refreshed every 5 minutes while on
  useEffect(() => {
    let interval = null, dead = false;
    const remove = map => {
      if (map.getLayer("radar")) map.removeLayer("radar");
      if (map.getSource("radar")) map.removeSource("radar");
    };
    const refresh = () => whenReady(async map => {
      try {
        const r = await fetch("https://api.rainviewer.com/public/weather-maps.json").then(x => x.json());
        const frames = r?.radar?.past || [];
        const path = frames.length ? frames[frames.length - 1].path : null;
        if (dead || !path || mapRef.current !== map) return;
        remove(map);
        map.addSource("radar", { type: "raster", tileSize: 256, maxzoom: 12, tiles: [`https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`] });
        map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0.6 } }, "buildings");
      } catch { /* offline or API down */ }
    });
    if (radarOn) { refresh(); interval = setInterval(refresh, 5 * 60 * 1000); }
    else whenReady(remove);
    return () => { dead = true; if (interval) clearInterval(interval); };
   
  }, [radarOn, hole.number, tee]);

  // Fly-through slider: drag from TEE (bottom) to the flag (top)
  const dragging = useRef(false);
  const slideTo = e => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    ctlRef.current.slide?.(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)));
  };
  const railBtn = { width: 44, minHeight: 38, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    background: "rgba(6,20,12,0.82)", border: "2px solid #d4af37", borderRadius: 10, color: "#f0ead6", cursor: "pointer", padding: 0,
    boxShadow: "0 3px 12px rgba(0,0,0,0.5)" };

  const controls = (
    <>
      {looking && (
        <button onClick={() => ctlRef.current.reset?.()}
          style={{ position: "absolute", top: pad.top + 6, left: "50%", transform: "translateX(-50%)", zIndex: 1001,
            background: "#c9a84c", color: "#0b1a10", border: "2px solid #0b1a10", borderRadius: 18, padding: "7px 14px",
            font: "800 13px Inter, sans-serif", boxShadow: "0 3px 12px rgba(0,0,0,0.5)", cursor: "pointer", whiteSpace: "nowrap" }}>
          ↩ Back to hole view
        </button>
      )}

      {/* Camera rail: fly-through slider, replay, angle presets, reset */}
      <div style={{ position: "absolute", left: 10, bottom: pad.bottom + 34, zIndex: 1001, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ ...railBtn, padding: "5px 0", gap: 4, cursor: "default" }}>
          <span style={{ fontSize: 13, lineHeight: 1 }} aria-hidden="true">⛳</span>
          <div ref={trackRef} role="slider" aria-label="Fly along the hole" aria-valuemin={0} aria-valuemax={100}
            onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); slideTo(e); }}
            onPointerMove={e => { if (dragging.current) slideTo(e); }}
            onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
            style={{ position: "relative", width: 30, height: 110, touchAction: "none", cursor: "ns-resize" }}>
            <div style={{ position: "absolute", left: 13, top: 0, bottom: 0, width: 4, borderRadius: 2, background: "rgba(240,234,214,0.35)" }} />
            <div ref={thumbRef} style={{ position: "absolute", left: 4, bottom: -11, width: 22, height: 22, borderRadius: "50%",
              background: "#c9a84c", border: "2px solid #0b1a10", boxShadow: "0 1px 4px rgba(0,0,0,0.6)" }} />
          </div>
          <span style={{ font: "800 9px Inter, sans-serif", letterSpacing: 0.3 }}>TEE</span>
        </div>
        <button onClick={() => ctlRef.current.replay?.()} style={railBtn} aria-label="Replay the fly-over">
          <span style={{ fontSize: 14, lineHeight: 1 }}>▶</span>
          <span style={{ font: "800 8px Inter, sans-serif", marginTop: 2 }}>FLY</span>
        </button>
        <button onClick={() => setAngleIdx(i => (i + 1) % ANGLES.length)} style={railBtn} aria-label={`Camera angle: ${ANGLES[angleIdx].label}. Tap to change`}>
          <span style={{ font: "800 8px Inter, sans-serif", opacity: 0.8 }}>ANGLE</span>
          <span style={{ font: `800 ${ANGLES[angleIdx].label.length > 4 ? 9 : 12}px Inter, sans-serif`, color: "#c9a84c" }}>{ANGLES[angleIdx].label}</span>
        </button>
        <button onClick={() => ctlRef.current.reset?.()} style={railBtn} aria-label="Reset to the tee-to-green view">
          <span ref={needleRef} style={{ display: "inline-block", fontSize: 15, lineHeight: 1, color: "#ef4444", transition: "transform 0.1s" }}>▲</span>
          <span style={{ font: "800 8px Inter, sans-serif", marginTop: 2 }}>RESET</span>
        </button>
      </div>
    </>
  );

  return (
    <div ref={rootRef} className="mgg3d" style={{ position: "absolute", inset: 0, "--dock": `${pad.bottom - 12}px` }}>
      <style>{`.mgg3d .maplibregl-ctrl-bottom-left{bottom:var(--dock)} .mgg3d .maplibregl-ctrl-attrib{font-size:10px;background:rgba(255,255,255,0.7)} .mgg3d .maplibregl-canvas{outline:none}`}</style>
      <div ref={boxRef} style={{ position: "absolute", inset: 0, background: "#cdd6c1" }} />

      {overlayHost ? createPortal(controls, overlayHost) : controls}
    </div>
  );
}
