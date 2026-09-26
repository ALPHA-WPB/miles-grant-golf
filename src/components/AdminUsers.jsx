import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Only these sign-ins can open the admin page.
export const ADMIN_EMAILS = ["rpdwpb@gmail.com"];
export const isAdmin = (user) => !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsers({ onClose }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.from("users").select("id, full_name, email, created_at, updated_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => { if (error) setError(error.message); else setUsers(data || []); });
  }, []);

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
