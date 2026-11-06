import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Illustrated, tilted 3D view of a hole: drawn fairways, greens, bunkers and water
// (public/course3d/course.json), low-poly trees and houses, plus the same overlays as
// the satellite map (yardage arcs, press-and-hold rangefinder, shots, GPS, radar).

const M = 111320;            // meters per degree of latitude
const PITCH = 48;            // overview camera tilt
const FLAG_ROOM = 56;        // the flag stands above the green, so leave space at the top
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
  return {
    version: 8,
    sources: {
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
      fill("fringe", "fringe", "#62b348"),
      fill("green", "green", "#a3e672"),
      fill("tee", "tee", "#8bd862"),
      { id: "tree-shadow", type: "fill", source: "treeShadows", paint: { "fill-color": "#0f2a12", "fill-opacity": 0.2 } },
      fill("bunker", "bunker", "#f3e4b6"),
      { id: "bunker-edge", type: "line", source: "ground", filter: kind("bunker"), paint: { "line-color": "#d3bb80", "line-width": 1.2 } },
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
  useEffect(() => { gpsRef.current = gps; }, [gps]);
  useEffect(() => { padRef.current = pad; });

  const t = teeOf(hole, tee);
  const bearing = bearingOf(t, hole.green);
  const holePts = [hole.tees.champ, hole.tees.mens, hole.tees.womens, hole.green].map(p => [p.lng, p.lat]);
  const whenReady = fn => { if (readyRef.current && mapRef.current) fn(mapRef.current); else queueRef.current.push(fn); };
  const fit = () => whenReady(map => fitTilted(map, holePts, bearing, PITCH, padRef.current));

  useEffect(() => {
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: buildStyle(course),
      center: [hole.green.lng, hole.green.lat], zoom: 17, bearing, pitch: PITCH, maxPitch: 75,
      attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, keyboard: false,
      canvasContextAttributes: { antialias: true },
      fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© OpenStreetMap contributors · traced from Esri imagery" }), "bottom-left");
    map.once("idle", () => map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    mapRef.current = map;
    let flyTimer = null, flying = false, skippedAt = 0;
    // Whole-hole camera for the current layout, worked out without visibly moving the map
    const overviewCam = () => {
      const cur = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      const cam = fitTilted(map, holePts, bearing, PITCH, padRef.current);
      map.jumpTo(cur);
      return cam;
    };

    map.on("load", () => {
      // Static hole furniture
      map.getSource("guide").setData({ type: "Feature", geometry: { type: "LineString", coordinates: [[t.lng, t.lat], [hole.green.lng, hole.green.lat]] } });
      const holeYds = haversineYards(t.lat, t.lng, hole.green.lat, hole.green.lng);
      const back = bearingOf(hole.green, t);
      const arcs = [100, 150, 200].filter(y => y <= holeYds + 15);
      map.getSource("arcs").setData({ type: "FeatureCollection", features: arcs.map(y => ({ type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: Array.from({ length: 73 }, (_, i) => { const p = destPoint(hole.green.lat, hole.green.lng, i * 5, y); return [p.lng, p.lat]; }) } })) });
      arcs.forEach(y => {
        const p = destPoint(hole.green.lat, hole.green.lng, back, y);
        new maplibregl.Marker({ element: el(`<div style="color:#fff6d8;font:800 11px Inter,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,0.9)">${y}</div>`) }).setLngLat([p.lng, p.lat]).addTo(map);
      });
      [["champ", "#3b82f6"], ["mens", "#9ca3af"], ["womens", "#ef4444"]].forEach(([k, c]) =>
        new maplibregl.Marker({ element: el(dotHtml(c)) }).setLngLat([hole.tees[k].lng, hole.tees[k].lat]).addTo(map));
      new maplibregl.Marker({ element: el(flagHtml), anchor: "bottom-left", offset: [-1, 0] }).setLngLat([hole.green.lng, hole.green.lat]).addTo(map);

      readyRef.current = true;
      const final = fitTilted(map, holePts, bearing, PITCH, padRef.current);
      queueRef.current.splice(0).forEach(fn => fn(map));

      // One tee-to-green fly-over the first time each hole opens
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (final && !still && !flown.has(hole.number)) {
        flown.add(hole.number);
        const len = haversineYards(t.lat, t.lng, hole.green.lat, hole.green.lng);
        const z0 = Math.max(17.6, Math.min(19.3, 19.9 - Math.log2(Math.max(len, 80) / 90)));
        const start = [t.lng + (hole.green.lng - t.lng) * 0.18, t.lat + (hole.green.lat - t.lat) * 0.18];
        flying = true;
        map.jumpTo({ center: start, zoom: z0, pitch: 68, bearing });
        flyTimer = setTimeout(() => {
          if (!flying) return;
          map.easeTo({ center: [hole.green.lng, hole.green.lat], zoom: z0 + 0.35, pitch: 62, duration: Math.max(1800, Math.min(3800, len * 7)), easing: x => x * (2 - x) });
          map.once("moveend", () => {
            if (!flying) return;
            const cam = overviewCam();
            if (cam) map.easeTo({ ...cam, duration: 1200 });
            map.once("moveend", () => { flying = false; });
          });
        }, 500);
      }
    });

    // Any touch or click stops the fly-over and hands the camera to the player
    // A touch during the fly-over skips straight to the whole-hole view
    const stopFly = () => {
      if (!flying) return;
      flying = false;
      skippedAt = Date.now();
      clearTimeout(flyTimer);
      map.stop();
      fitTilted(map, holePts, bearing, PITCH, padRef.current);
    };
    const canvasBox = map.getCanvasContainer();
    canvasBox.addEventListener("pointerdown", stopFly, { passive: true });
    canvasBox.addEventListener("wheel", stopFly, { passive: true });

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
      const holeLen = haversineYards(t.lat, t.lng, hole.green.lat, hole.green.lng);
      const onHole = g && haversineYards(g.lat, g.lng, hole.green.lat, hole.green.lng) <= holeLen + 150;
      const origin = onHole ? g : t;
      const fromYds = Math.round(haversineYards(origin.lat, origin.lng, pt.lat, pt.lng));
      const pinYds = Math.round(haversineYards(pt.lat, pt.lng, hole.green.lat, hole.green.lng));
      map.getSource("measure").setData({ type: "FeatureCollection", features: [
        { type: "Feature", properties: { dash: false }, geometry: { type: "LineString", coordinates: [[origin.lng, origin.lat], [pt.lng, pt.lat]] } },
        { type: "Feature", properties: { dash: true }, geometry: { type: "LineString", coordinates: [[pt.lng, pt.lat], [hole.green.lng, hole.green.lat]] } },
      ] });
      const dot = el(dotHtml("#fbbf24"));
      const label = el(`<div style="background:rgba(8,26,16,0.92);border:1px solid #fbbf24;color:#f0ead6;font:700 11px Inter,sans-serif;padding:3px 7px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.6)"><span style="color:#fbbf24">${fromYds}</span> ${onHole ? "here" : "from tee"} · <span style="color:#4ade80">${pinYds}</span> to pin</div>`);
      [dot, label].forEach(n => n.addEventListener("click", e => { e.stopPropagation(); clearMeasure(); }));
      measureMarkersRef.current = [
        new maplibregl.Marker({ element: dot }).setLngLat([pt.lng, pt.lat]).addTo(map),
        new maplibregl.Marker({ element: label, ...(map.project([pt.lng, pt.lat]).x > map.getContainer().clientWidth / 2
          ? { anchor: "right", offset: [-12, -16] } : { anchor: "left", offset: [12, -16] }) }).setLngLat([pt.lng, pt.lat]).addTo(map),
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
      if (Math.hypot(tt.clientX - r.left - lpStart[0], tt.clientY - r.top - lpStart[1]) > 10) lpCancel();
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
      lpCancel();
      window.removeEventListener("resize", onResize);
      readyRef.current = false;
      queueRef.current = [];
      gpsMarkerRef.current = null;
      shotMarkersRef.current = [];
      measureMarkersRef.current = [];
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole.number, tee, course]);

  // Re-fit when overlay sizes change or the recenter button is tapped
  useEffect(() => { fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [pad.top, pad.bottom, pad.left, pad.right, recenterTick]);

  // Approach mode: zoom to player → green inside 100 yards
  useEffect(() => {
    if (!gps) return;
    whenReady(map => {
      if (approachMode) fitTilted(map, [[gps.lng, gps.lat], [hole.green.lng, hole.green.lat]], bearing, PITCH, padRef.current, 20);
      else fitTilted(map, holePts, bearing, PITCH, padRef.current);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approachMode]);

  // GPS dot
  useEffect(() => {
    whenReady(map => {
      if (gpsMarkerRef.current) { gpsMarkerRef.current.remove(); gpsMarkerRef.current = null; }
      if (!gps) return;
      const node = el(`<div style="display:flex;align-items:center;gap:6px"><div style="width:16px;height:16px;border-radius:50%;background:#4ade80;border:2px solid #fff;box-shadow:0 0 0 4px rgba(74,222,128,0.3)"></div>${tagHtml("You", "#4ade80", "#4ade80")}</div>`);
      gpsMarkerRef.current = new maplibregl.Marker({ element: node, anchor: "left", offset: [-8, 0] }).setLngLat([gps.lng, gps.lat]).addTo(map);
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
        shotMarkersRef.current.push(new maplibregl.Marker({ element: el(tagHtml(label, playerColor || "#4ade80", playerColor || "#4ade80")) }).setLngLat(mid).addTo(map));
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

  return (
    <div className="mgg3d" style={{ position: "absolute", inset: 0, "--dock": `${pad.bottom - 12}px` }}>
      <style>{`.mgg3d .maplibregl-ctrl-bottom-left{bottom:var(--dock)} .mgg3d .maplibregl-ctrl-attrib{font-size:10px;background:rgba(255,255,255,0.7)} .mgg3d .maplibregl-canvas{outline:none}`}</style>
      <div ref={boxRef} style={{ position: "absolute", inset: 0, background: "#cdd6c1" }} />
    </div>
  );
}
