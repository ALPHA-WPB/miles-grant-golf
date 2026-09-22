import { useState, useEffect } from 'react';
import { roundService } from '../services/roundService';

export default function RoundHistory({ userId }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    roundService.getRoundHistory(userId).then(setRounds).finally(() => setLoading(false));
  }, [userId]);

  return (
    <div style={{flex:1, overflowY:"auto", padding:"1rem 1rem 2rem", background:"#0a1c12"}}>
      <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:22, color:"#c9a84c", marginBottom:"1rem"}}>Round History</h2>
      {loading ? (
        <p style={{color:"#7a9e84", textAlign:"center", paddingTop:"2rem"}}>Loading...</p>
      ) : rounds.length === 0 ? (
        <p style={{color:"#7a9e84", textAlign:"center", paddingTop:"2rem"}}>No completed rounds yet.</p>
      ) : (
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          {rounds.map(r => (
            <div key={r.id} style={{background:"rgba(255,255,255,0.04)", border:"0.5px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"14px"}}>
              <p style={{fontWeight:600, color:"#f0ead6"}}>
                {r.round_type === "front9" ? "Front 9" : r.round_type === "back9" ? "Back 9" : "All 18"}
              </p>
              <p style={{fontSize:11, color:"#7a9e84"}}>{new Date(r.end_time).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
