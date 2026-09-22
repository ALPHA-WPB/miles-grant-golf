const SECTIONS = [
  {
    title: "⛳ Distance to pin",
    body: "While you're on a hole, your GPS position updates live and the \"To pin\" box shows straight-line yardage to that hole's green. It only shows a number within 600 yards of the green, so it won't show junk if you're between holes.",
  },
  {
    title: "🏌️ Tracking a shot",
    body: "Tap the pill button before you swing — it locks in your starting spot and turns gold. After you hit, tap it again. Your shot distance flashes big on screen for a few seconds, then settles into the \"Last shot\" box and the shot log below. The button immediately re-arms for your next shot.",
  },
  {
    title: "🎯 Tee colors",
    body: "Blue = Championship, White = Men's, Red = Women's. Pick yours at setup — the \"Tee\" box shows that tee's official yardage for the hole you're on.",
  },
  {
    title: "🏆 Scoring",
    body: "Use +/− to adjust your score by hand, or tap \"In the cup\" to lock in the score based on shots tracked. \"pick up\" lets you skip a hole without it counting against your total.",
  },
  {
    title: "👤 Guests vs. accounts",
    body: "Playing as a guest gets you the full GPS + scoring experience for free, kept on this device only. Create a free account to save round history, add friends, invite them to a round, and show up on the club leaderboard.",
  },
];

export default function Instructions({ onClose }) {
  return (
    <div style={{position:"fixed", inset:0, zIndex:2000, background:"rgba(5,16,10,0.96)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)", overflowY:"auto", fontFamily:"'Inter',sans-serif", color:"#f0ead6"}}>
      <div style={{maxWidth:460, margin:"0 auto", padding:"max(env(safe-area-inset-top),20px) 1.25rem 3rem"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:24, color:"#c9a84c"}}>How it works</h2>
          <button onClick={onClose} aria-label="Close"
            style={{width:34, height:34, borderRadius:"50%", background:"rgba(255,255,255,0.08)", border:"0.5px solid rgba(255,255,255,0.2)", color:"#f0ead6", fontSize:16, cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          {SECTIONS.map(s => (
            <div key={s.title} style={{background:"rgba(255,255,255,0.04)", border:"0.5px solid rgba(255,255,255,0.1)", borderRadius:14, padding:"14px 16px"}}>
              <p style={{fontWeight:700, fontSize:14, color:"#c9a84c", marginBottom:6}}>{s.title}</p>
              <p style={{fontSize:13, color:"#d8d0bb", lineHeight:1.55}}>{s.body}</p>
            </div>
          ))}
        </div>
        <button onClick={onClose}
          style={{width:"100%", marginTop:16, padding:"14px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#c9a84c,#b8952f)", color:"#0f2818", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
          Got it
        </button>
      </div>
    </div>
  );
}
