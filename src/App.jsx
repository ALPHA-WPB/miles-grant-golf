import { useState, useEffect, useRef } from "react";

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

function HoleMap({ hole, gps }) {
  const W = 400, H = 300, PAD = 30;
  // Use only hole points for bounds — never GPS, which can be miles away
  const allPts = [hole.tees.champ, hole.tees.mens, hole.tees.womens, hole.green];
  const lats = allPts.map(p => p.lat);
  const lngs = allPts.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latR = maxLat - minLat || 0.0005;
  const lngR = maxLng - minLng || 0.0005;
  const scale = Math.min((W - PAD*2) / lngR, (H - PAD*2) / latR) * 0.82;
  const cx = (W - lngR * scale) / 2;
  const cy = (H - latR * scale) / 2;

  function proj(lat, lng) {
    return [cx + (lng - minLng) * scale, cy + (maxLat - lat) * scale];
  }

  const teeC  = proj(hole.tees.champ.lat,  hole.tees.champ.lng);
  const teeM  = proj(hole.tees.mens.lat,   hole.tees.mens.lng);
  const teeW  = proj(hole.tees.womens.lat, hole.tees.womens.lng);
  const green = proj(hole.green.lat,       hole.green.lng);
  // Only show GPS dot if within ~600 yards of the green (on-course)
  const gpsNearby = gps && haversineYards(gps.lat, gps.lng, hole.green.lat, hole.green.lng) < 600;
  const gpsP  = gpsNearby ? proj(gps.lat, gps.lng) : null;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
      style={{display:"block"}}>
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#0d3320" />
          <stop offset="100%" stopColor="#081a10" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#bgGrad)" />
      <line x1={teeM[0]} y1={teeM[1]} x2={green[0]} y2={green[1]}
        stroke="#2d6e3e" strokeWidth="28" strokeLinecap="round" opacity="0.6" />
      <line x1={teeM[0]} y1={teeM[1]} x2={green[0]} y2={green[1]}
        stroke="#3a8050" strokeWidth="18" strokeLinecap="round" opacity="0.4" />
      <ellipse cx={green[0]} cy={green[1]} rx={20} ry={14} fill="#2d7a44" stroke="#4aaa64" strokeWidth="1.5" />
      <line x1={teeM[0]} y1={teeM[1]} x2={green[0]} y2={green[1]}
        stroke="#c9a84c" strokeWidth="1.5" strokeDasharray="6,6" opacity="0.6" />
      <circle cx={teeC[0]} cy={teeC[1]} r={7} fill="#3b82f6" stroke="#fff" strokeWidth="1.5" />
      <circle cx={teeM[0]} cy={teeM[1]} r={7} fill="#d1d5db" stroke="#fff" strokeWidth="1.5" />
      <circle cx={teeW[0]} cy={teeW[1]} r={7} fill="#ef4444" stroke="#fff" strokeWidth="1.5" />
      <line x1={green[0]} y1={green[1]+14} x2={green[0]} y2={green[1]-10}
        stroke="#e8e8e8" strokeWidth="2" />
      <polygon points={`${green[0]+1},${green[1]-10} ${green[0]+12},${green[1]-5} ${green[0]+1},${green[1]}`}
        fill="#ef4444" />
      {gpsP && <>
        <circle cx={gpsP[0]} cy={gpsP[1]} r={12} fill="#4ade80" opacity="0.15" />
        <circle cx={gpsP[0]} cy={gpsP[1]} r={6}  fill="#4ade80" stroke="#fff" strokeWidth="2" />
        <text x={gpsP[0]+10} y={gpsP[1]-8} fill="#4ade80" fontSize="10" fontFamily="Inter,sans-serif" fontWeight="600">You</text>
      </>}
      <text x={teeC[0]+10} y={teeC[1]+4}  fill="#60a5fa" fontSize="10" fontFamily="Inter,sans-serif">B</text>
      <text x={teeM[0]+10} y={teeM[1]+4}  fill="#d1d5db" fontSize="10" fontFamily="Inter,sans-serif">W</text>
      <text x={teeW[0]+10} y={teeW[1]+4}  fill="#f87171" fontSize="10" fontFamily="Inter,sans-serif">R</text>
      <text x={green[0]+16} y={green[1]+4} fill="#a3b89a" fontSize="10" fontFamily="Inter,sans-serif">Pin</text>
      {gps && (
        <g>
          <rect x={W-58} y={8} width={50} height={20} rx={5} fill="rgba(0,0,0,0.5)" />
          <text x={W-33} y={22} fill="#7a9e84" fontSize="10" fontFamily="Inter,sans-serif" textAnchor="middle">±{gps.acc}m</text>
        </g>
      )}
    </svg>
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
