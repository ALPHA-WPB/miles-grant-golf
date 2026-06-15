import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";

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

const TEE_LABELS = { champ: "Blue", mens: "White", womens: "Red" };
const TEE_ORDER  = ["champ", "mens", "womens"];
const PLAYER_COLOR = "#4ade80";

function haversineYards(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a)) * 1.09361;
}

function HOLE_TEE_COLOR(tee) {
  return { champ:"#3b82f6", mens:"#d1d5db", womens:"#ef4444" }[tee];
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
    try { mapOpts.rotate = true; } catch(_) {}

    const map = L.map(mapRef.current, mapOpts);

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, maxNativeZoom: 19 }
    ).addTo(map);

    map.fitBounds(holePts, { padding: [28, 28] });

    // Apply rotation after bounds are set
    try {
      if (typeof map.setBearing === "function") map.setBearing(rotation);
    } catch(_) {}

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

    return () => { try { map.remove(); } catch(_) {} leafletRef.current = null; };
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
    } catch(_) {}
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
    } catch(_) {}
  }, [holeShots]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  .app { height: 100vh; display: flex; flex-direction: column; background: #0f2818; color: #f0ead6; font-family: 'Inter', sans-serif; overflow: hidden; }
  .serif { font-family: 'Playfair Display', serif; }
  .map-wrap { height: 50vh; flex-shrink: 0; position: relative; overflow: hidden; }
  .bottom-panel { flex: 1; min-height: 0; background: #0a1c12; border-top: 1px solid rgba(45,90,61,0.5); overflow-y: auto; }
  .label { font-size: 10px; color: #7a9e84; text-transform: uppercase; letter-spacing: 0.08em; }
  .tab-bar { display: flex; background: rgba(6,14,9,0.95); border-top: 0.5px solid rgba(45,90,61,0.5); flex-shrink: 0; backdrop-filter: blur(12px); }
  .tab { flex: 1; padding: 12px 0 14px; background: transparent; border: none; color: #7a9e84; font-size: 13px; cursor: pointer; font-family: 'Inter',sans-serif; }
  .tab.active { color: #c9a84c; font-weight: 600; }
  .glass-card { background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 14px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06); }
  .glass-stat { background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.08); border-radius: 12px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 1px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05); }
  .hole-pill { position: absolute; top: 12px; left: 12px; z-index: 1000; background: rgba(10,28,18,0.75); border: 1px solid rgba(201,168,76,0.6); border-radius: 50px; padding: 6px 16px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 2px 8px rgba(0,0,0,0.4); pointer-events: none; }
  .btn-primary { background: #c9a84c; color: #0f2818; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; padding: 14px; cursor: pointer; width: 100%; font-family: 'Inter',sans-serif; letter-spacing:0.02em; }
  .btn-ghost { background: transparent; border: 0.5px solid #2d5a3d; border-radius: 8px; color: #a3b89a; font-size: 13px; padding: 6px 14px; cursor: pointer; font-family: 'Inter',sans-serif; }
  input[type=text] { background: rgba(10,28,18,0.7); border: 0.5px solid #2d5a3d; border-radius: 8px; color: #f0ead6; font-size: 15px; padding: 8px 12px; font-family: 'Inter',sans-serif; outline: none; width: 100%; }
  .leaflet-container { background: #0d2416; }
  .gps-tip { background: rgba(8,26,16,0.9) !important; border: 1px solid #4ade80 !important; color: #4ade80 !important; font-size: 11px !important; font-weight: 600 !important; font-family: 'Inter',sans-serif; box-shadow: none !important; }
  .gps-tip::before { display: none !important; }
  .pickup-link { background: none; border: none; color: #7a9e84; font-size: 11px; cursor: pointer; font-family: 'Inter',sans-serif; text-decoration: underline; padding: 0 0 0 4px; }
  .pickup-link:hover { color: #f87171; }
  .setup-bg { position: fixed; inset: 0; background-image: url('/course-bg.jpg'); background-size: cover; background-position: center 30%; z-index: 0; }
  .setup-overlay { position: fixed; inset: 0; background: linear-gradient(to bottom, rgba(5,16,10,0.2) 0%, rgba(5,16,10,0.55) 38%, rgba(5,16,10,0.96) 62%, rgba(5,16,10,1) 100%); z-index: 1; }
  .setup-content { position: relative; z-index: 2; height: 100vh; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 1.5rem; padding-bottom: calc(20vh + max(env(safe-area-inset-bottom), 14px)); }
  .hole-nav-bar { display: flex; align-items: center; background: rgba(6,14,9,0.95); border-bottom: 0.5px solid rgba(45,90,61,0.5); padding: 0; flex-shrink: 0; backdrop-filter: blur(12px); }
  .hole-nav-btn { flex: 1; background: transparent; border: none; color: #e8dfc8; font-size: 15px; font-weight: 600; cursor: pointer; padding: 13px 10px; font-family: 'Inter',sans-serif; display: flex; align-items: center; justify-content: center; }
  .hole-nav-btn:disabled { color: #2d5a3d; cursor: default; }
  .hole-nav-info { flex: 2; text-align: center; }
  .hole-nav-label { font-size: 13px; color: #c9a84c; font-weight: 700; font-family: 'Playfair Display',serif; }
  .hole-nav-sub { font-size: 10px; color: #7a9e84; }
`;

export default function App() {
  const [screen, setScreen]       = useState("setup");
  const [playerTee, setPlayerTee]   = useState("mens");
  const [holeIdx, setHoleIdx]       = useState(0);
  const [scores, setScores]         = useState(() => Array(HOLES.length).fill(0));
  const [skipped, setSkipped]       = useState(() => Array(HOLES.length).fill(false));
  const [pickupConfirm, setPickupConfirm] = useState(false);
  const [shots, setShots]           = useState(() => Array(HOLES.length).fill(null).map(() => []));
  const [gps, setGps]               = useState(null);
  const [gpsError, setGpsError]     = useState(null);
  const [shotFrom, setShotFrom]     = useState(null);
  const watchRef                    = useRef(null);

  const hole = HOLES[holeIdx];
  const holeShots = shots[holeIdx];
  const completedShots = holeShots.length;
  const inProgress = shotFrom !== null;
  const shotBasedScore = Math.max(1, completedShots + (inProgress ? 1 : 0));

  useEffect(() => {
    if (screen !== "hole") return;
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
  }, [screen]);

  function distToGreen() {
    if (!gps) return null;
    const d = Math.round(haversineYards(gps.lat, gps.lng, hole.green.lat, hole.green.lng));
    return d <= 600 ? d : null;
  }

  function markShot() {
    if (!gps) return;
    if (shotFrom) {
      const yards = Math.round(haversineYards(shotFrom.lat, shotFrom.lng, gps.lat, gps.lng));
      setShots(prev => {
        const next = prev.map(h => [...h]);
        next[holeIdx] = [...next[holeIdx], { from: shotFrom, to: { lat: gps.lat, lng: gps.lng }, yards }];
        return next;
      });
    }
    setShotFrom({ lat: gps.lat, lng: gps.lng });
  }

  function cupIn() {
    const final = shotBasedScore;
    setScores(prev => { const n = [...prev]; n[holeIdx] = final; return n; });
    setSkipped(prev => { const n = [...prev]; n[holeIdx] = false; return n; });
    setShotFrom(null);
    setPickupConfirm(false);
  }

  function adjustScore(delta) {
    setScores(prev => { const n = [...prev]; n[holeIdx] = Math.max(1, (n[holeIdx] || shotBasedScore) + delta); return n; });
    setSkipped(prev => { const n = [...prev]; n[holeIdx] = false; return n; });
  }

  function skipHole() {
    setSkipped(prev => { const n = [...prev]; n[holeIdx] = true; return n; });
    setScores(prev => { const n = [...prev]; n[holeIdx] = 0; return n; });
    setShotFrom(null);
    setPickupConfirm(false);
  }

  function clearShots() {
    setShots(prev => { const n = [...prev]; n[holeIdx] = []; return n; });
    setShotFrom(null);
  }

  function nextHole() {
    setHoleIdx(i => Math.min(HOLES.length - 1, i + 1));
    setShotFrom(null);
    setPickupConfirm(false);
  }

  function prevHole() {
    setHoleIdx(i => Math.max(0, i - 1));
    setShotFrom(null);
    setPickupConfirm(false);
  }

  function totalScore() { return scores.reduce((s, v, i) => s + (skipped[i] ? 0 : (v || 0)), 0); }
  function totalPar()   { return HOLES.reduce((s, h) => s + h.par, 0); }

  const dtg = distToGreen();
  const displayScore = scores[holeIdx] || (inProgress || completedShots > 0 ? shotBasedScore : 0);
  const scoreForDisplay = skipped[holeIdx] ? null : displayScore;
  const diff = scoreForDisplay ? scoreForDisplay - hole.par : null;
  const lastShot = holeShots.length > 0 ? holeShots[holeShots.length - 1].yards : null;

  // ── Setup screen ──────────────────────────────────────────────
  if (screen === "setup") return (
    <div style={{position:"relative", height:"100vh", overflow:"hidden", fontFamily:"'Inter',sans-serif", color:"#f0ead6"}}>
      <style>{css}</style>
      <div className="setup-bg" />
      <div className="setup-overlay" />
      <div className="setup-content">
        {/* Title block */}
        <div style={{textAlign:"center", marginBottom:"1rem"}}>
          <h1 style={{fontFamily:"'Playfair Display',serif", fontSize:42, fontWeight:700, color:"#fff", lineHeight:1.05, marginBottom:6, textShadow:"0 2px 16px rgba(0,0,0,0.7)"}}>
            Miles Grant<br/>Country Club
          </h1>
          <p style={{fontSize:13, fontWeight:600, color:"rgba(201,168,76,0.9)", letterSpacing:"0.06em", marginBottom:8, textTransform:"uppercase"}}>
            Unofficial Free Golf App
          </p>
          <p style={{fontSize:13, color:"rgba(240,234,214,0.7)", marginBottom:6}}>Stuart, Florida · 18 Holes</p>
          <p style={{fontSize:12, color:"rgba(201,168,76,0.65)", lineHeight:1.5, padding:"0 0.5rem"}}>
            Real-time GPS yardage to the pin,<br/>with automatic shot distance tracking
          </p>
        </div>

        {/* Tee selector + Start */}
        <div style={{background:"rgba(8,26,16,0.82)", border:"0.5px solid rgba(45,90,61,0.8)", borderRadius:16, padding:"1rem 1.25rem 1.25rem", backdropFilter:"blur(12px)", marginBottom:"0.75rem"}}>
          <p style={{fontSize:10, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8}}>Select tee</p>
          <div style={{display:"flex", gap:8, marginBottom:16}}>
            {TEE_ORDER.map(t => (
              <button key={t} onClick={() => setPlayerTee(t)}
                style={{flex:1, padding:"11px 0", borderRadius:10, cursor:"pointer",
                  fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:playerTee===t?600:400,
                  background:playerTee===t?(t==="champ"?"rgba(30,58,95,0.9)":t==="mens"?"rgba(58,58,58,0.9)":"rgba(90,26,26,0.9)"):"rgba(18,32,24,0.6)",
                  color:playerTee===t?(t==="champ"?"#60a5fa":t==="mens"?"#e8e8e8":"#f87171"):"#7a9e84",
                  border:playerTee===t?`1.5px solid ${HOLE_TEE_COLOR(t)}`:"0.5px solid rgba(45,90,61,0.6)"}}>
                {TEE_LABELS[t]}
              </button>
            ))}
          </div>

          <button className="btn-primary" onClick={() => setScreen("hole")}>
            Start Round ›
          </button>
        </div>

        {/* Disclaimer */}
        <p style={{fontSize:10, color:"rgba(240,234,214,0.35)", textAlign:"center", lineHeight:1.55, padding:"0 0.5rem"}}>
          Unofficial app · Not affiliated with Miles Grant Country Club<br/>
          Free for all members &amp; guests · No data saved or tracked
        </p>
      </div>
    </div>
  );

  // ── Scorecard screen ──────────────────────────────────────────
  if (screen === "scorecard") return (
    <div className="app" style={{overflowY:"auto"}}>
      <style>{css}</style>
      <div style={{padding:"1rem 1rem 5rem", maxWidth:420, margin:"0 auto"}}>
        <div style={{textAlign:"center", padding:"1.2rem 0 1rem"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:22, color:"#c9a84c"}}>Scorecard</h2>
          <p style={{fontSize:12, color:"#7a9e84"}}>Miles Grant CC · 18 Holes · Par {totalPar()}</p>
        </div>
        {/* Front 9 */}
        {[{label:"Front Nine", start:0, end:9}, {label:"Back Nine", start:9, end:18}].map(({label,start,end}) => (
          <div key={label} style={{marginBottom:10}}>
            <p style={{fontSize:10, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", padding:"4px 2px 4px", marginBottom:4}}>{label}</p>
            <div style={{background:"#122018", border:"0.5px solid #2d5a3d", borderRadius:12, overflow:"hidden"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13, tableLayout:"fixed"}}>
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
        {/* Total */}
        <div style={{background:"#1a3a24", border:"0.5px solid #2d5a3d", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <span style={{fontWeight:600, fontSize:15}}>Total</span>
          <div style={{display:"flex", gap:16, alignItems:"center"}}>
            <span style={{color:"#7a9e84", fontSize:13}}>Par {totalPar()}</span>
            <span style={{fontWeight:700, fontSize:18,
              color:totalScore()===0?"#2d5a3d":totalScore()-totalPar()<0?"#4ade80":totalScore()-totalPar()===0?"#c9a84c":"#f87171"}}>
              {totalScore() || "·"}
              {totalScore()>0 && <span style={{fontSize:12, fontWeight:500, color:"#7a9e84", marginLeft:6}}>
                ({totalScore()-totalPar()>=0?"+":""}{totalScore()-totalPar()})
              </span>}
            </span>
          </div>
        </div>
        <button onClick={() => {
          setScreen("setup"); setHoleIdx(0);
          setScores(Array(HOLES.length).fill(0));
          setSkipped(Array(HOLES.length).fill(false));
          setShots(Array(HOLES.length).fill(null).map(()=>[]));
          setShotFrom(null); setPickupConfirm(false);
        }} style={{width:"100%", padding:"12px", borderRadius:10, border:"0.5px solid #5a2d2d",
          background:"transparent", fontSize:14, cursor:"pointer", color:"#f87171", fontFamily:"'Inter',sans-serif"}}>
          End Round
        </button>
      </div>
      <div className="tab-bar">
        <button className="tab" onClick={() => setScreen("hole")}>⛳ Hole</button>
        <button className="tab active">📋 Scores</button>
      </div>
    </div>
  );

  // ── Hole screen ───────────────────────────────────────────────
  return (
    <div className="app">
      <style>{css}</style>

      {/* Header */}
      <div style={{padding:"6px 16px 5px", flexShrink:0, borderBottom:"0.5px solid #1a3a24"}}>
        <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:22, color:"#c9a84c", lineHeight:1.15, marginBottom:1}}>
          The Unofficial Miles Grant Golf Companion
        </h2>
        <p style={{fontSize:11, color:"#7a9e84"}}>Hole {hole.number} · Par {hole.par} · HCP {hole.handicap}</p>
      </div>

      {/* Map + hole pill overlay */}
      <div className="map-wrap">
        <HoleMap hole={hole} gps={gps} holeShots={holeShots} key={hole.number} />
        <div className="hole-pill">
          <span style={{fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:700, color:"#c9a84c", lineHeight:1}}>
            Hole {hole.number}
          </span>
          <span style={{fontSize:11, color:"rgba(240,234,214,0.6)", marginLeft:6}}>Par {hole.par}</span>
        </div>
      </div>

      {/* Nav bar below map */}
      <div className="hole-nav-bar">
        <button className="hole-nav-btn" onClick={prevHole} disabled={holeIdx===0}>
          {holeIdx===0 ? "‹ —" : `‹ Hole ${hole.number - 1}`}
        </button>
        <div className="hole-nav-info">
          <div className="hole-nav-label">Hole {hole.number}</div>
          <div className="hole-nav-sub">{holeIdx+1} of {HOLES.length}</div>
        </div>
        <button className="hole-nav-btn" onClick={nextHole} disabled={holeIdx===HOLES.length-1}>
          {holeIdx===HOLES.length-1 ? "— ›" : `Hole ${hole.number + 1} ›`}
        </button>
      </div>

      {/* Bottom panel */}
      <div className="bottom-panel">
        <div style={{padding:"10px 14px 16px"}}>

          {/* Stat row */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:10}}>
            <div className="glass-stat" style={{padding:"7px 8px", textAlign:"center"}}>
              <p style={{fontSize:10, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2}}>To pin</p>
              <p style={{fontSize:24, fontWeight:700, lineHeight:1,
                color:dtg?(dtg<100?"#4ade80":dtg<175?"#c9a84c":"#f0ead6"):"#7a9e84"}}>
                {dtg ?? "—"}
              </p>
              <p style={{fontSize:9, color:"#7a9e84"}}>yards</p>
              {gpsError && <p style={{fontSize:9, color:"#f87171"}}>{gpsError}</p>}
            </div>
            <div className="glass-stat" style={{padding:"7px 8px", textAlign:"center"}}>
              <p style={{fontSize:10, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2}}>Tee</p>
              <p style={{fontSize:24, fontWeight:700, lineHeight:1, color:"#f0ead6"}}>{hole.tees[playerTee].yards}</p>
              <p style={{fontSize:9, color:"#7a9e84"}}>yards</p>
            </div>
            <div className="glass-stat" style={{padding:"7px 8px", textAlign:"center"}}>
              <p style={{fontSize:10, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2}}>Last shot</p>
              <p style={{fontSize:24, fontWeight:700, lineHeight:1, color:lastShot?"#4ade80":"#7a9e84"}}>{lastShot ?? "—"}</p>
              <p style={{fontSize:9, color:"#7a9e84"}}>yards</p>
            </div>
          </div>

          {/* Shot button */}
          <button onClick={markShot} disabled={!gps}
            style={{width:"100%", padding:"11px", borderRadius:12, cursor:gps?"pointer":"not-allowed",
              fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:500, marginBottom:8,
              background:shotFrom?"rgba(251,191,36,0.1)":"rgba(255,255,255,0.05)",
              color:shotFrom?"#fbbf24":"#a3b89a",
              border:shotFrom?"1px solid rgba(146,64,14,0.8)":"0.5px solid rgba(255,255,255,0.1)",
              backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
              boxShadow:"inset 0 1px 0 rgba(255,255,255,0.05)",
              opacity:gps?1:0.5}}>
            🏌️ {shotFrom ? `Shot ${completedShots + 1} in progress — tap before next swing` : "Tap before your swing"}
          </button>

          {/* Score row */}
          <div className="glass-card" style={{padding:"10px 12px", marginBottom:8}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
              <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                <div style={{width:9, height:9, borderRadius:"50%", background:PLAYER_COLOR}} />
                <span style={{fontSize:14, fontWeight:500}}>Score</span>
                {!skipped[holeIdx] && scoreForDisplay > 0 && diff !== null && (
                  <span style={{fontSize:11, padding:"1px 7px", borderRadius:6, fontWeight:600,
                    background:diff<=-2?"#1d4ed8":diff===-1?"#14532d":diff===0?"#3a3a2a":diff===1?"#7c2d12":"#450a0a",
                    color:diff<=-2?"#93c5fd":diff===-1?"#4ade80":diff===0?"#c9a84c":diff===1?"#fb923c":"#fca5a5"}}>
                    {diff===0?"E":diff>0?`+${diff}`:diff}
                  </span>
                )}
                {skipped[holeIdx] && <span style={{fontSize:11, color:"#4a6a54", fontStyle:"italic"}}>skipped</span>}
                {!pickupConfirm && (
                  <button className="pickup-link" onClick={() => setPickupConfirm(true)}>pick up</button>
                )}
              </div>
              {!skipped[holeIdx] ? (
                <div style={{display:"flex", alignItems:"center"}}>
                  <button onClick={() => adjustScore(-1)}
                    style={{width:34, height:34, borderRadius:"8px 0 0 8px", border:"0.5px solid #2d5a3d",
                      background:"#122018", color:"#f0ead6", fontSize:20, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>−</button>
                  <div style={{width:34, height:34, background:"#0f2818", border:"0.5px solid #2d5a3d",
                    borderLeft:"none", borderRight:"none", display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:15, fontWeight:700, color:scoreForDisplay?"#f0ead6":"#7a9e84"}}>
                    {scoreForDisplay || "·"}
                  </div>
                  <button onClick={() => adjustScore(1)}
                    style={{width:34, height:34, borderRadius:"0 8px 8px 0", border:"0.5px solid #2d5a3d",
                      background:"#122018", color:"#f0ead6", fontSize:20, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>+</button>
                </div>
              ) : (
                <button onClick={() => setSkipped(prev=>{const n=[...prev];n[holeIdx]=false;return n;})}
                  style={{fontSize:11, color:"#7a9e84", background:"transparent", border:"0.5px solid #2d5a3d",
                    borderRadius:8, padding:"4px 10px", cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
                  undo
                </button>
              )}
            </div>

            {pickupConfirm && (
              <div style={{display:"flex", alignItems:"center", gap:8, paddingLeft:17, marginBottom:8}}>
                <span style={{fontSize:12, color:"#a3b89a"}}>Skip this hole?</span>
                <button onClick={skipHole}
                  style={{fontSize:12, padding:"3px 12px", borderRadius:7, border:"none",
                    background:"#5a2d2d", color:"#f87171", cursor:"pointer", fontFamily:"'Inter',sans-serif", fontWeight:600}}>
                  Skip hole
                </button>
                <button onClick={() => setPickupConfirm(false)}
                  style={{fontSize:12, padding:"3px 10px", borderRadius:7, border:"0.5px solid #2d5a3d",
                    background:"transparent", color:"#7a9e84", cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
                  Cancel
                </button>
              </div>
            )}

            <button onClick={cupIn}
              style={{width:"100%", padding:"11px", borderRadius:12, border:"0.5px solid rgba(201,168,76,0.35)",
                background:"rgba(201,168,76,0.12)", color:"#c9a84c", fontFamily:"'Inter',sans-serif",
                fontSize:14, fontWeight:600, cursor:"pointer", letterSpacing:"0.02em",
                backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
                boxShadow:"inset 0 1px 0 rgba(201,168,76,0.1)"}}>
              🏆 In the cup — score {shotBasedScore || scores[holeIdx] || 1}
            </button>
          </div>

          {/* Shot log */}
          {holeShots.length > 0 && (
            <div className="glass-card" style={{padding:"8px 12px"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                <p style={{fontSize:10, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em"}}>Shot log</p>
                <button onClick={clearShots}
                  style={{fontSize:10, color:"#7a9e84", background:"transparent", border:"none",
                    cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>Clear</button>
              </div>
              <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                {holeShots.map((s, i) => {
                  const toPin = Math.round(haversineYards(s.to.lat, s.to.lng, hole.green.lat, hole.green.lng));
                  return (
                    <div key={i} style={{background:"#0f2818", border:"0.5px solid #2d5a3d", borderRadius:6, padding:"4px 8px", fontSize:12}}>
                      <span style={{color:"#7a9e84"}}>#{i+1} </span>
                      <span style={{fontWeight:600, color:PLAYER_COLOR}}>{s.yards}</span>
                      <span style={{color:"#7a9e84"}}> yds · {toPin} to pin</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="tab-bar">
        <button className="tab active">⛳ Hole</button>
        <button className="tab" onClick={() => setScreen("scorecard")}>📋 Scores</button>
      </div>
    </div>
  );
}
