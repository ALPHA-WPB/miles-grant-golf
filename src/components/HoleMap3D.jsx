import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createRealisticLayer, GROUND_TEXTURES } from "./realScene";
import { COURSE_PLACES, placeBadgeHtml } from "../lib/places";

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
      { id: "cartpath-edge", type: "line", source: "ground", filter: kind("cartpath"), layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#a49d8c", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 15, 1.5, 22, 190] } },
      { id: "cartpath", type: "line", source: "ground", filter: kind("cartpath"), layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#dcd6c8", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 15, 1.2, 22, 155] } },
      { id: "house-shadow", type: "fill", source: "houseShadows", paint: { "fill-color": "#0f2a12", "fill-opacity": 0.22 } },
      { id: "tree-shadow", type: "fill", source: "treeShadows", paint: { "fill-color": "#0f2a12", "fill-opacity": 0.24 } },
      fill("bunker", "bunker", "#f3e4b6"),
      { id: "bunker-shade", type: "line", source: "ground", filter: kind("bunker"), paint: { "line-color": "#b39a62", "line-width": 6, "line-blur": 5, "line-opacity": 0.55 } },
      { id: "bunker-edge", type: "line", source: "ground", filter: kind("bunker"), paint: { "line-color": "#3e7d36", "line-width": 1.6, "line-opacity": 0.85 } },
      ...(terr ? [{ id: "hillshade", type: "hillshade", source: "demShade", paint: { "hillshade-exaggeration": 0.3,
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

// Icons for the camera height/tilt buttons
const iconProps = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
const ICON_UP = <svg {...iconProps}><path d="M2 15.5h14" /><path d="M9 12V3" /><path d="M5.5 6.5 9 3l3.5 3.5" /></svg>;
const ICON_DOWN = <svg {...iconProps}><path d="M2 15.5h14" /><path d="M9 2.5v9" /><path d="M5.5 8 9 11.5 12.5 8" /></svg>;
const ICON_LOOK_UP = <svg {...iconProps}><path d="M1.8 11c2-2.8 4.4-4.2 7.2-4.2s5.2 1.4 7.2 4.2c-2 2.8-4.4 4.2-7.2 4.2S3.8 13.8 1.8 11z" /><circle cx="9" cy="11" r="1.9" fill="currentColor" /><path d="M6.5 3.8 9 1.6l2.5 2.2" /></svg>;
const ICON_LOOK_DOWN = <svg {...iconProps}><path d="M1.8 7c2-2.8 4.4-4.2 7.2-4.2s5.2 1.4 7.2 4.2c-2 2.8-4.4 4.2-7.2 4.2S3.8 9.8 1.8 7z" /><circle cx="9" cy="7" r="1.9" fill="currentColor" /><path d="M6.5 14.2 9 16.4l2.5-2.2" /></svg>;

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
  const moveRef = useRef({ f: 0, t: 0, h: 0, p: 0 });   // held controls: forward/back, turn, height, tilt
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
  const fit = () => whenReady(map => { setLooking(false); ctlRef.current.forgetWalk?.(); frameHole(map); });

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
    let flyTimer = null, raf = 0, flying = false, skippedAt = 0, flagMarker = null;

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
    // start from the farthest-back tee so the flight passes over every tee box
    const backTee = [hole.tees.champ, hole.tees.mens, hole.tees.womens].filter(p => p && isFinite(p.lat))
      .reduce((a, b) => haversineYards(b.lat, b.lng, hole.green.lat, hole.green.lng) > haversineYards(a.lat, a.lng, hole.green.lat, hole.green.lng) ? b : a);
    const path = walkPath(backTee, hole.green, spine);
    const pin = hole.green, pinAlt = ground(pin.lng, pin.lat) + 1.3;
    const s0 = -60, s1 = Math.max(path.total - 14, path.total * 0.6);
    // high establishing shot behind the tees, gliding down to ~30 ft past them, then to near ground at the green
    const eyeAt = s => FLY_EYE + (32 - FLY_EYE) * (1 - smoothstep(s0, 45, s)) - (FLY_EYE - 3) * smoothstep(s1 - 90, s1, s);
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
    // look at the flag at the start (whole-hole view) and again once nothing blocks it
    const pinWeight = s => Math.max(1 - smoothstep(s0 + 10, s0 + 85, s), smoothstep(sClear - 25, sClear + 35, s));
    const camAt = (s, eye, w) => {
      const P = path.at(s);
      // look-ahead along the fairway, averaged so curves don't make the view sway
      let ax = 0, ay = 0;
      for (const d of [40, 60, 80, 100]) { const q = path.at(Math.min(s + d, path.total)); ax += q.lng / 4; ay += q.lat / 4; }
      const tLng = ax + (pin.lng - ax) * w, tLat = ay + (pin.lat - ay) * w;
      const tAlt = ground(ax, ay) + (pinAlt - ground(ax, ay)) * w;
      return map.calculateCameraOptionsFromTo(new maplibregl.LngLat(P.lng, P.lat), ground(P.lng, P.lat) + eye, new maplibregl.LngLat(tLng, tLat), tAlt);
    };
    const flyCam = u => { const s = s0 + (s1 - s0) * u; return camAt(s, eyeAt(s), pinWeight(s)); };
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
      walk = null;
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
      walk = null;
      const cam = map.calculateCameraOptionsFromTo(new maplibregl.LngLat(pt.lng, pt.lat), ground(pt.lng, pt.lat) + STAND_EYE,
        new maplibregl.LngLat(hole.green.lng, hole.green.lat), pinAlt);
      map.easeTo({ ...cam, duration: 1800 });
      setLooking(true);
    };
    const reset = () => {
      stopFly(false);
      walk = null;
      setLooking(false);
      const cam = overviewCam();
      if (cam) map.easeTo({ ...cam, duration: 700 });
    };
    // Arrow controls. In low views the camera walks: it keeps its own position, height above
    // the ground, heading and tilt (never re-read from the map, so steps can't run away).
    // In higher views the map slides, rotates, zooms and tilts instead.
    let moveRaf = 0, moving = false, walk = null;
    const [bw, bs, be, bn] = course.terrain?.bounds || [-180, -85, 180, 85];
    const walkFromMap = () => {
      const tr = map.transform, C = tr.getCameraLngLat?.(), A = tr.getCameraAltitude?.();
      if (!C || A == null) return null;
      return { lng: C.lng, lat: C.lat, above: Math.max(1.5, Math.min(80, A - ground(C.lng, C.lat))),
        brg: map.getBearing(), pitch: Math.max(40, Math.min(86, map.getPitch())) };
    };
    const walkCam = w => {
      const d = Math.max(4, w.above * Math.tan(w.pitch * Math.PI / 180));
      const T = destPoint(w.lat, w.lng, w.brg, d * 1.09361);
      return map.calculateCameraOptionsFromTo(new maplibregl.LngLat(w.lng, w.lat), ground(w.lng, w.lat) + w.above,
        new maplibregl.LngLat(T.lng, T.lat), ground(T.lng, T.lat));
    };
    map.on("movestart", e => { if (e.originalEvent) walk = null; });   // a finger moved the map: start fresh
    const stepView = (dt, { f, t: turn, h, p }) => {
      if (map.getPitch() >= 55 || walk) {
        if (!walk) walk = walkFromMap();
        if (!walk) return;
        walk.brg += turn * 45 * dt;
        walk.above = Math.max(1.5, Math.min(80, walk.above * Math.exp(h * 0.9 * dt)));
        walk.pitch = Math.max(40, Math.min(86, walk.pitch + p * 22 * dt));
        if (f) {
          const speed = Math.min(30, 5 + walk.above * 0.7);          // ~6 m/s standing, faster when higher
          const q = destPoint(walk.lat, walk.lng, walk.brg, f * speed * dt * 1.09361);
          walk.lng = Math.max(bw, Math.min(be, q.lng));
          walk.lat = Math.max(bs, Math.min(bn, q.lat));
        }
        map.jumpTo(walkCam(walk));
      } else {
        const ctr = map.getCenter(), brg = map.getBearing() + turn * 45 * dt;
        const mpp = 40075016.7 * Math.cos(ctr.lat * Math.PI / 180) / (512 * 2 ** map.getZoom());
        const c2 = f ? destPoint(ctr.lat, ctr.lng, brg, f * 320 * mpp * dt * 1.09361) : ctr;
        map.jumpTo({ center: [c2.lng, c2.lat], bearing: brg, zoom: map.getZoom() - h * 0.9 * dt,
          pitch: Math.max(0, Math.min(85, map.getPitch() + p * 22 * dt)) });
      }
    };
    const startMove = () => {
      if (moving || !readyRef.current) return;
      moving = true;
      stopFly(false);
      let last = performance.now();
      const tick = now => {
        const m = moveRef.current;
        if (!m.f && !m.t && !m.h && !m.p) { moving = false; return; }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        stepView(dt, m);
        moveRaf = requestAnimationFrame(tick);
      };
      moveRaf = requestAnimationFrame(tick);
    };
    const forgetWalk = () => { walk = null; };

    ctlRef.current = {
      move: startMove,
      forgetWalk,
      replay: () => { if (readyRef.current) runFly(); },
      slide: u => { if (!readyRef.current) return; stopFly(false); walk = null; setLooking(false); map.jumpTo(flyCam(u)); setThumb(u); },
      reset,
      stopFly,
      teeCam: () => camAt(-12, FLY_EYE, 0),
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
      COURSE_PLACES.forEach(p => track(new maplibregl.Marker({ element: el(placeBadgeHtml(p)), anchor: "top-left" }).setLngLat([p.lng, p.lat]).addTo(map)));
      [["champ", "#3b82f6"], ["mens", "#9ca3af"], ["womens", "#ef4444"]].forEach(([k, c]) =>
        track(new maplibregl.Marker({ element: el(dotHtml(c)) }).setLngLat([hole.tees[k].lng, hole.tees[k].lat]).addTo(map)));
      flagMarker = track(new maplibregl.Marker({ element: el(flagHtml), anchor: "bottom-left", offset: [-1, 0], opacityWhenCovered: "1" }).setLngLat([hole.green.lng, hole.green.lat]).addTo(map));

      // Realistic look: textured turf and sand, and the three.js trees and houses in place of
      // the simple block ones (which stay as a fallback if the 3D layer can't start)
      try {
        Object.entries(GROUND_TEXTURES).forEach(([id, make]) => { if (!map.hasImage(id)) map.addImage(id, make(), { pixelRatio: 2 }); });
        [["course", "tex-rough"], ["fairway", "tex-fairway"], ["stripe", "tex-stripe"], ["fringe", "tex-fringe"],
         ["green", "tex-green"], ["tee", "tex-tee"], ["bunker", "tex-sand"]].forEach(([layer, img]) => map.setPaintProperty(layer, "fill-pattern", img));
        map.setPaintProperty("bg", "background-pattern", "tex-ground");
      } catch { /* plain colors remain */ }
      try {
        // Flag icon follows the 3D flagstick's screen position; once the real flagstick is big
        // enough to see, the icon hides so there's only ever one flag
        const flagEl = el(flagHtml);
        Object.assign(flagEl.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none", zIndex: 2, display: "none" });
        map.getCanvasContainer().appendChild(flagEl);
        map.addLayer(createRealisticLayer(course, terrainOf(course).E,
          { lng: hole.green.lng, lat: hole.green.lat, z: terrainOf(course).ground(hole.green.lng, hole.green.lat) },
          p => {
            const show = p && p.height > 0 && p.height < 16;
            flagEl.style.display = show ? "block" : "none";
            if (show) flagEl.style.transform = `translate(${(p.x - 1).toFixed(1)}px, ${(p.y - 44).toFixed(1)}px)`;
          }));
        flagMarker?.remove();
        flagMarker = null;
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
      cancelAnimationFrame(moveRaf);
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

  // Arrow keys on a computer do the same as the on-screen arrows
  useEffect(() => {
    const keys = { ArrowUp: ["f", 1], ArrowDown: ["f", -1], ArrowLeft: ["t", -1], ArrowRight: ["t", 1] };
    const down = e => {
      const k = keys[e.key];
      if (!k || /input|textarea|select/i.test(e.target.tagName)) return;
      e.preventDefault();
      moveRef.current = { ...moveRef.current, [k[0]]: k[1] };
      ctlRef.current.move?.();
    };
    const up = e => { const k = keys[e.key]; if (k) moveRef.current = { ...moveRef.current, [k[0]]: 0 }; };
    keys.PageUp = ["h", 1]; keys.PageDown = ["h", -1];
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  const padDown = e => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* keep going without capture */ }
    const d = e.currentTarget.dataset;
    moveRef.current = { f: Number(d.f || 0), t: Number(d.t || 0), h: Number(d.h || 0), p: Number(d.p || 0) };
    ctlRef.current.move?.();
  };
  const padUp = () => { moveRef.current = { f: 0, t: 0, h: 0, p: 0 }; };
  const padEvents = { onPointerDown: padDown, onPointerUp: padUp, onPointerCancel: padUp, onLostPointerCapture: padUp, onContextMenu: e => e.preventDefault() };
  const padBtn = { position: "absolute", width: 40, height: 40, borderRadius: "50%", border: "2px solid #d4af37",
    background: "rgba(6,20,12,0.82)", color: "#f0ead6", fontSize: 15, lineHeight: 1, display: "flex", alignItems: "center",
    justifyContent: "center", cursor: "pointer", touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
    boxShadow: "0 3px 10px rgba(0,0,0,0.5)", padding: 0 };

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

      {/* Arrows: walk forward/back, turn left/right (hold to keep going) */}
      <div role="group" aria-label="Move the view" style={{ position: "absolute", left: 64, bottom: pad.bottom + 12, width: 124, height: 124, zIndex: 1001 }}>
        <button aria-label="Move forward" data-f="1" data-t="0" style={{ ...padBtn, left: 42, top: 0 }} {...padEvents}>▲</button>
        <button aria-label="Move back" data-f="-1" data-t="0" style={{ ...padBtn, left: 42, top: 84 }} {...padEvents}>▼</button>
        <button aria-label="Turn left" data-f="0" data-t="-1" style={{ ...padBtn, left: 0, top: 42 }} {...padEvents}>◀</button>
        <button aria-label="Turn right" data-f="0" data-t="1" style={{ ...padBtn, left: 84, top: 42 }} {...padEvents}>▶</button>
      </div>

      {/* Camera height and tilt, icons only (hold to keep going) */}
      <div role="group" aria-label="Camera height and tilt" style={{ position: "absolute", left: 64, bottom: pad.bottom + 12 + 124 + 6, width: 124, zIndex: 1001, display: "flex", justifyContent: "space-between" }}>
        {[["h", 1, "Raise the camera", ICON_UP], ["h", -1, "Lower the camera", ICON_DOWN],
          ["p", 1, "Tilt the view up", ICON_LOOK_UP], ["p", -1, "Tilt the view down", ICON_LOOK_DOWN]].map(([axis, v, aria, ic]) => (
          <button key={aria} aria-label={aria} title={aria} data-h={axis === "h" ? v : 0} data-p={axis === "p" ? v : 0} {...padEvents}
            style={{ width: 28, height: 28, borderRadius: 8, border: "2px solid #d4af37", background: "rgba(6,20,12,0.82)", color: "#f0ead6",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer", touchAction: "none",
              userSelect: "none", WebkitUserSelect: "none", boxShadow: "0 3px 10px rgba(0,0,0,0.5)" }}>
            {ic}
          </button>
        ))}
      </div>

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
