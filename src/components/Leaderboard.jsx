import { useState, useEffect } from 'react';
import { leaderboardService } from '../services/leaderboardService';

function Board({ title, rows }) {
  return (
    <div style={{marginBottom:"1.5rem"}}>
      <p style={{fontSize:18, fontWeight:800, color:"#d4af37", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10}}>{title}</p>
      {rows.length === 0 ? (
        <p style={{color:"#c8d8cc", fontSize:17}}>No completed rounds yet.</p>
      ) : (
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          {rows.map((row, i) => (
            <div key={row.user_id} style={{background:"rgba(255,255,255,0.05)", border:"0.5px solid rgba(255,255,255,0.1)", borderRadius:14, padding:"14px", display:"flex", alignItems:"center", gap:12}}>
              <span style={{fontSize:22, width:34}}>{["🥇","🥈","🥉"][i] || `#${i+1}`}</span>
              <div style={{flex:1}}>
                <p style={{fontWeight:700, fontSize:19, color:"#f0ead6"}}>{row.full_name}</p>
                <p style={{fontSize:14, color:"#c8d8cc"}}>{row.rounds_played} round{row.rounds_played === 1 ? "" : "s"}</p>
              </div>
              <div style={{textAlign:"right"}}>
                <p style={{fontWeight:900, fontSize:26, color:"#f0ead6", lineHeight:1}}>{row.avg_score}</p>
                <p style={{fontSize:13, color:"#c8d8cc"}}>avg</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Leaderboard({ onClose }) {
  const [data, setData] = useState({ eighteen: [], nine: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    leaderboardService.getClubLeaderboard().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{flex:1, overflowY:"auto", padding:"1rem 1rem 2rem", background:"#0a1c12", fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem"}}>
        <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:28, color:"#d4af37"}}>Leaderboard</h2>
        {onClose && (
          <button onClick={onClose} style={{background:"transparent", border:"none", color:"#c8d8cc", fontSize:26, cursor:"pointer"}}>✕</button>
        )}
      </div>
      {loading ? (
        <p style={{color:"#c8d8cc", textAlign:"center", paddingTop:"2rem", fontSize:18}}>Loading...</p>
      ) : (<>
        <Board title="18-hole rounds" rows={data.eighteen} />
        <Board title="9-hole rounds" rows={data.nine} />
        <p style={{fontSize:14, color:"#7a9e84"}}>Average score per round. Only finished 9- or 18-hole rounds count.</p>
      </>)}
    </div>
  );
}
