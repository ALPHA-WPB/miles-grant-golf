import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import { supabase } from "./lib/supabase";
import { authService } from "./services/authService";
import { roundService } from "./services/roundService";
import Auth from "./components/Auth";
import Instructions from "./components/Instructions";
import LocationGate from "./components/LocationGate";
import RoundLobby from "./components/RoundLobby";
import Leaderboard from "./components/Leaderboard";
import RoundHistory from "./components/RoundHistory";
import Profile from "./components/Profile";
import AdminUsers, { isAdmin } from "./components/AdminUsers";

const HOLES = [
  // ── Front Nine ──────────────────────────────────────────────
  {
    number: 1, par: 5, handicap: 3,
    tees: {
      champ:  { lat: 27.14758779, lng: -80.17449690, yards: 509 },
      mens:   { lat: 27.14756051, lng: -80.17464485, yards: 491 },
      womens: { lat: 27.14747901, lng: -80.17501653, yards: 450 },
    },
    green: { lat: 27.14645837, lng: -80.17895987 },
  },
  {
    number: 2, par: 3, handicap: 15,
    tees: {
      champ:  { lat: 27.14645101, lng: -80.17935365, yards: 132 },
      mens:   { lat: 27.14637063, lng: -80.17935447, yards: 120 },
      womens: { lat: 27.14632678, lng: -80.17935098, yards: 108 },
    },
    green: { lat: 27.14536361, lng: -80.17929695 },
  },
  {
    number: 3, par: 3, handicap: 13,
    tees: {
      champ:  { lat: 27.14507893, lng: -80.17971927, yards: 147 },
      mens:   { lat: 27.14520451, lng: -80.17975258, yards: 130 },
      womens: { lat: 27.14530151, lng: -80.17977076, yards: 118 },
    },
    green: { lat: 27.14623854, lng: -80.17980873 },
  },
  {
    number: 4, par: 4, handicap: 5,
    tees: {
      champ:  { lat: 27.14657490, lng: -80.17986190, yards: 381 },
      mens:   { lat: 27.14650859, lng: -80.18006170, yards: 365 },
      womens: { lat: 27.14634566, lng: -80.18044440, yards: 340 },
    },
    green: { lat: 27.14524837, lng: -80.18304176 },
  },
  {
    number: 5, par: 3, handicap: 9,
    tees: {
      champ:  { lat: 27.14555760, lng: -80.18328247, yards: 148 },
      mens:   { lat: 27.14554824, lng: -80.18347100, yards: 133 },
      womens: { lat: 27.14554823, lng: -80.18354423, yards: 122 },
    },
    green: { lat: 27.14538419, lng: -80.18464611 },
  },
  {
    number: 6, par: 4, handicap: 1,
    tees: {
      champ:  { lat: 27.14590461, lng: -80.18481237, yards: 420 },
      mens:   { lat: 27.14591224, lng: -80.18476249, yards: 400 },
      womens: { lat: 27.14584275, lng: -80.18378381, yards: 360 },
    },
    green: { lat: 27.14668028, lng: -80.18116062 },
  },
  {
    number: 7, par: 3, handicap: 17,
    tees: {
      champ:  { lat: 27.14706897, lng: -80.18135856, yards: 141 },
      mens:   { lat: 27.14700144, lng: -80.18109789, yards: 125 },
      womens: { lat: 27.14697594, lng: -80.18095993, yards: 110 },
    },
    green: { lat: 27.14681188, lng: -80.18013925 },
  },
  {
    number: 8, par: 3, handicap: 11,
    tees: {
      champ:  { lat: 27.14656995, lng: -80.17962218, yards: 142 },
      mens:   { lat: 27.14662363, lng: -80.17953149, yards: 128 },
      womens: { lat: 27.14667765, lng: -80.17944083, yards: 112 },
    },
    green: { lat: 27.14725279, lng: -80.17856710 },
  },
  {
    number: 9, par: 4, handicap: 7,
    tees: {
      champ:  { lat: 27.14759828, lng: -80.17827814, yards: 395 },
      mens:   { lat: 27.14760531, lng: -80.17812078, yards: 375 },
      womens: { lat: 27.14763077, lng: -80.17779727, yards: 340 },
    },
    green: { lat: 27.14805456, lng: -80.17481248 },
  },
  // ── Back Nine ───────────────────────────────────────────────
  {
    number: 10, par: 4, handicap: 4,
    tees: {
      champ:  { lat: 27.14836505, lng: -80.17467009, yards: 410 },
      mens:   { lat: 27.14838067, lng: -80.17476743, yards: 390 },
      womens: { lat: 27.14844817, lng: -80.17524103, yards: 350 },
    },
    green: { lat: 27.14890512, lng: -80.17838320 },
  },
  {
    number: 11, par: 3, handicap: 18,
    tees: {
      champ:  { lat: 27.14918806, lng: -80.17874934, yards: 115 },
      mens:   { lat: 27.14914765, lng: -80.17880957, yards: 100 },
      womens: { lat: 27.14911947, lng: -80.17884704, yards: 90 },
    },
    green: { lat: 27.14857316, lng: -80.17955809 },
  },
  {
    number: 12, par: 3, handicap: 14,
    tees: {
      champ:  { lat: 27.14827437, lng: -80.17957714, yards: 140 },
      mens:   { lat: 27.14828852, lng: -80.17964040, yards: 125 },
      womens: { lat: 27.14831201, lng: -80.17974914, yards: 110 },
    },
    green: { lat: 27.14852361, lng: -80.18081572 },
  },
  {
    number: 13, par: 3, handicap: 10,
    tees: {
      champ:  { lat: 27.14882099, lng: -80.18094899, yards: 180 },
      mens:   { lat: 27.14883817, lng: -80.18088986, yards: 165 },
      womens: { lat: 27.14886700, lng: -80.18078537, yards: 148 },
    },
    green: { lat: 27.14915439, lng: -80.17934550 },
  },
  {
    number: 14, par: 4, handicap: 8,
    tees: {
      champ:  { lat: 27.14917161, lng: -80.17855047, yards: 335 },
      mens:   { lat: 27.14917473, lng: -80.17847596, yards: 315 },
      womens: { lat: 27.14917035, lng: -80.17788133, yards: 275 },
    },
    green: { lat: 27.14904419, lng: -80.17550729 },
  },
  {
    number: 15, par: 3, handicap: 12,
    tees: {
      champ:  { lat: 27.14896495, lng: -80.17518455, yards: 148 },
      mens:   { lat: 27.14900311, lng: -80.17515583, yards: 130 },
      womens: { lat: 27.14908789, lng: -80.17510257, yards: 115 },
    },
    green: { lat: 27.14993629, lng: -80.17450069 },
  },
  {
    number: 16, par: 3, handicap: 16,
    tees: {
      champ:  { lat: 27.15043448, lng: -80.17421463, yards: 115 },
      mens:   { lat: 27.15046209, lng: -80.17431739, yards: 100 },
      womens: { lat: 27.15048586, lng: -80.17441124, yards: 88 },
    },
    green: { lat: 27.15067900, lng: -80.17520643 },
  },
  {
    number: 17, par: 4, handicap: 2,
    tees: {
      champ:  { lat: 27.15097159, lng: -80.17535627, yards: 370 },
      mens:   { lat: 27.15099717, lng: -80.17528420, yards: 350 },
      womens: { lat: 27.15101706, lng: -80.17522793, yards: 310 },
    },
    green: { lat: 27.15211154, lng: -80.17215594 },
  },
  {
    number: 18, par: 5, handicap: 6,
    tees: {
      champ:  { lat: 27.15181808, lng: -80.17204566, yards: 484 },
      mens:   { lat: 27.15175457, lng: -80.17211897, yards: 460 },
      womens: { lat: 27.15145738, lng: -80.17258529, yards: 420 },
    },
    green: { lat: 27.14874297, lng: -80.17481267 },
  },
];

const PLAYER_COLOR = "#4ade80";

// Show a dash for missing or absurd yardages (keeps layout from breaking)
function longestKey() {
  const d = new Date();
  return `mg_longest_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function fmtYds(v) {
  return v == null || !isFinite(v) || v > 1000 ? "—" : Math.round(v);
}

// Pop-up sequence after a shot: count-up yardage, then "Pin is: XXX"
function ShotFlash({ yards, pin }) {
  const [phase, setPhase] = useState("hit");
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const target = typeof yards === "number" && yards <= 1000 ? yards : 0;
    const dur = 3500, t0 = performance.now();
    let raf;
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur);
      setShown(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(() => setPhase("pin"), 5000);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [yards]);
  if (phase === "hit") return (
    <div className="flash-overlay flash-hit">
      <div className="flash-inner">
        <p className="flash-emoji">🎉 ⛳ 🎉</p>
        <p className="flash-big">{yards > 1000 ? "—" : shown}</p>
        <p className="flash-label">yards</p>
      </div>
    </div>
  );
  return (
    <div className="flash-overlay flash-pin">
      <div className="flash-inner">
        <p className="flash-label" style={{fontSize:32}}>Pin is</p>
        <p className="flash-big" style={{color:"#d4af37"}}>{fmtYds(pin)}</p>
        <p className="flash-label">yards</p>
      </div>
    </div>
  );
}

function haversineYards(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a)) * 1.09361;
}

function calcBearing(lat1, lng1, lat2, lng2) {
  const dL = (lng2 - lng1) * Math.PI / 180;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const y = Math.sin(dL) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dL);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function holeMapBearing(hole) {
  const b = calcBearing(hole.tees.mens.lat, hole.tees.mens.lng, hole.green.lat, hole.green.lng);
  const norm = a => ((a % 360) + 360) % 360;
  const o1 = norm(b - 90);  const o1s = o1 > 180 ? o1 - 360 : o1;
  const o2 = norm(b - 270); const o2s = o2 > 180 ? o2 - 360 : o2;
  return Math.abs(o1s) <= Math.abs(o2s) ? o1s : o2s;
}

function makeIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.7)"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
}

const flagIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:20px;height:30px"><div style="position:absolute;left:0;top:0;width:2px;height:26px;background:#fff;border-radius:1px"></div><div style="position:absolute;left:2px;top:0;width:11px;height:7px;background:#ef4444;clip-path:polygon(0 0,100% 50%,0 100%)"></div></div>`,
  iconSize: [20, 30], iconAnchor: [1, 26],
});

const gpsIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#4ade80;border:2px solid #fff;box-shadow:0 0 0 4px rgba(74,222,128,0.3)"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
});

function shotLineIcon(yards) {
  return L.divIcon({
    className: "",
    html: `<div style="background:rgba(8,26,16,0.88);border:1px solid #4ade80;color:#4ade80;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;font-family:Inter,sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.5)">${yards} yds</div>`,
    iconSize: null, iconAnchor: [24, 10],
  });
}

function HoleMap({ hole, gps, holeShots }) {
  const mapRef       = useRef(null);
  const leafletRef   = useRef(null);
  const gpsMarkerRef = useRef(null);
  const shotLayersRef = useRef([]);

  const holePts = [
    [hole.tees.champ.lat,  hole.tees.champ.lng],
    [hole.tees.mens.lat,   hole.tees.mens.lng],
    [hole.tees.womens.lat, hole.tees.womens.lng],
    [hole.green.lat,       hole.green.lng],
  ];

  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }

    const rotation = holeMapBearing(hole);

    const mapOpts = {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      touchZoom: true,
      keyboard: false,
    };

    // Enable leaflet-rotate if available
    try { mapOpts.rotate = true; } catch { /* ignore */ }

    const map = L.map(mapRef.current, mapOpts);

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, maxNativeZoom: 19 }
    ).addTo(map);

    map.fitBounds(holePts, { padding: [28, 28] });

    // Apply rotation after bounds are set
    try {
      if (typeof map.setBearing === "function") map.setBearing(rotation);
    } catch { /* ignore */ }

    // Fairway guide line
    L.polyline(
      [[hole.tees.mens.lat, hole.tees.mens.lng], [hole.green.lat, hole.green.lng]],
      { color: "#c9a84c", weight: 2, dashArray: "6,6", opacity: 0.7 }
    ).addTo(map);

    // Tee markers
    L.marker([hole.tees.champ.lat,  hole.tees.champ.lng],  { icon: makeIcon("#3b82f6") }).addTo(map);
    L.marker([hole.tees.mens.lat,   hole.tees.mens.lng],   { icon: makeIcon("#9ca3af") }).addTo(map);
    L.marker([hole.tees.womens.lat, hole.tees.womens.lng], { icon: makeIcon("#ef4444") }).addTo(map);
    L.marker([hole.green.lat, hole.green.lng], { icon: flagIcon }).addTo(map);

    leafletRef.current = map;
    shotLayersRef.current = [];
    gpsMarkerRef.current = null;

    return () => { try { map.remove(); } catch { /* ignore */ } leafletRef.current = null; };
  }, [hole.number]);

  // GPS dot
  useEffect(() => {
    const map = leafletRef.current;
    if (!map) return;
    try {
      if (gpsMarkerRef.current) { map.removeLayer(gpsMarkerRef.current); gpsMarkerRef.current = null; }
      if (gps) {
        gpsMarkerRef.current = L.marker([gps.lat, gps.lng], { icon: gpsIcon })
          .bindTooltip("You", { permanent: true, direction: "right", className: "gps-tip", offset: [6, 0] })
          .addTo(map);
      }
    } catch { /* ignore */ }
  }, [gps]);

  // Shot lines
  useEffect(() => {
    const map = leafletRef.current;
    if (!map) return;
    try {
      shotLayersRef.current.forEach(l => map.removeLayer(l));
      shotLayersRef.current = [];
      holeShots.forEach(shot => {
        const line = L.polyline(
          [[shot.from.lat, shot.from.lng], [shot.to.lat, shot.to.lng]],
          { color: PLAYER_COLOR, weight: 3, opacity: 0.9 }
        ).addTo(map);
        const midLat = (shot.from.lat + shot.to.lat) / 2;
        const midLng = (shot.from.lng + shot.to.lng) / 2;
        const label = L.marker([midLat, midLng], { icon: shotLineIcon(shot.yards) }).addTo(map);
        shotLayersRef.current.push(line, label);
      });
    } catch { /* ignore */ }
  }, [holeShots]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; overflow: hidden; }
  .app { height: 100vh; height: 100dvh; display: flex; flex-direction: column; background: #0f2818; color: #f0ead6; font-family: 'Inter', sans-serif; overflow: hidden; }
  .serif { font-family: 'Playfair Display', serif; }
  .map-wrap { height: 36dvh; flex-shrink: 0; position: relative; overflow: hidden; }
  .bottom-panel { flex: 1; min-height: 0; background: #0a1c12; border-top: 1px solid rgba(45,90,61,0.5); overflow-y: auto; }
  .label { font-size: 10px; color: #7a9e84; text-transform: uppercase; letter-spacing: 0.08em; }
  .tab-bar { display: flex; background: rgba(6,14,9,0.95); border-top: 0.5px solid rgba(45,90,61,0.5); flex-shrink: 0; backdrop-filter: blur(12px); }
  .tab { flex: 1; padding: 9px 0 max(10px, env(safe-area-inset-bottom)); background: transparent; border: none; color: #c8d8cc; font-size: 15px; font-weight: 600; cursor: pointer; font-family: 'Inter',sans-serif; border-top: 2px solid transparent; }
  .tab.active { color: #c9a84c; font-weight: 700; border-top: 2px solid #c9a84c; }
  .glass-card { background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 14px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06); }
  .glass-stat { background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.08); border-radius: 12px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 1px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05); }
  .hole-pill { position: absolute; top: 12px; left: 12px; z-index: 1000; background: rgba(10,28,18,0.75); border: 1px solid rgba(201,168,76,0.6); border-radius: 50px; padding: 6px 16px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 2px 8px rgba(0,0,0,0.4); pointer-events: none; }
  .longest-pill { position: absolute; top: 52px; left: 12px; z-index: 1000; display: flex; flex-direction: column; gap: 2px; background: rgba(0,0,0,0.78); border: 2px solid #d4af37; border-radius: 12px; padding: 5px 10px; pointer-events: none; box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
  .help-pill { position: absolute; top: 12px; right: 12px; z-index: 1000; width: 44px; height: 44px; border-radius: 50%; background: rgba(10,28,18,0.75); border: 1px solid rgba(201,168,76,0.6); color: #c9a84c; font-family: 'Playfair Display',serif; font-weight: 700; font-size: 24px; cursor: pointer; }
  .shot-pill { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 1000; border: none; border-radius: 50px; cursor: pointer; font-family: 'Inter',sans-serif; font-size: 16px; font-weight: 700; padding: 14px 32px; white-space: nowrap; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); transition: all 0.2s; }
  .shot-pill-idle { background: rgba(255,255,255,0.15); color: #4ade80; border: 1px solid rgba(255,255,255,0.25); box-shadow: 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2); }
  .shot-pill-active { background: rgba(251,191,36,0.2); color: #fbbf24; border: 1px solid rgba(251,191,36,0.5); box-shadow: 0 4px 20px rgba(251,191,36,0.25), inset 0 1px 0 rgba(255,255,255,0.1); animation: pulse-amber 1.6s ease-in-out infinite; }
  .shot-pill-disabled { opacity: 0.4; cursor: not-allowed; }
  .swing-btn { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 1000; width: 92px; height: 92px; border-radius: 50%; border: 4px solid #d4af37; cursor: pointer; font-family: 'Inter',sans-serif; font-weight: 800; font-size: 14px; line-height: 1.1; text-transform: uppercase; box-shadow: 0 6px 24px rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px; -webkit-tap-highlight-color: transparent; }
  .swing-idle { animation: swing-flash 1s steps(1) infinite; }
  .swing-active { background: #d4af37; color: #000; border-color: #fff; animation: swing-pulse 1.2s ease-in-out infinite; }
  .swing-disabled { background: #333; color: #999; border-color: #666; cursor: not-allowed; animation: none; }
  @keyframes swing-flash { 0%,100% { background: #000; color: #d4af37; } 50% { background: #d4af37; color: #000; } }
  @keyframes swing-pulse { 0%,100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.07); } }
  .big-dist { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .big-dist-box { background: #06140c; border: 2px solid rgba(212,175,55,0.55); border-radius: 14px; padding: 6px 4px 4px; text-align: center; }
  .big-dist-label { font-size: 14px; font-weight: 800; color: #f0ead6; text-transform: uppercase; letter-spacing: 0.06em; }
  .big-dist-num { font-family: 'Inter',sans-serif; font-size: clamp(48px, 15vw, 68px); font-weight: 900; line-height: 1; color: #d4af37; margin: 2px 0 0; letter-spacing: -0.02em; }
  .big-dist-unit { font-size: 13px; color: #c8d8cc; font-weight: 600; }
  .flash-overlay { position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; pointer-events: none; background: rgba(0,0,0,0.82); }
  .flash-hit { animation: flash-fade 5s ease forwards; }
  .flash-pin { animation: flash-fade 3s ease forwards; }
  .flash-inner { text-align: center; }
  .flash-emoji { font-size: 56px; margin-bottom: 8px; }
  .flash-big { font-family: 'Inter',sans-serif; font-size: 120px; font-weight: 900; color: #4ade80; line-height: 1; }
  .flash-label { font-size: 26px; font-weight: 700; color: #f0ead6; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 6px; }
  @keyframes flash-fade { 0% { opacity: 0; transform: scale(0.85); } 8% { opacity: 1; transform: scale(1); } 85% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes pulse-amber { 0%,100% { box-shadow: 0 4px 20px rgba(251,191,36,0.25), inset 0 1px 0 rgba(255,255,255,0.1); } 50% { box-shadow: 0 4px 28px rgba(251,191,36,0.55), 0 0 0 6px rgba(251,191,36,0.12), inset 0 1px 0 rgba(255,255,255,0.1); } }
  .btn-primary { background: #c9a84c; color: #0f2818; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; padding: 14px; cursor: pointer; width: 100%; font-family: 'Inter',sans-serif; letter-spacing:0.02em; }
  .btn-ghost { background: transparent; border: 0.5px solid #2d5a3d; border-radius: 8px; color: #a3b89a; font-size: 13px; padding: 6px 14px; cursor: pointer; font-family: 'Inter',sans-serif; }
  input[type=text] { background: rgba(10,28,18,0.7); border: 0.5px solid #2d5a3d; border-radius: 8px; color: #f0ead6; font-size: 15px; padding: 8px 12px; font-family: 'Inter',sans-serif; outline: none; width: 100%; }
  .leaflet-container { background: #0d2416; }
  .gps-tip { background: rgba(8,26,16,0.9) !important; border: 1px solid #4ade80 !important; color: #4ade80 !important; font-size: 11px !important; font-weight: 600 !important; font-family: 'Inter',sans-serif; box-shadow: none !important; }
  .gps-tip::before { display: none !important; }
  .pickup-link { background: none; border: none; color: #7a9e84; font-size: 11px; cursor: pointer; font-family: 'Inter',sans-serif; text-decoration: underline; padding: 0 0 0 4px; }
  .pickup-link:hover { color: #f87171; }
  .hole-nav-bar { display: flex; align-items: center; background: rgba(6,14,9,0.95); border-bottom: 0.5px solid rgba(45,90,61,0.5); padding: 0; flex-shrink: 0; backdrop-filter: blur(12px); }
  .hole-nav-btn { flex: 1; background: transparent; border: none; color: #f0ead6; font-size: 17px; font-weight: 700; cursor: pointer; padding: 9px 8px; font-family: 'Inter',sans-serif; display: flex; align-items: center; justify-content: center; }
  .hole-nav-btn:disabled { color: #2d5a3d; cursor: default; }
  .hole-nav-info { flex: 2; text-align: center; }
  .hole-nav-label { font-size: 18px; color: #c9a84c; font-weight: 700; font-family: 'Playfair Display',serif; }
  .hole-nav-sub { font-size: 13px; color: #c8d8cc; }
  .shot-flash-overlay { position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; pointer-events: none; background: rgba(5,16,10,0.55); animation: shot-flash-bg 7s ease forwards; }
  .shot-flash-inner { text-align: center; animation: shot-flash-pop 7s cubic-bezier(.2,.9,.3,1) forwards; }
  .shot-flash-yards { font-family: 'Playfair Display',serif; font-size: 104px; font-weight: 700; color: #4ade80; line-height: 1; text-shadow: 0 4px 32px rgba(74,222,128,0.5); }
  .shot-flash-label { font-size: 18px; color: #f0ead6; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px; }
  @keyframes shot-flash-bg { 0% { opacity: 0; } 6% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes shot-flash-pop { 0% { opacity: 0; transform: scale(0.75); } 8% { opacity: 1; transform: scale(1); } 80% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.92); } }
  .tap-hint-overlay { position: fixed; inset: 0; z-index: 2900; display: flex; align-items: center; justify-content: center; pointer-events: none; background: rgba(5,16,10,0.6); animation: tap-hint-bg 4s ease forwards; }
  .tap-hint-inner { text-align: center; padding: 0 2rem; animation: tap-hint-pop 4s cubic-bezier(.2,.9,.3,1) forwards; }
  .tap-hint-title { font-family: 'Playfair Display',serif; font-size: 34px; font-weight: 700; color: #fbbf24; line-height: 1.2; text-shadow: 0 4px 24px rgba(251,191,36,0.4); }
  .tap-hint-sub { font-size: 14px; color: #f0ead6; margin-top: 10px; letter-spacing: 0.02em; }
  @keyframes tap-hint-bg { 0% { opacity: 0; } 10% { opacity: 1; } 75% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes tap-hint-pop { 0% { opacity: 0; transform: scale(0.85); } 12% { opacity: 1; transform: scale(1); } 75% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.95); } }
`;

function GuestUpsell({ feature, onExitGuest }) {
  return (
    <div style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"2rem", background:"#0a1c12", textAlign:"center", gap:14}}>
      <p style={{fontSize:34}}>🔒</p>
      <p style={{fontFamily:"'Playfair Display',serif", fontSize:20, color:"#c9a84c"}}>{feature} needs an account</p>
      <p style={{fontSize:13, color:"#7a9e84", maxWidth:280, lineHeight:1.5}}>
        Create a free account to unlock {feature.toLowerCase()}. Your current round keeps playing normally either way — nothing you've scored is lost.
      </p>
      <button onClick={onExitGuest}
        style={{padding:"12px 24px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#c9a84c,#b8952f)", color:"#0f2818", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
        Create Account
      </button>
    </div>
  );
}

function TabBar({ active, onSelect, onGame }) {
  const tabs = [
    { key: "hole", label: "⛳ Play", action: onGame },
    { key: "history", label: "📋 History", action: () => onSelect("history") },
    { key: "leaderboard", label: "🏆 Leaders", action: () => onSelect("leaderboard") },
    { key: "profile", label: "👤 Me", action: () => onSelect("profile") },
  ];
  return (
    <div className="tab-bar">
      {tabs.map(t => (
        <button key={t.key} className={`tab ${active === t.key ? "active" : ""}`} onClick={t.action}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function MainApp({ user, profile, isGuest, onProfileUpdate, onExitGuest, onShowInstructions }) {
  const [tab, setTab]               = useState(null); // null | history | leaderboard | friends | profile
  const [round, setRound]           = useState(null); // { round, roundPlayer } from Supabase, or null for guests
  const [screen, setScreen]         = useState("lobby");
  const [, setPlayerTee]            = useState("mens");
  const [roundStart, setRoundStart] = useState(0);
  const [roundEnd, setRoundEnd]     = useState(18);
  const [holeIdx, setHoleIdx]       = useState(0);
  const [holeComplete, setHoleComplete] = useState(false);
  const [scores, setScores]         = useState(() => Array(HOLES.length).fill(0));
  const [skipped, setSkipped]       = useState(() => Array(HOLES.length).fill(false));
  const [pickupConfirm, setPickupConfirm] = useState(false);
  const [shots, setShots]           = useState(() => Array(HOLES.length).fill(null).map(() => []));
  const [gps, setGps]               = useState(null);
  const [gpsError, setGpsError]     = useState(null);
  const [shotFrom, setShotFrom]     = useState(null);
  const [shotFlash, setShotFlash]   = useState(null);
  const [tapHint, setTapHint]       = useState(null);
  const [locationReady, setLocationReady] = useState(false);
  const [longestToday, setLongestToday] = useState(() => {
    try { return Number(localStorage.getItem(longestKey())) || 0; } catch { return 0; }
  });
  const [locChecked, setLocChecked] = useState(false);
  const watchRef                    = useRef(null);

  // Location gate: check permission when entering the hole screen
  useEffect(() => {
    if (screen !== "hole" || locationReady) return;
    let cancelled = false;
    (async () => {
      try {
        if (navigator.permissions?.query) {
          const st = await navigator.permissions.query({ name: "geolocation" });
          if (!cancelled && st.state === "granted") setLocationReady(true);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLocChecked(true);
    })();
    return () => { cancelled = true; };
  }, [screen, locationReady]);

  // Keep the screen awake while playing a hole
  useEffect(() => {
    if (screen !== "hole" || !("wakeLock" in navigator)) return;
    let lock = null;
    const req = async () => { try { lock = await navigator.wakeLock.request("screen"); } catch { /* ignore */ } };
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    req();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); try { lock?.release(); } catch { /* ignore */ } };
  }, [screen]);

  useEffect(() => {
    if (screen !== "hole" || !locationReady) return;
    if (!navigator.geolocation) { setGpsError("GPS not available"); return; }
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) });
        setGpsError(null);
      },
      () => setGpsError("GPS unavailable"),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return () => navigator.geolocation.clearWatch(watchRef.current);
  }, [screen, locationReady]);

  useEffect(() => {
    if (screen !== "hole") return;
    try {
      if (localStorage.getItem("mg_seen_tap_hint")) return;
      localStorage.setItem("mg_seen_tap_hint", "1");
      setTapHint({ id: Date.now() });
    } catch { /* ignore */ }
  }, [screen]);

  useEffect(() => {
    if (!shotFlash) return;
    const t = setTimeout(() => setShotFlash(null), 8000);
    return () => clearTimeout(t);
  }, [shotFlash]);

  useEffect(() => {
    if (!tapHint) return;
    const t = setTimeout(() => setTapHint(null), 4000);
    return () => clearTimeout(t);
  }, [tapHint]);

  if (tab === "leaderboard") return (
    <div className="app" style={{display:"flex", flexDirection:"column"}}>
      <style>{css}</style>
      <Leaderboard onClose={() => setTab(null)} />
      <TabBar active={tab} onSelect={setTab} onGame={() => setTab(null)} />
    </div>
  );
  if (tab === "history") return (
    <div className="app" style={{display:"flex", flexDirection:"column"}}>
      <style>{css}</style>
      {isGuest ? <GuestUpsell feature="Round history" onExitGuest={onExitGuest} /> : <RoundHistory userId={user.id} />}
      <TabBar active={tab} onSelect={setTab} onGame={() => setTab(null)} />
    </div>
  );
  if (tab === "admin" && isAdmin(user)) return (
    <div className="app" style={{display:"flex", flexDirection:"column"}}>
      <style>{css}</style>
      <AdminUsers onClose={() => setTab("profile")} />
      <TabBar active="profile" onSelect={setTab} onGame={() => setTab(null)} />
    </div>
  );
  if (tab === "profile") return (
    <div className="app" style={{display:"flex", flexDirection:"column"}}>
      <style>{css}</style>
      {isGuest ? (
        <div style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"2rem", background:"#0a1c12", textAlign:"center", gap:14}}>
          <p style={{fontSize:34}}>⛳</p>
          <p style={{fontFamily:"'Playfair Display',serif", fontSize:20, color:"#c9a84c"}}>Playing as Guest</p>
          <p style={{fontSize:13, color:"#7a9e84", maxWidth:280, lineHeight:1.5}}>
            Guest: play free — nothing is saved. Your round is erased when you close the app. Create a free account any time to save your rounds and join the club leaderboard.
          </p>
          <button onClick={onExitGuest}
            style={{padding:"12px 24px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#c9a84c,#b8952f)", color:"#0f2818", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
            Create Account
          </button>
        </div>
      ) : (
        <Profile user={user} profile={profile} onProfileUpdate={onProfileUpdate} onSignOut={() => authService.signOut()} onAdmin={isAdmin(user) ? () => setTab("admin") : null} />
      )}
      <TabBar active={tab} onSelect={setTab} onGame={() => setTab(null)} />
    </div>
  );

  function onRoundStart({ round: r, roundPlayer, tee, roundType }) {
    setRound({ round: r, roundPlayer });
    setPlayerTee(tee);
    const start = roundType === "back9" ? 9 : 0;
    const end   = roundType === "front9" ? 9 : 18;
    setRoundStart(start);
    setRoundEnd(end);
    setHoleIdx(start);
    setHoleComplete(false);
    setScores(Array(HOLES.length).fill(0));
    setSkipped(Array(HOLES.length).fill(false));
    setShots(Array(HOLES.length).fill(null).map(() => []));
    setShotFlash(null);
    setScreen("hole");
  }

  if (screen === "lobby") return (
    <div style={{position:"relative", height:"100dvh"}}>
      <RoundLobby user={user} profile={profile} isGuest={isGuest} onRoundStart={onRoundStart} onShowInstructions={onShowInstructions} />
    </div>
  );

  async function syncScore(holeNumber, strokes) {
    if (!round?.roundPlayer?.id) return;
    try { await roundService.upsertScore(round.roundPlayer.id, holeNumber, strokes); } catch { /* ignore */ }
  }

  const hole = HOLES[holeIdx];
  const holeShots = shots[holeIdx];
  const completedShots = holeShots.length;
  const inProgress = shotFrom !== null;
  const shotBasedScore = Math.max(1, completedShots + (inProgress ? 1 : 0));

  function distToGreen() {
    if (!gps) return null;
    const d = Math.round(haversineYards(gps.lat, gps.lng, hole.green.lat, hole.green.lng));
    return d <= 600 ? d : null;
  }

  function markShot() {
    if (!gps) return;
    setTapHint(null);
    if (shotFrom) {
      const yards = Math.round(haversineYards(shotFrom.lat, shotFrom.lng, gps.lat, gps.lng));
      setShots(prev => {
        const next = prev.map(h => [...h]);
        next[holeIdx] = [...next[holeIdx], { from: shotFrom, to: { lat: gps.lat, lng: gps.lng }, yards }];
        return next;
      });
      const pin = Math.round(haversineYards(gps.lat, gps.lng, hole.green.lat, hole.green.lng));
      setShotFlash({ yards, pin, id: Date.now() });
      if (yards <= 1000 && yards > longestToday) {
        setLongestToday(yards);
        try { localStorage.setItem(longestKey(), String(yards)); } catch { /* ignore */ }
      }
    }
    setShotFrom({ lat: gps.lat, lng: gps.lng });
  }

  function cupIn() {
    const final = shotBasedScore;
    setScores(prev => { const n = [...prev]; n[holeIdx] = final; return n; });
    setSkipped(prev => { const n = [...prev]; n[holeIdx] = false; return n; });
    setShotFrom(null);
    setPickupConfirm(false);
    setHoleComplete(true);
    syncScore(hole.number, final);
  }

  function adjustScore(delta) {
    const next = Math.max(1, (scores[holeIdx] || shotBasedScore) + delta);
    setScores(prev => { const n = [...prev]; n[holeIdx] = next; return n; });
    setSkipped(prev => { const n = [...prev]; n[holeIdx] = false; return n; });
    syncScore(hole.number, next);
  }

  function skipHole() {
    setSkipped(prev => { const n = [...prev]; n[holeIdx] = true; return n; });
    setScores(prev => { const n = [...prev]; n[holeIdx] = 0; return n; });
    setShotFrom(null);
    setPickupConfirm(false);
    setHoleComplete(true);
  }

  function clearShots() {
    setShots(prev => { const n = [...prev]; n[holeIdx] = []; return n; });
    setShotFrom(null);
  }

  function nextHole() {
    setHoleIdx(i => Math.min(roundEnd - 1, i + 1));
    setShotFrom(null);
    setPickupConfirm(false);
    setHoleComplete(false);
  }

  function prevHole() {
    setHoleIdx(i => Math.max(roundStart, i - 1));
    setShotFrom(null);
    setPickupConfirm(false);
    setHoleComplete(false);
  }

  function totalScore() { return scores.reduce((s, v, i) => s + (skipped[i] ? 0 : (v || 0)), 0); }
  function totalPar()   { return HOLES.slice(roundStart, roundEnd).reduce((s, h) => s + h.par, 0); }

  function endRound() {
    if (round?.round?.id) roundService.finalizeRound(round.round.id).catch(() => {});
    setRound(null);
    setScreen("lobby");
    setHoleIdx(0);
    setScores(Array(HOLES.length).fill(0));
    setSkipped(Array(HOLES.length).fill(false));
    setShots(Array(HOLES.length).fill(null).map(() => []));
    setShotFrom(null);
    setPickupConfirm(false);
    setShotFlash(null);
    setRoundStart(0);
    setRoundEnd(18);
    setHoleComplete(false);
  }

  const dtg = distToGreen();
  const displayScore = scores[holeIdx] || (inProgress || completedShots > 0 ? shotBasedScore : 0);
  const scoreForDisplay = skipped[holeIdx] ? null : displayScore;
  const diff = scoreForDisplay ? scoreForDisplay - hole.par : null;
  const lastShot = holeShots.length > 0 ? holeShots[holeShots.length - 1].yards : null;

  const shotFlashOverlay = shotFlash && <ShotFlash key={shotFlash.id} yards={shotFlash.yards} pin={shotFlash.pin} />;

  const tapHintOverlay = tapHint && (
    <div key={tapHint.id} className="tap-hint-overlay">
      <div className="tap-hint-inner">
        <p className="tap-hint-title">🏌️ Tap the big gold button</p>
        <p className="tap-hint-title">before every swing</p>
        <p className="tap-hint-sub" style={{fontSize:20}}>Then tap it again when you reach your ball</p>
      </div>
    </div>
  );

  // ── Round Complete screen ─────────────────────────────────────
  if (screen === "complete") {
    const ts = totalScore(), tp = totalPar(), diff2 = ts - tp;
    const playedFront = roundStart === 0;
    const playedBack  = roundEnd === 18;
    const playedAll   = playedFront && playedBack;
    return (
      <div className="app" style={{overflowY:"auto"}}>
        <style>{css}</style>
        <div style={{padding:"2rem 1.25rem 5rem", maxWidth:420, margin:"0 auto", textAlign:"center"}}>
          <div style={{marginBottom:"1.5rem"}}>
            <p style={{fontSize:36, marginBottom:8}}>🏁</p>
            <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:28, color:"#c9a84c", marginBottom:4}}>Round Complete</h2>
            <p style={{fontSize:13, color:"#7a9e84"}}>
              {playedAll ? "All 18 Holes" : playedFront ? "Front 9 · Holes 1–9" : "Back 9 · Holes 10–18"} · Miles Grant CC
            </p>
          </div>

          {/* Score summary */}
          <div className="glass-card" style={{padding:"1.25rem", marginBottom:"1.25rem"}}>
            <p style={{fontSize:48, fontWeight:700, lineHeight:1, marginBottom:4,
              color:diff2<0?"#4ade80":diff2===0?"#c9a84c":"#f87171"}}>{ts || "—"}</p>
            <p style={{fontSize:13, color:"#7a9e84", marginBottom:12}}>Total score · Par {tp}</p>
            <div style={{fontSize:22, fontWeight:700, padding:"8px 20px", borderRadius:50, display:"inline-block",
              background:diff2<0?"rgba(74,222,128,0.12)":diff2===0?"rgba(201,168,76,0.12)":"rgba(248,113,113,0.12)",
              color:diff2<0?"#4ade80":diff2===0?"#c9a84c":"#f87171",
              border:`1px solid ${diff2<0?"rgba(74,222,128,0.3)":diff2===0?"rgba(201,168,76,0.3)":"rgba(248,113,113,0.3)"}`}}>
              {diff2===0?"Even":diff2>0?`+${diff2}`:diff2}
            </div>
          </div>

          {/* Continue with other 9 */}
          {!playedAll && (
            <button onClick={() => {
              const ns = playedFront ? 9 : 0, ne = playedFront ? 18 : 9;
              setRoundStart(ns); setRoundEnd(ne); setHoleIdx(ns); setHoleComplete(false); setScreen("hole");
            }} className="glass-card"
              style={{width:"100%", padding:"14px", borderRadius:14, cursor:"pointer", border:"0.5px solid rgba(201,168,76,0.35)",
                fontFamily:"'Inter',sans-serif", fontSize:15, fontWeight:600, color:"#c9a84c", marginBottom:10,
                background:"rgba(201,168,76,0.08)", display:"block", textAlign:"center"}}>
              Continue with {playedFront ? "Back 9 →" : "← Front 9"}
            </button>
          )}

          {/* Action buttons */}
          <div style={{display:"flex", gap:10, marginBottom:10}}>
            <button onClick={() => setScreen("scorecard")}
              style={{flex:1, padding:"13px", borderRadius:14, cursor:"pointer", border:"0.5px solid rgba(255,255,255,0.12)",
                fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:600, color:"#f0ead6",
                background:"rgba(255,255,255,0.06)", backdropFilter:"blur(12px)"}}>
              📋 Scorecard
            </button>
            <button onClick={() => setScreen("browser")}
              style={{flex:1, padding:"13px", borderRadius:14, cursor:"pointer", border:"0.5px solid rgba(255,255,255,0.12)",
                fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:600, color:"#f0ead6",
                background:"rgba(255,255,255,0.06)", backdropFilter:"blur(12px)"}}>
              🗺 All Holes
            </button>
          </div>

          <button onClick={endRound} style={{width:"100%", padding:"12px", borderRadius:10, border:"0.5px solid #5a2d2d",
            background:"transparent", fontSize:14, cursor:"pointer", color:"#f87171", fontFamily:"'Inter',sans-serif"}}>
            End Round · Start New
          </button>
        </div>
        <TabBar active={null} onSelect={setTab} onGame={() => setScreen("hole")} />
      </div>
    );
  }

  // ── Hole browser screen ───────────────────────────────────────
  if (screen === "browser") {
    const scoreColor = (hi) => {
      if (skipped[hi]) return "#4a6a54";
      const s = scores[hi], d = s - HOLES[hi].par;
      if (!s) return "#2d5a3d";
      if (d <= -2) return "#60a5fa";
      if (d === -1) return "#4ade80";
      if (d === 0)  return "#c9a84c";
      if (d === 1)  return "#fb923c";
      return "#f87171";
    };
    return (
      <div className="app" style={{overflowY:"auto"}}>
        <style>{css}</style>
        <div style={{padding:"1rem 1rem 5rem"}}>
          <div style={{textAlign:"center", padding:"0.8rem 0 1rem"}}>
            <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:22, color:"#c9a84c", marginBottom:2}}>All 18 Holes</h2>
            <p style={{fontSize:15, color:"#7a9e84"}}>Tap any hole to jump to it</p>
          </div>

          {["Front Nine · 1–9", "Back Nine · 10–18"].map((label, half) => (
            <div key={half} style={{marginBottom:16}}>
              <p style={{fontSize:13, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8}}>{label}</p>
              <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8}}>
                {HOLES.slice(half*9, half*9+9).map((h, i) => {
                  const hi = half*9+i;
                  const s = scores[hi];
                  const isSkipped = skipped[hi];
                  const isCurrent = hi === holeIdx;
                  return (
                    <button key={hi} onClick={() => { setHoleIdx(hi); setHoleComplete(false); setScreen("hole"); }}
                      style={{padding:"12px 8px", borderRadius:14, cursor:"pointer", fontFamily:"'Inter',sans-serif",
                        background: isCurrent ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)",
                        border: isCurrent ? "1px solid rgba(201,168,76,0.5)" : "0.5px solid rgba(255,255,255,0.1)",
                        backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
                        boxShadow:"0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
                        display:"flex", flexDirection:"column", alignItems:"center", gap:3}}>
                      <span style={{fontSize:14, color:"#7a9e84"}}>Hole</span>
                      <span style={{fontSize:22, fontWeight:700, color:isCurrent?"#c9a84c":"#f0ead6", lineHeight:1}}>{h.number}</span>
                      <span style={{fontSize:13, color:"#7a9e84"}}>Par {h.par}</span>
                      <span style={{fontSize:16, fontWeight:700, color:scoreColor(hi), marginTop:2}}>
                        {isSkipped ? "—" : s || "·"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <TabBar active={null} onSelect={setTab} onGame={() => setScreen("hole")} />
      </div>
    );
  }

  // ── Scorecard screen ──────────────────────────────────────────
  if (screen === "scorecard") return (
    <div className="app" style={{overflowY:"auto"}}>
      <style>{css}</style>
      <div style={{padding:"1rem 1rem 5rem", maxWidth:420, margin:"0 auto"}}>
        <div style={{textAlign:"center", padding:"1.2rem 0 1rem"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:22, color:"#c9a84c"}}>Scorecard</h2>
          <p style={{fontSize:15, color:"#7a9e84"}}>Miles Grant CC · 18 Holes · Par {totalPar()}</p>
        </div>
        {[{label:"Front Nine", start:0, end:9}, {label:"Back Nine", start:9, end:18}].filter(({start,end}) => start < roundEnd && end > roundStart).map(({label,start,end}) => (
          <div key={label} style={{marginBottom:10}}>
            <p style={{fontSize:13, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", padding:"4px 2px 4px", marginBottom:4}}>{label}</p>
            <div style={{background:"#122018", border:"0.5px solid #2d5a3d", borderRadius:12, overflow:"hidden"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:16, tableLayout:"fixed"}}>
                <thead>
                  <tr style={{borderBottom:"0.5px solid #2d5a3d"}}>
                    <td style={{padding:"8px 10px", color:"#7a9e84", width:36}}>H</td>
                    <td style={{padding:"8px 6px", color:"#7a9e84", width:30, textAlign:"center"}}>Par</td>
                    <td style={{padding:"8px 6px", color:PLAYER_COLOR, fontWeight:600, textAlign:"center"}}>Score</td>
                  </tr>
                </thead>
                <tbody>
                  {HOLES.slice(start, end).map((h, i) => {
                    const hi = start + i;
                    const s = scores[hi];
                    const isSkipped = skipped[hi];
                    const d = s - h.par;
                    return (
                      <tr key={hi} style={{borderTop:"0.5px solid #1e3a28", background:hi===holeIdx?"rgba(201,168,76,0.07)":"transparent"}}>
                        <td style={{padding:"8px 10px", fontWeight:hi===holeIdx?600:400, color:hi===holeIdx?"#c9a84c":"#f0ead6"}}>{h.number}</td>
                        <td style={{padding:"8px 6px", textAlign:"center", color:"#7a9e84"}}>{h.par}</td>
                        <td style={{padding:"8px 6px", textAlign:"center", fontWeight:600,
                          color:isSkipped?"#4a6a54":!s?"#2d5a3d":d<=-2?"#60a5fa":d===-1?"#4ade80":d===0?"#c9a84c":d===1?"#fb923c":"#f87171"}}>
                          {isSkipped ? "—" : s || "·"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{borderTop:"1px solid #2d5a3d", background:"#0a1c12"}}>
                    <td style={{padding:"9px 10px", fontWeight:600, color:"#c9a84c"}}>Out</td>
                    <td style={{padding:"9px 6px", textAlign:"center", fontWeight:600, color:"#7a9e84"}}>
                      {HOLES.slice(start,end).reduce((s,h)=>s+h.par,0)}
                    </td>
                    <td style={{padding:"9px 6px", textAlign:"center", fontWeight:700,
                      color:scores.slice(start,end).every((_,i)=>skipped[start+i])?"#2d5a3d":"#f0ead6"}}>
                      {scores.slice(start,end).reduce((s,v,i)=>s+(skipped[start+i]?0:(v||0)),0) || "·"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <div style={{background:"#1a3a24", border:"0.5px solid #2d5a3d", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <span style={{fontWeight:600, fontSize:18}}>Total</span>
          <div style={{display:"flex", gap:16, alignItems:"center"}}>
            <span style={{color:"#7a9e84", fontSize:16}}>Par {totalPar()}</span>
            <span style={{fontWeight:700, fontSize:18,
              color:totalScore()===0?"#2d5a3d":totalScore()-totalPar()<0?"#4ade80":totalScore()-totalPar()===0?"#c9a84c":"#f87171"}}>
              {totalScore() || "·"}
              {totalScore()>0 && <span style={{fontSize:15, fontWeight:500, color:"#7a9e84", marginLeft:6}}>
                ({totalScore()-totalPar()>=0?"+":""}{totalScore()-totalPar()})
              </span>}
            </span>
          </div>
        </div>
        <button onClick={endRound} style={{width:"100%", padding:"12px", borderRadius:10, border:"0.5px solid #5a2d2d",
          background:"transparent", fontSize:17, cursor:"pointer", color:"#f87171", fontFamily:"'Inter',sans-serif"}}>
          End Round
        </button>
      </div>
      <TabBar active={null} onSelect={setTab} onGame={() => setScreen("hole")} />
    </div>
  );

  // ── Hole screen ───────────────────────────────────────────────
  return (
    <div className="app">
      <style>{css}</style>
      {shotFlashOverlay}
      {tapHintOverlay}
      {locChecked && !locationReady && (
        <LocationGate onGranted={() => setLocationReady(true)} onBack={() => setScreen("lobby")} />
      )}

      {/* Map + overlays */}
      <div className="map-wrap">
        <HoleMap hole={hole} gps={gps} holeShots={holeShots} key={hole.number} />
        <div className="hole-pill">
          <span style={{fontFamily:"'Inter',sans-serif", fontSize:20, fontWeight:800, color:"#d4af37", lineHeight:1}}>
            Hole {hole.number}
          </span>
          <span style={{fontSize:15, fontWeight:700, color:"#f0ead6", marginLeft:6}}>Par {hole.par}</span>
        </div>
        {longestToday > 0 && (
          <div className="longest-pill">
            <span style={{fontSize:12, fontWeight:800, color:"#f0ead6", letterSpacing:"0.04em"}}>🏆 LONGEST TODAY</span>
            <span style={{fontSize:24, fontWeight:900, color:"#d4af37", lineHeight:1}}>{longestToday} <span style={{fontSize:13, color:"#f0ead6"}}>yds</span></span>
          </div>
        )}
        {onShowInstructions && (
          <button className="help-pill" onClick={onShowInstructions} aria-label="How this app works">?</button>
        )}
        {/* Floating shot pill — only when hole not complete */}
        {!holeComplete && (
          <button
            onClick={markShot}
            disabled={!gps}
            aria-label={shotFrom ? "Tap at your ball" : "Tap before swing"}
            className={`swing-btn ${!gps ? "swing-disabled" : shotFrom ? "swing-active" : "swing-idle"}`}>
            {!gps ? "Finding GPS…" : shotFrom ? "Tap at ball" : "Tap before swing"}
          </button>
        )}
      </div>

      {/* Nav bar below map */}
      <div className="hole-nav-bar">
        <button className="hole-nav-btn" onClick={prevHole} disabled={holeIdx===roundStart}>
          {holeIdx===roundStart ? "‹ —" : `‹ Hole ${hole.number - 1}`}
        </button>
        <div className="hole-nav-info">
          <div className="hole-nav-label">Hole {hole.number}</div>
          <div className="hole-nav-sub">{holeIdx - roundStart + 1} of {roundEnd - roundStart}</div>
        </div>
        <button className="hole-nav-btn" onClick={nextHole} disabled={holeIdx===roundEnd-1}>
          {holeIdx===roundEnd-1 ? "— ›" : `Hole ${hole.number + 1} ›`}
        </button>
      </div>

      {/* Bottom panel */}
      <div className="bottom-panel">
        <div style={{padding:"8px 12px 12px"}}>

          {/* Big distance panel — the most important numbers in the app */}
          <div className="big-dist">
            <div className="big-dist-box">
              <p className="big-dist-label">⛳ To pin</p>
              <p className="big-dist-num">{fmtYds(dtg)}</p>
              <p className="big-dist-unit">yards</p>
            </div>
            <div className="big-dist-box">
              <p className="big-dist-label">Last shot</p>
              <p className="big-dist-num" style={{color: lastShot ? "#4ade80" : "#6b8a74"}}>{fmtYds(lastShot)}</p>
              <p className="big-dist-unit">yards</p>
            </div>
          </div>
          {gpsError && <p style={{textAlign:"center", fontSize:18, color:"#f87171", marginBottom:10}}>{gpsError}</p>}

          {/* Next Hole / Round Complete button (after hole completion) */}
          {holeComplete && (
            holeIdx < roundEnd - 1 ? (
              <button onClick={nextHole}
                style={{width:"100%", padding:"15px", borderRadius:14, cursor:"pointer",
                  fontFamily:"'Inter',sans-serif", fontSize:16, fontWeight:700, marginBottom:8,
                  background:"linear-gradient(135deg, rgba(201,168,76,0.25), rgba(201,168,76,0.12))",
                  color:"#c9a84c", border:"1px solid rgba(201,168,76,0.45)",
                  backdropFilter:"blur(14px)", WebkitBackdropFilter:"blur(14px)",
                  boxShadow:"0 4px 16px rgba(201,168,76,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
                  letterSpacing:"0.02em"}}>
                Hole {hole.number + 1} →
              </button>
            ) : (
              <button onClick={() => setScreen("complete")}
                style={{width:"100%", padding:"15px", borderRadius:14, cursor:"pointer",
                  fontFamily:"'Inter',sans-serif", fontSize:16, fontWeight:700, marginBottom:8,
                  background:"linear-gradient(135deg, rgba(74,222,128,0.2), rgba(74,222,128,0.08))",
                  color:"#4ade80", border:"1px solid rgba(74,222,128,0.4)",
                  backdropFilter:"blur(14px)", WebkitBackdropFilter:"blur(14px)",
                  boxShadow:"0 4px 16px rgba(74,222,128,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
                  letterSpacing:"0.02em"}}>
                🏁 Round Complete
              </button>
            )
          )}

          {/* Score row */}
          <div className="glass-card" style={{padding:"8px 10px", marginBottom:8}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6}}>
              <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                <div style={{width:9, height:9, borderRadius:"50%", background:PLAYER_COLOR}} />
                <span style={{fontSize:18, fontWeight:700}}>Score</span>
                {!skipped[holeIdx] && scoreForDisplay > 0 && diff !== null && (
                  <span style={{fontSize:16, padding:"2px 9px", borderRadius:6, fontWeight:600,
                    background:diff<=-2?"#1d4ed8":diff===-1?"#14532d":diff===0?"#3a3a2a":diff===1?"#7c2d12":"#450a0a",
                    color:diff<=-2?"#93c5fd":diff===-1?"#4ade80":diff===0?"#c9a84c":diff===1?"#fb923c":"#fca5a5"}}>
                    {diff===0?"E":diff>0?`+${diff}`:diff}
                  </span>
                )}
                {skipped[holeIdx] && <span style={{fontSize:16, color:"#7a9e84", fontStyle:"italic"}}>skipped</span>}
                {!pickupConfirm && (
                  <button className="pickup-link" style={{fontSize:16}} onClick={() => setPickupConfirm(true)}>pick up</button>
                )}
              </div>
              {!skipped[holeIdx] ? (
                <div style={{display:"flex", alignItems:"center"}}>
                  <button onClick={() => adjustScore(-1)}
                    style={{width:44, height:44, borderRadius:"8px 0 0 8px", border:"0.5px solid #2d5a3d",
                      background:"#122018", color:"#f0ead6", fontSize:24, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>−</button>
                  <div style={{width:44, height:44, background:"#0f2818", border:"0.5px solid #2d5a3d",
                    borderLeft:"none", borderRight:"none", display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:21, fontWeight:800, color:scoreForDisplay?"#f0ead6":"#7a9e84"}}>
                    {scoreForDisplay || "·"}
                  </div>
                  <button onClick={() => adjustScore(1)}
                    style={{width:44, height:44, borderRadius:"0 8px 8px 0", border:"0.5px solid #2d5a3d",
                      background:"#122018", color:"#f0ead6", fontSize:24, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>+</button>
                </div>
              ) : (
                <button onClick={() => setSkipped(prev=>{const n=[...prev];n[holeIdx]=false;return n;})}
                  style={{fontSize:16, color:"#c8d8cc", background:"transparent", border:"0.5px solid #2d5a3d",
                    borderRadius:8, padding:"8px 14px", cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
                  undo
                </button>
              )}
            </div>

            {pickupConfirm && (
              <div style={{display:"flex", alignItems:"center", gap:8, paddingLeft:17, marginBottom:8}}>
                <span style={{fontSize:17, color:"#a3b89a"}}>Skip this hole?</span>
                <button onClick={skipHole}
                  style={{fontSize:17, padding:"8px 14px", borderRadius:7, border:"none",
                    background:"#5a2d2d", color:"#f87171", cursor:"pointer", fontFamily:"'Inter',sans-serif", fontWeight:600}}>
                  Skip hole
                </button>
                <button onClick={() => setPickupConfirm(false)}
                  style={{fontSize:17, padding:"8px 12px", borderRadius:7, border:"0.5px solid #2d5a3d",
                    background:"transparent", color:"#7a9e84", cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
                  Cancel
                </button>
              </div>
            )}

            <button onClick={cupIn}
              style={{width:"100%", padding:"11px", borderRadius:12, border:"0.5px solid rgba(201,168,76,0.35)",
                background:"rgba(201,168,76,0.12)", color:"#c9a84c", fontFamily:"'Inter',sans-serif",
                fontSize:18, fontWeight:700, cursor:"pointer", letterSpacing:"0.02em",
                backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
                boxShadow:"inset 0 1px 0 rgba(201,168,76,0.1)"}}>
              🏆 In the cup — score {shotBasedScore || scores[holeIdx] || 1}
            </button>
          </div>

          {/* Shot log */}
          {holeShots.length > 0 && (
            <div className="glass-card" style={{padding:"8px 12px"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                <p style={{fontSize:16, fontWeight:700, color:"#c8d8cc", textTransform:"uppercase", letterSpacing:"0.08em"}}>Shot log</p>
                <button onClick={clearShots}
                  style={{fontSize:16, color:"#c8d8cc", background:"transparent", border:"none", padding:"6px 4px",
                    cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>Clear</button>
              </div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {holeShots.map((s, i) => {
                  const toPin = Math.round(haversineYards(s.to.lat, s.to.lng, hole.green.lat, hole.green.lng));
                  return (
                    <div key={i} style={{background:"#0f2818", border:"0.5px solid #2d5a3d", borderRadius:10, padding:"10px 12px", fontSize:20}}>
                      <span style={{color:"#c8d8cc"}}>Shot {i+1}: </span>
                      <span style={{fontWeight:800, color:PLAYER_COLOR}}>{fmtYds(s.yards)}</span>
                      <span style={{color:"#c8d8cc"}}> yds · {fmtYds(toPin)} to pin</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <TabBar active="hole" onSelect={setTab} onGame={() => {}} />
    </div>
  );
}

const GUEST_USER = { id: null, email: "" };
const GUEST_PROFILE = { full_name: "Guest" };

export default function App() {
  const [user, setUser]       = useState(undefined); // undefined = checking session, null = signed out
  const [profile, setProfile] = useState(null);
  const [guest, setGuest]     = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  async function loadProfile(u) {
    try {
      await authService.upsertProfile(u);
      setProfile(await authService.getProfile(u.id));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) { loadProfile(session.user); maybeShowInstructions(); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) { loadProfile(session.user); maybeShowInstructions(); } else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  function maybeShowInstructions() {
    try { if (!localStorage.getItem("mg_instructions_seen")) setShowInstructions(true); } catch { /* ignore */ }
  }
  function closeInstructions() {
    try { localStorage.setItem("mg_instructions_seen", "1"); } catch { /* ignore */ }
    setShowInstructions(false);
  }

  const instructionsOverlay = showInstructions && <Instructions onClose={closeInstructions} />;
  const openInstructions = () => setShowInstructions(true);

  if (guest) {
    return (
      <>
        <MainApp user={GUEST_USER} profile={GUEST_PROFILE} isGuest onExitGuest={() => setGuest(false)} onShowInstructions={openInstructions} />
        {instructionsOverlay}
      </>
    );
  }

  if (user === undefined) return (
    <div style={{height:"100dvh", background:"#0a1c12", display:"flex", alignItems:"center", justifyContent:"center", color:"#c9a84c", fontFamily:"'Playfair Display',serif", fontSize:22}}>
      Loading…
    </div>
  );

  if (user) return (
    <>
      <MainApp user={user} profile={profile} onProfileUpdate={setProfile} onShowInstructions={openInstructions} />
      {instructionsOverlay}
    </>
  );

  return (
    <>
      <Auth onGuest={() => { setGuest(true); maybeShowInstructions(); }} onShowInstructions={openInstructions} />
      {instructionsOverlay}
    </>
  );
}
