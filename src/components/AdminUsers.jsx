import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { pinAge, resetPin } from "../lib/pins";

// Only these sign-ins can open the admin page.
export const ADMIN_EMAILS = ["rpdwpb@gmail.com", "richard@wpbit.com"];
export const isAdmin = (user) => !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsers({ onClose }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [pins, setPins] = useState(null);

  useEffect(() => {
    api("/api/admin/users").then(setUsers).catch(e => setError(e.message));
    api("/api/pins").then(d => setPins(d.pins)).catch(() => setPins([]));
  }, []);
  const reset = async (hole) => {
    if (!window.confirm(`Put hole ${hole}'s pin back to the middle of the green for everyone?`)) return;
    try { await resetPin(hole); setPins(p => p.filter(x => x.hole !== hole)); } catch (e) { window.alert(`Couldn't reset: ${e.message}`); }
  };

  const shown = (users || []).filter(u =>
    !q || `${u.full_name || ""} ${u.email || ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{flex:1, overflowY:"auto", padding:"1rem 1rem 2rem", background:"#0a1c12", fontFamily:"'Inter',sans-serif", color:"#f0ead6"}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14}}>
        <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:26, color:"#d4af37"}}>Admin · Users</h2>
        <button onClick={onClose}
          style={{fontSize:16, padding:"8px 14px", borderRadius:10, border:"1px solid #2d5a3d", background:"transparent", color:"#c8d8cc", cursor:"pointer"}}>
          Back
        </button>
      </div>

      <div style={{background:"#06140c", border:"2px solid rgba(212,175,55,0.55)", borderRadius:16, padding:"14px", textAlign:"center", marginBottom:14}}>
        <p style={{fontSize:15, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.06em"}}>Total users</p>
        <p style={{fontSize:64, fontWeight:900, color:"#d4af37", lineHeight:1.05}}>{users ? users.length : "…"}</p>
      </div>

      <div style={{background:"rgba(255,255,255,0.05)", border:"0.5px solid rgba(212,175,55,0.45)", borderRadius:14, padding:"12px 14px", marginBottom:14}}>
        <p style={{fontSize:15, fontWeight:800, color:"#d4af37", letterSpacing:"0.04em", marginBottom:4}}>📍 PIN POSITIONS</p>
        <p style={{fontSize:13, color:"#c8d8cc", marginBottom:8}}>
          To move a pin: on that hole's screen, tap <b>📍 Set pin</b> while standing at the cup. Holes not listed use the middle of the green.
        </p>
        {pins === null ? <p style={{fontSize:14, color:"#7a9e84"}}>Loading…</p>
          : pins.length === 0 ? <p style={{fontSize:14, color:"#7a9e84"}}>No pins set yet.</p>
          : pins.map(p => (
            <div key={p.hole} style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"6px 0", borderTop:"0.5px solid rgba(255,255,255,0.08)"}}>
              <span style={{fontSize:15}}><b>Hole {p.hole}</b> <span style={{color:"#c8d8cc", fontSize:13}}>· {pinAge(p.set_at)} {new Date(p.set_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{p.accuracy_m ? ` · ±${Math.round(p.accuracy_m * 1.094)} yds` : ""}</span></span>
              <button onClick={() => reset(p.hole)} style={{fontSize:13, padding:"5px 10px", borderRadius:8, border:"1px solid #2d5a3d", background:"transparent", color:"#c8d8cc", cursor:"pointer"}}>Reset</button>
            </div>
          ))}
      </div>

      <input type="text" placeholder="Search name or email" value={q} onChange={e => setQ(e.target.value)}
        style={{width:"100%", fontSize:17, padding:"12px 14px", borderRadius:12, marginBottom:12}} />

      {error && <p style={{color:"#f87171", fontSize:16, marginBottom:12}}>Couldn't load users: {error}</p>}
      {users && users.length > 0 && shown.length === 0 && <p style={{color:"#c8d8cc", fontSize:16}}>No matches.</p>}

      <div style={{display:"flex", flexDirection:"column", gap:8}}>
        {shown.map((u, i) => (
          <div key={u.id} style={{background:"rgba(255,255,255,0.05)", border:"0.5px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"12px 14px"}}>
            <p style={{fontSize:18, fontWeight:700}}>
              <span style={{color:"#7a9e84", marginRight:8}}>{shown.length - i}.</span>{u.full_name || "—"}
            </p>
            <p style={{fontSize:15, color:"#c8d8cc", wordBreak:"break-all"}}>{u.email}</p>
            <p style={{fontSize:13, color:"#7a9e84", marginTop:4}}>
              Joined {fmtDate(u.created_at)} · Last sign-in {fmtDate(u.updated_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
