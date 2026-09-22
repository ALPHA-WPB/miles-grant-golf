import { useState } from 'react';
import { friendsService } from '../services/friendsService';
import { roundService } from '../services/roundService';
import toast from 'react-hot-toast';

const TEE_ORDER = ['champ', 'mens', 'womens'];
const TEE_LABELS = { champ: 'Blue', mens: 'White', womens: 'Red' };
const HOLE_TEE_COLOR = { champ: '#3b82f6', mens: '#d1d5db', womens: '#ef4444' };

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  .setup-bg { position: fixed; inset: 0; background-image: url('/course-bg.jpg'); background-size: cover; background-position: center 30%; }
  .setup-overlay { position: fixed; inset: 0; background: linear-gradient(to bottom, rgba(5,16,10,0.2) 0%, rgba(5,16,10,0.55) 38%, rgba(5,16,10,0.96) 62%, rgba(5,16,10,1) 100%); }
  .glass { background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 16px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .friend-chip { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.08); cursor: pointer; }
  .friend-chip.selected { background: rgba(201,168,76,0.12); border-color: rgba(201,168,76,0.4); }
`;

export default function RoundLobby({ user, profile, isGuest, onRoundStart, onShowInstructions }) {
  const [tee, setTee] = useState('mens');
  const [step, setStep] = useState(null); // null | 'friends'
  const [roundType, setRoundType] = useState(null);
  const [friends, setFriends] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [starting, setStarting] = useState(false);

  function pickRoundType(type) {
    if (isGuest) {
      onRoundStart({ round: null, roundPlayer: null, tee, roundType: type });
      return;
    }
    setRoundType(type);
    setStep('friends');
    setSelected([]);
    loadFriends();
  }

  async function loadFriends() {
    setLoadingFriends(true);
    try {
      setFriends(await friendsService.getFriends(user.id));
    } catch {
      setFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  }

  function toggleFriend(id) {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id].slice(0, 3));
  }

  async function startRound() {
    setStarting(true);
    try {
      const { round, roundPlayer } = await roundService.createRound(user.id, TEE_LABELS[tee], roundType);
      if (selected.length) {
        await roundService.inviteFriends(round.id, selected);
        toast.success(`Round started! ${selected.length} invite${selected.length > 1 ? 's' : ''} sent.`);
      } else {
        toast.success('Round started!');
      }
      onRoundStart({ round, roundPlayer, tee, roundType });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={{position:"relative", height:"100vh", overflow:"hidden", fontFamily:"'Inter',sans-serif", color:"#f0ead6"}}>
      <style>{css}</style>
      <div className="setup-bg" />
      <div className="setup-overlay" />
      {onShowInstructions && (
        <button onClick={onShowInstructions} aria-label="How this app works"
          style={{position:"fixed", top:"max(env(safe-area-inset-top),14px)", right:16, zIndex:10, width:34, height:34, borderRadius:"50%", background:"rgba(255,255,255,0.08)", border:"0.5px solid rgba(255,255,255,0.2)", color:"#f0ead6", fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:16, cursor:"pointer"}}>
          ?
        </button>
      )}
      <div style={{position:"relative", zIndex:2, height:"100vh", display:"flex", flexDirection:"column", justifyContent:"flex-end", padding:"0 1.25rem", paddingBottom:"calc(16px + max(env(safe-area-inset-bottom),8px))"}}>
        <div style={{textAlign:"center", marginBottom:"1rem"}}>
          <h1 style={{fontFamily:"'Playfair Display',serif", fontSize:38, fontWeight:700, color:"#fff", lineHeight:1.05, marginBottom:4, textShadow:"0 2px 20px rgba(0,0,0,0.8)"}}>
            Miles Grant<br/>Country Club
          </h1>
          <p style={{fontSize:12, color:"rgba(240,234,214,0.6)"}}>
            {isGuest ? "Playing as Guest" : `Welcome, ${profile?.full_name || user.email.split("@")[0]}`}
          </p>
        </div>

        <div className="glass" style={{padding:"0.85rem 1.1rem 1rem", marginBottom:"0.75rem"}}>
          <p style={{fontSize:10, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8}}>Your tee</p>
          <div style={{display:"flex", gap:8}}>
            {TEE_ORDER.map(t => (
              <button key={t} onClick={() => setTee(t)}
                style={{flex:1, padding:"10px 0", borderRadius:10, cursor:"pointer", fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:tee===t?600:400,
                  background:tee===t?(t==="champ"?"rgba(30,58,95,0.9)":t==="mens"?"rgba(58,58,58,0.9)":"rgba(90,26,26,0.9)"):"rgba(255,255,255,0.05)",
                  color:tee===t?(t==="champ"?"#60a5fa":t==="mens"?"#e8e8e8":"#f87171"):"#7a9e84",
                  border:tee===t?`1.5px solid ${HOLE_TEE_COLOR[t]}`:"0.5px solid rgba(255,255,255,0.08)"}}>
                {TEE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {step === "friends" ? (
          <div className="glass" style={{padding:"1rem 1.1rem", maxHeight:"55vh", display:"flex", flexDirection:"column"}}>
            <div style={{display:"flex", alignItems:"center", marginBottom:12}}>
              <button onClick={() => setStep(null)} style={{background:"transparent", border:"none", color:"#7a9e84", fontSize:20, cursor:"pointer", marginRight:8}}>←</button>
              <div>
                <p style={{fontWeight:700, fontSize:15, color:"#c9a84c"}}>Invite Friends</p>
                <p style={{fontSize:11, color:"#7a9e84"}}>
                  {roundType === "front9" ? "Front 9" : roundType === "back9" ? "Back 9" : "All 18"} · up to 3
                </p>
              </div>
            </div>
            <div style={{flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:8, marginBottom:12}}>
              {loadingFriends ? (
                <p style={{color:"#7a9e84", textAlign:"center", padding:"1rem"}}>Loading...</p>
              ) : friends.length === 0 ? (
                <p style={{color:"#7a9e84", textAlign:"center", padding:"1rem", fontSize:13}}>No friends yet — add in Friends tab!</p>
              ) : friends.map(({friend, friendshipId}) => {
                const isSelected = selected.includes(friend.id);
                return (
                  <div key={friendshipId} className={`friend-chip${isSelected ? " selected" : ""}`} onClick={() => toggleFriend(friend.id)}>
                    <div className="friend-avatar" style={{width:34, height:34, borderRadius:"50%", background:"rgba(45,90,61,0.6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#c9a84c", flexShrink:0}}>
                      {(friend.full_name || friend.email || "?")[0].toUpperCase()}
                    </div>
                    <div style={{flex:1}}>
                      <p style={{fontSize:14, fontWeight:600, color:"#f0ead6"}}>{friend.full_name || "Unknown"}</p>
                      <p style={{fontSize:11, color:"#7a9e84"}}>{friend.email}</p>
                    </div>
                    <div style={{width:22, height:22, borderRadius:"50%", border:`1.5px solid ${isSelected ? "#c9a84c" : "rgba(255,255,255,0.2)"}`, background:isSelected ? "#c9a84c" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                      {isSelected && <span style={{fontSize:12, color:"#0f2818", fontWeight:700}}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={startRound} disabled={starting}
              style={{width:"100%", padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#c9a84c,#b8952f)", color:"#0f2818", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"'Inter',sans-serif", opacity:starting?0.6:1}}>
              {starting ? "Starting..." : selected.length ? `Start & Invite ${selected.length} Friend${selected.length > 1 ? "s" : ""}` : "Start Solo"}
            </button>
          </div>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            <div style={{display:"flex", gap:10, height:120}}>
              {[
                { label:"Front 9", sub:"Holes 1–9", emoji:"🌅", type:"front9" },
                { label:"All 18", sub:"Full Round", emoji:"⛳", type:"all18" },
                { label:"Back 9", sub:"Holes 10–18", emoji:"🌇", type:"back9" },
              ].map(opt => (
                <button key={opt.type} onClick={() => pickRoundType(opt.type)}
                  style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:5, borderRadius:16, cursor:"pointer",
                    fontFamily:"'Inter',sans-serif", background:"rgba(255,255,255,0.06)", border:"0.5px solid rgba(255,255,255,0.12)",
                    backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)"}}>
                  <span style={{fontSize:22}}>{opt.emoji}</span>
                  <span style={{fontSize:14, fontWeight:700, color:"#f0ead6"}}>{opt.label}</span>
                  <span style={{fontSize:10, color:"#7a9e84"}}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p style={{fontSize:10, color:"rgba(240,234,214,0.3)", textAlign:"center", lineHeight:1.55, marginTop:12}}>
          Unofficial app · Not affiliated with Miles Grant Country Club
        </p>
      </div>
    </div>
  );
}
