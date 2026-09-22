import { useState, useEffect } from 'react';
import { leaderboardService } from '../services/leaderboardService';

export default function Leaderboard({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    leaderboardService.getClubLeaderboard().then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{flex:1, overflowY:"auto", padding:"1rem 1rem 2rem", background:"#0a1c12"}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem"}}>
        <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:22, color:"#c9a84c"}}>Leaderboard</h2>
        {onClose && (
          <button onClick={onClose} style={{background:"transparent", border:"none", color:"#7a9e84", fontSize:22, cursor:"pointer"}}>✕</button>
        )}
      </div>
      {loading ? (
        <p style={{color:"#7a9e84", textAlign:"center", paddingTop:"2rem"}}>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{color:"#7a9e84", textAlign:"center", paddingTop:"2rem"}}>No completed rounds yet.</p>
      ) : (
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          {rows.map((row, i) => (
            <div key={row.user_id} style={{background:"rgba(255,255,255,0.04)", border:"0.5px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"12px 14px", display:"flex", alignItems:"center", gap:12}}>
              <span style={{fontSize:18, width:28}}>{["🥇","🥈","🥉"][i] || `#${i+1}`}</span>
              <p style={{flex:1, fontWeight:600}}>{row.full_name}</p>
              <p style={{fontWeight:700, fontSize:18}}>{row.avg_score}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
