import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const HOLES = [
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
      champ:  { lat: 27.14645268, lng: -80.17935540, yards: 132 },
      mens:   { lat: 27.14645268, lng: -80.17935540, yards: 120 },
      womens: { lat: 27.14645268, lng: -80.17935540, yards: 108 },
    },
    green: { lat: 27.14538377, lng: -80.17929777 },
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
];

const TEE_LABELS = { champ: "Blue", mens: "White", womens: "Red" };
const TEE_ORDER  = ["champ", "mens", "womens"];
const PLAYER_COLORS = ["#4ade80","#60a5fa","#f472b6","#fb923c"];

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

function makeIcon(color, label) {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;font-family:Inter,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

const flagIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:20px;height:32px"><div style="position:absolute;left:0;top:0;width:2px;height:28px;background:#fff;border-radius:1px"></div><div style="position:absolute;left:2px;top:0;width:12px;height:8px;background:#ef4444;clip-path:polygon(0 0,100% 50%,0 100%)"></div><div style="position:absolute;bottom:0;left:-4px;width:10px;height:2px;background:#fff;border-radius:2px;opacity:0.7"></div></div>`,
  iconSize: [20, 32],
  iconAnchor: [0, 28],
});

const gpsIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#4ade80;border:2px solid #fff;box-shadow:0 0 0 4px rgba(74,222,128,0.3)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function HoleMap({ hole, gps }) {
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);
  const gpsMarkerRef = useRef(null);
  const lineRef = useRef(null);

  // Fit map to hole (tees + green), never GPS
  const holePts = [
    [hole.tees.champ.lat,  hole.tees.champ.lng],
    [hole.tees.mens.lat,   hole.tees.mens.lng],
    [hole.tees.womens.lat, hole.tees.womens.lng],
    [hole.green.lat,       hole.green.lng],
  ];

  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletRef.current) {
      leafletRef.current.remove();
      leafletRef.current = null;
    }

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
    });

    // Esri World Imagery — free satellite tiles, no API key
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20 }
    ).addTo(map);

    // Fit to hole bounds with padding
    map.fitBounds(holePts, { padding: [24, 24] });

    // Fairway line
    const midTee = [hole.tees.mens.lat, hole.tees.mens.lng];
    const greenPt = [hole.green.lat, hole.green.lng];
    lineRef.current = L.polyline([midTee, greenPt], {
      color: "#c9a84c", weight: 2, dashArray: "6,6", opacity: 0.8,
    }).addTo(map);

    // Tee markers
    const teeMarkers = [
      L.marker([hole.tees.champ.lat,  hole.tees.champ.lng],  { icon: makeIcon("#3b82f6", "B") }).addTo(map),
      L.marker([hole.tees.mens.lat,   hole.tees.mens.lng],   { icon: makeIcon("#9ca3af", "W") }).addTo(map),
      L.marker([hole.tees.womens.lat, hole.tees.womens.lng], { icon: makeIcon("#ef4444", "R") }).addTo(map),
    ];

    // Flag on green
    const flagMarker = L.marker([hole.green.lat, hole.green.lng], { icon: flagIcon }).addTo(map);

    markersRef.current = [...teeMarkers, flagMarker];
    leafletRef.current = map;

    return () => { map.remove(); leafletRef.current = null; };
  }, [hole.number]);

  // Update GPS dot separately without re-creating the map
  useEffect(() => {
    const map = leafletRef.current;
    if (!map) return;

    if (gpsMarkerRef.current) {
      map.removeLayer(gpsMarkerRef.current);
      gpsMarkerRef.current = null;
    }

    if (gps) {
      gpsMarkerRef.current = L.marker([gps.lat, gps.lng], { icon: gpsIcon })
        .bindTooltip("You", { permanent: true, direction: "right", className: "gps-tip", offset: [8, 0] })
        .addTo(map);
    }
  }, [gps]);

  return (
    <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  .app { height: 100vh; display: flex; flex-direction: column; background: #0f2818; color: #f0ead6; font-family: 'Inter', sans-serif; overflow: hidden; }
  .serif { font-family: 'Playfair Display', serif; }
  .map-wrap { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  .bottom-panel { flex-shrink: 0; background: #0f2818; border-top: 1px solid #2d5a3d; overflow-y: auto; max-height: 55vh; }
  .card { background: #1a3a24; border: 0.5px solid #2d5a3d; border-radius: 12px; padding: 12px 14px; }
  .label { font-size: 10px; color: #7a9e84; text-transform: uppercase; letter-spacing: 0.08em; }
  .tab-bar { display: flex; background: #081a10; border-top: 0.5px solid #2d5a3d; flex-shrink: 0; }
  .tab { flex: 1; padding: 11px 0 13px; background: transparent; border: none; color: #7a9e84; font-size: 11px; cursor: pointer; font-family: 'Inter',sans-serif; }
  .tab.active { color: #c9a84c; }
  .btn-primary { background: #c9a84c; color: #0f2818; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; padding: 13px; cursor: pointer; width: 100%; font-family: 'Inter',sans-serif; }
  .btn-ghost { background: transparent; border: 0.5px solid #2d5a3d; border-radius: 8px; color: #a3b89a; font-size: 13px; padding: 6px 14px; cursor: pointer; font-family: 'Inter',sans-serif; }
  input[type=text] { background: #122018; border: 0.5px solid #2d5a3d; border-radius: 8px; color: #f0ead6; font-size: 15px; padding: 8px 12px; font-family: 'Inter',sans-serif; outline: none; width: 100%; }
  .leaflet-container { background: #0d2416; }
  .gps-tip { background: rgba(8,26,16,0.9) !important; border: 1px solid #4ade80 !important; color: #4ade80 !important; font-size: 11px !important; font-weight: 600; font-family: 'Inter',sans-serif; box-shadow: none !important; }
  .gps-tip::before { display: none !important; }
`;

export default function App() {
  const [screen, setScreen]     = useState("setup");
  const [players, setPlayers]   = useState([
    { name: "Player 1", tee: "mens", active: true },
    { name: "Player 2", tee: "mens", active: false },
    { name: "Player 3", tee: "mens", active: false },
    { name: "Player 4", tee: "mens", active: false },
  ]);
  const [holeIdx, setHoleIdx]   = useState(0);
  const [scores, setScores]     = useState(
    Array(4).fill(null).map(() => Array(HOLES.length).fill(0))
  );
  const [shots, setShots]       = useState(Array(HOLES.length).fill(null).map(() => []));
  const [gps, setGps]           = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [shotFrom, setShotFrom] = useState(null);
  const watchRef                = useRef(null);

  const activePlayers = players.filter(p => p.active);
  const hole = HOLES[holeIdx];

  useEffect(() => {
    if (screen !== "hole") return;
    if (!navigator.geolocation) { setGpsError("GPS not available"); return; }
    watchRef.current = navigator.geolocation.watchPosition(
      pos => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) }); setGpsError(null); },
      () => setGpsError("GPS unavailable"),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return () => navigator.geolocation.clearWatch(watchRef.current);
  }, [screen]);

  function distToGreen() {
    if (!gps) return null;
    return Math.round(haversineYards(gps.lat, gps.lng, hole.green.lat, hole.green.lng));
  }

  function markShot() {
    if (!gps) return;
    if (!shotFrom) {
      setShotFrom({ lat: gps.lat, lng: gps.lng });
    } else {
      const yards = Math.round(haversineYards(shotFrom.lat, shotFrom.lng, gps.lat, gps.lng));
      setShots(prev => {
        const next = prev.map(h => [...h]);
        next[holeIdx] = [...next[holeIdx], { from: shotFrom, to: { lat: gps.lat, lng: gps.lng }, yards }];
        return next;
      });
      setShotFrom(null);
    }
  }

  function clearShots() {
    setShots(prev => { const n = [...prev]; n[holeIdx] = []; return n; });
    setShotFrom(null);
  }

  function updateScore(pi, delta) {
    setScores(prev => {
      const n = prev.map(r => [...r]);
      n[pi][holeIdx] = Math.max(0, (n[pi][holeIdx] || 0) + delta);
      return n;
    });
  }

  function totalScore(pi) { return scores[pi].reduce((s,v)=>s+(v||0),0); }
  function totalPar()     { return HOLES.reduce((s,h)=>s+h.par,0); }

  const dtg = distToGreen();
  const holeShots = shots[holeIdx];

  if (screen === "setup") return (
    <div className="app" style={{overflowY:"auto"}}>
      <style>{css}</style>
      <div style={{padding:"1.5rem 1rem 5rem", maxWidth:420, margin:"0 auto"}}>
        <div style={{textAlign:"center", padding:"2rem 0 1.5rem"}}>
          <div style={{fontSize:36, marginBottom:8}}>⛳</div>
          <h1 className="serif" style={{fontSize:26, color:"#c9a84c", marginBottom:4}}>Miles Grant CC</h1>
          <p style={{fontSize:13, color:"#7a9e84"}}>Stuart, Florida</p>
        </div>
        <p className="label" style={{marginBottom:10}}>Players</p>
        {players.map((p, i) => (
          <div key={i} className="card" style={{marginBottom:8, opacity: p.active ? 1 : 0.45}}>
            <div style={{display:"flex", alignItems:"center", gap:10, marginBottom: p.active ? 10 : 0}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:PLAYER_COLORS[i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600,color:"#0f2818",flexShrink:0}}>{i+1}</div>
              <input type="text" value={p.name} disabled={!p.active}
                onChange={e => setPlayers(prev => prev.map((pl,j) => j===i?{...pl,name:e.target.value}:pl))}
                style={{border:"none",background:"transparent",color:p.active?"#f0ead6":"#7a9e84",width:"auto",flex:1,padding:0}} />
              <button className="btn-ghost"
                style={{fontSize:11,padding:"4px 10px",color:p.active?"#f87171":"#7a9e84",borderColor:p.active?"#5a2d2d":"#2d5a3d"}}
                onClick={() => setPlayers(prev => prev.map((pl,j) => j===i?{...pl,active:!pl.active}:pl))}>
                {p.active ? "Remove" : "Add"}
              </button>
            </div>
            {p.active && (
              <div style={{display:"flex", gap:6, paddingLeft:42}}>
                {TEE_ORDER.map(t => (
                  <button key={t} onClick={() => setPlayers(prev => prev.map((pl,j) => j===i?{...pl,tee:t}:pl))}
                    style={{fontSize:12,padding:"4px 12px",borderRadius:8,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:p.tee===t?600:400,
                      background:p.tee===t?(t==="champ"?"#1e3a5f":t==="mens"?"#3a3a3a":"#5a1a1a"):"#122018",
                      color:p.tee===t?(t==="champ"?"#60a5fa":t==="mens"?"#e8e8e8":"#f87171"):"#7a9e84",
                      border:p.tee===t?`1.5px solid ${HOLE_TEE_COLOR(t)}`:"0.5px solid #2d5a3d"}}>
                    {TEE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <button className="btn-primary" style={{marginTop:16}} onClick={() => setScreen("hole")}
          disabled={activePlayers.length===0}>Start Round</button>
      </div>
    </div>
  );

  if (screen === "scorecard") return (
    <div className="app" style={{overflowY:"auto"}}>
      <style>{css}</style>
      <div style={{padding:"1rem 1rem 5rem", maxWidth:420, margin:"0 auto"}}>
        <div style={{textAlign:"center",padding:"1.2rem 0 1rem"}}>
          <h2 className="serif" style={{fontSize:22,color:"#c9a84c"}}>Scorecard</h2>
          <p style={{fontSize:12,color:"#7a9e84"}}>Miles Grant CC · {HOLES.length} holes</p>
        </div>
        <div style={{background:"#122018",border:"0.5px solid #2d5a3d",borderRadius:12,overflow:"hidden",marginBottom:12}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,tableLayout:"fixed"}}>
            <thead>
              <tr style={{borderBottom:"0.5px solid #2d5a3d"}}>
                <td style={{padding:"9px 10px",color:"#7a9e84",width:36,textAlign:"center"}}>H</td>
                <td style={{padding:"9px 6px",color:"#7a9e84",width:28,textAlign:"center"}}>Par</td>
                {activePlayers.map((p,i) => (
                  <td key={i} style={{padding:"9px 6px",textAlign:"center",fontWeight:600,color:PLAYER_COLORS[players.indexOf(p)]}}>
                    {p.name.split(" ")[0]}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOLES.map((h,hi) => (
                <tr key={hi} style={{borderTop:"0.5px solid #1e3a28",background:hi===holeIdx?"rgba(201,168,76,0.07)":"transparent"}}>
                  <td style={{padding:"9px 10px",textAlign:"center",fontWeight:hi===holeIdx?600:400,color:hi===holeIdx?"#c9a84c":"#f0ead6"}}>{h.number}</td>
                  <td style={{padding:"9px 6px",textAlign:"center",color:"#7a9e84"}}>{h.par}</td>
                  {activePlayers.map((p,i) => {
                    const pi = players.indexOf(p);
                    const s = scores[pi][hi];
                    const diff = s - h.par;
                    return (
                      <td key={i} style={{padding:"9px 6px",textAlign:"center",fontWeight:600,
                        color:!s?"#2d5a3d":diff<=-2?"#60a5fa":diff===-1?"#4ade80":diff===0?"#c9a84c":diff===1?"#fb923c":"#f87171"}}>
                        {s||"·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr style={{borderTop:"1px solid #2d5a3d",background:"#0a1c12"}}>
                <td style={{padding:"10px",textAlign:"center",fontWeight:600,color:"#c9a84c"}}>Tot</td>
                <td style={{padding:"10px 6px",textAlign:"center",fontWeight:600,color:"#7a9e84"}}>{totalPar()}</td>
                {activePlayers.map((p,i) => {
                  const pi = players.indexOf(p);
                  const t = totalScore(pi);
                  const diff = t - totalPar();
                  return (
                    <td key={i} style={{padding:"10px 6px",textAlign:"center",fontWeight:700,fontSize:14,
                      color:!t?"#2d5a3d":diff<0?"#4ade80":diff===0?"#c9a84c":"#f87171"}}>
                      {t||"·"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <button onClick={() => { setScreen("setup"); setHoleIdx(0); setScores(Array(4).fill(null).map(()=>Array(HOLES.length).fill(0))); setShots(Array(HOLES.length).fill(null).map(()=>[])); setShotFrom(null); }}
          style={{width:"100%",padding:"11px",borderRadius:10,border:"0.5px solid #5a2d2d",background:"transparent",fontSize:14,cursor:"pointer",color:"#f87171",fontFamily:"'Inter',sans-serif"}}>
          End Round
        </button>
      </div>
      <div className="tab-bar">
        <button className="tab" onClick={()=>setScreen("hole")}>⛳ Hole</button>
        <button className="tab active">📋 Scores</button>
      </div>
    </div>
  );

  return (
    <div className="app">
      <style>{css}</style>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px 6px",flexShrink:0}}>
        <div>
          <p className="label">Miles Grant CC</p>
          <h2 className="serif" style={{fontSize:18,color:"#c9a84c",lineHeight:1.1}}>
            Hole {hole.number} · Par {hole.par} · HCP {hole.handicap}
          </h2>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button style={{background:"transparent",border:"none",fontSize:22,cursor:"pointer",padding:"2px 6px"}}
            onClick={() => { setHoleIdx(i=>Math.max(0,i-1)); setShotFrom(null); }}
            disabled={holeIdx===0}>◀</button>
          <span style={{fontSize:13,color:"#7a9e84",minWidth:32,textAlign:"center"}}>{holeIdx+1}/{HOLES.length}</span>
          <button style={{background:"transparent",border:"none",fontSize:22,cursor:"pointer",padding:"2px 6px"}}
            onClick={() => { setHoleIdx(i=>Math.min(HOLES.length-1,i+1)); setShotFrom(null); }}
            disabled={holeIdx===HOLES.length-1}>▶</button>
        </div>
      </div>
      <div className="map-wrap">
        <HoleMap hole={hole} gps={gps} key={hole.number} />
        <div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",
          background:"rgba(8,26,16,0.88)",border:"0.5px solid #2d5a3d",borderRadius:12,
          padding:"6px 20px",textAlign:"center",pointerEvents:"none"}}>
          <p className="label" style={{marginBottom:1}}>To pin</p>
          <p style={{fontSize:34,fontWeight:700,lineHeight:1,
            color:dtg?(dtg<100?"#4ade80":dtg<175?"#c9a84c":"#f0ead6"):"#7a9e84"}}>
            {dtg ?? "—"}
          </p>
          <p style={{fontSize:11,color:"#7a9e84"}}>yards</p>
          {gpsError && <p style={{fontSize:10,color:"#f87171",marginTop:2}}>{gpsError}</p>}
        </div>
      </div>
      <div className="bottom-panel">
        <div style={{padding:"10px 14px"}}>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {activePlayers.map((p,i) => {
              const pi = players.indexOf(p);
              return (
                <div key={i} style={{flex:1,background:"#122018",border:"0.5px solid #2d5a3d",borderRadius:8,padding:"6px 8px",textAlign:"center"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginBottom:2}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:PLAYER_COLORS[pi]}} />
                    <span style={{fontSize:10,color:"#7a9e84"}}>{p.name.split(" ")[0]}</span>
                  </div>
                  <span style={{fontSize:13,fontWeight:600}}>{hole.tees[p.tee].yards}</span>
                  <span style={{fontSize:9,color:"#7a9e84",marginLeft:2}}>yds</span>
                </div>
              );
            })}
          </div>
          <button onClick={markShot} disabled={!gps}
            style={{width:"100%",padding:"10px",borderRadius:10,cursor:gps?"pointer":"not-allowed",
              fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:500,marginBottom:10,
              background:shotFrom?"rgba(251,191,36,0.15)":"#1a3a24",
              color:shotFrom?"#fbbf24":"#a3b89a",
              border:shotFrom?"1px solid #92400e":"0.5px solid #2d5a3d",
              opacity:gps?1:0.5}}>
            {shotFrom ? "📍 Tap when you reach your ball" : "🏌️ Tap before your swing"}
          </button>
          {holeShots.length > 0 && (
            <div style={{background:"#122018",border:"0.5px solid #2d5a3d",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <p className="label">Shot log</p>
                <button onClick={clearShots} style={{fontSize:10,color:"#7a9e84",background:"transparent",border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>Clear</button>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <tbody>
                  {holeShots.map((s,i) => {
                    const toPin = Math.round(haversineYards(s.to.lat, s.to.lng, hole.green.lat, hole.green.lng));
                    return (
                      <tr key={i} style={{borderTop:i>0?"0.5px solid #1e3a28":"none"}}>
                        <td style={{padding:"5px 0",color:"#7a9e84"}}>#{i+1}</td>
                        <td style={{padding:"5px 0",textAlign:"right",fontWeight:600,color:"#4ade80"}}>{s.yards} yds</td>
                        <td style={{padding:"5px 0",textAlign:"right",color:"#a3b89a"}}>{toPin} to pin</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{background:"#1a3a24",border:"0.5px solid #2d5a3d",borderRadius:10,padding:"10px 12px"}}>
            <p className="label" style={{marginBottom:8}}>Score — hole {hole.number}</p>
            {activePlayers.map((p,i) => {
              const pi = players.indexOf(p);
              const val = scores[pi][holeIdx];
              const diff = val - hole.par;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  marginBottom:i<activePlayers.length-1?8:0,
                  paddingBottom:i<activePlayers.length-1?8:0,
                  borderBottom:i<activePlayers.length-1?"0.5px solid #2d5a3d":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:9,height:9,borderRadius:"50%",background:PLAYER_COLORS[pi]}} />
                    <span style={{fontSize:14,fontWeight:500}}>{p.name}</span>
                    {val > 0 && (
                      <span style={{fontSize:11,padding:"1px 7px",borderRadius:6,fontWeight:600,
                        background:diff<=-2?"#1d4ed8":diff===-1?"#14532d":diff===0?"#3a3a2a":diff===1?"#7c2d12":"#450a0a",
                        color:diff<=-2?"#93c5fd":diff===-1?"#4ade80":diff===0?"#c9a84c":diff===1?"#fb923c":"#fca5a5"}}>
                        {diff===0?"E":diff>0?`+${diff}`:diff}
                      </span>
                    )}
                  </div>
                  <div style={{display:"flex",alignItems:"center"}}>
                    <button onClick={()=>updateScore(pi,-1)}
                      style={{width:36,height:36,borderRadius:"8px 0 0 8px",border:"0.5px solid #2d5a3d",
                        background:"#122018",color:"#f0ead6",fontSize:20,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>−</button>
                    <div style={{width:36,height:36,background:"#0f2818",border:"0.5px solid #2d5a3d",
                      borderLeft:"none",borderRight:"none",display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:16,fontWeight:700,color:!val?"#7a9e84":"#f0ead6"}}>
                      {val||"·"}
                    </div>
                    <button onClick={()=>updateScore(pi,1)}
                      style={{width:36,height:36,borderRadius:"0 8px 8px 0",border:"0.5px solid #2d5a3d",
                        background:"#122018",color:"#f0ead6",fontSize:20,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="tab-bar">
        <button className="tab active">⛳ Hole</button>
        <button className="tab" onClick={()=>setScreen("scorecard")}>📋 Scores</button>
      </div>
    </div>
  );
}
