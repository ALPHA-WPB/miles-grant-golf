const SECTIONS = [
  {
    title: "⛳ Yards to the pin",
    body: "The To pin box shows how far you are from today's pin. It updates as you walk.",
  },
  {
    title: "🎬 3D fly-over",
    body: "Each hole opens with a fly-over. Slide the bar to fly along the hole, use the arrows to look around, and tap FLY to replay. SAT shows the satellite photo.",
  },
  {
    title: "🏌️ Measure a shot",
    body: "Tap the ball button (bottom right) before you swing, then again at your ball. You'll see how far it went and what's left.",
  },
  {
    title: "🧭 Next hole",
    body: "Walk onto the next tee and the app asks \"Moving to Hole 6?\" Tap Yes. Or tap Change under the hole number.",
  },
  {
    title: "⚡ Weather & lightning",
    body: "Tap the weather boxes for the forecast and radar. If lightning strikes within 20 miles, a yellow banner warns you and shows when it's all clear.",
  },
  {
    title: "📋 Score & your tee",
    body: "Tap Keep score to track a round. Pick Blue, White or Red tees on the Me tab. A free account saves your rounds and puts you on the leaderboard; guests' rounds aren't saved.",
  },
];

export default function Instructions({ onClose }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="How it works"
      style={{position:"fixed", inset:0, zIndex:4000, background:"#06140c", overflowY:"auto", fontFamily:"'Inter',sans-serif", color:"#f0ead6"}}>
      <div style={{maxWidth:520, margin:"0 auto", padding:"max(env(safe-area-inset-top),20px) 1.1rem 2.5rem"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:30, color:"#d4af37"}}>How it works</h2>
          <button onClick={onClose}
            style={{padding:"9px 16px", borderRadius:999, border:"1px solid #d4af37", background:"rgba(212,175,55,0.12)", color:"#d4af37", fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
            Skip ›
          </button>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          {SECTIONS.map(s => (
            <div key={s.title} style={{background:"rgba(255,255,255,0.05)", border:"1px solid rgba(212,175,55,0.3)", borderRadius:14, padding:"12px 15px"}}>
              <p style={{fontWeight:800, fontSize:19, color:"#d4af37", marginBottom:4}}>{s.title}</p>
              <p style={{fontSize:17, color:"#f0ead6", lineHeight:1.45}}>{s.body}</p>
            </div>
          ))}
        </div>
        <p style={{textAlign:"center", fontSize:13, color:"#c8d8cc", marginTop:14, lineHeight:1.5}}>
          Tap <b>? Help</b> at the top right to see this again. Unofficial app, not affiliated with Miles Grant Country Club. Made free by a member, for members.
        </p>
        <button onClick={onClose}
          style={{width:"100%", marginTop:16, padding:"18px", borderRadius:16, border:"none", background:"#d4af37", color:"#000", fontWeight:900, fontSize:24, cursor:"pointer", fontFamily:"'Inter',sans-serif", letterSpacing:"0.03em"}}>
          Got it
        </button>
      </div>
    </div>
  );
}
