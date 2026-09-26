import { authService } from '../services/authService';

export default function Profile({ user, profile, onSignOut, onAdmin }) {
  return (
    <div style={{flex:1, overflowY:"auto", padding:"1rem 1rem 2rem", background:"#0a1c12"}}>
      <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:22, color:"#c9a84c", marginBottom:"1rem"}}>Profile</h2>
      <div style={{background:"rgba(255,255,255,0.04)", border:"0.5px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"14px", marginBottom:10}}>
        <p style={{fontSize:14, fontWeight:600, color:"#f0ead6"}}>{profile?.full_name || "Golfer"}</p>
        <p style={{fontSize:12, color:"#7a9e84"}}>{user.email}</p>
      </div>
      {onAdmin && (
        <button onClick={onAdmin}
          style={{width:"100%", padding:"15px", borderRadius:12, border:"none", background:"#d4af37", color:"#000", fontSize:18, fontWeight:800, cursor:"pointer", fontFamily:"'Inter',sans-serif", marginBottom:10}}>
          👑 Admin · Users
        </button>
      )}
      <button onClick={() => authService.signOut().then(() => onSignOut?.())}
        style={{width:"100%", padding:"13px", borderRadius:12, border:"0.5px solid rgba(248,113,113,0.3)", background:"transparent", color:"#f87171", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
        Sign Out
      </button>
    </div>
  );
}
