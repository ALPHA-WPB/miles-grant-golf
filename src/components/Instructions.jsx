const SECTIONS = [
  {
    title: "⛳ Distance to the pin",
    body: "The big gold number is how far you are from the center of the green. It updates as you walk.",
  },
  {
    title: "🧭 Changing holes",
    body: "When you open the app, it shows the hole you're closest to — tap Start. When you walk onto the next tee, a big message asks \"Moving to Hole 6?\" — tap Yes. You can also tap \"Change hole\" under the hole number any time.",
  },
  {
    title: "🏌️ Measuring your shot",
    body: "1. Before you swing, tap the big flashing button.\n2. Hit your shot.\n3. Walk to your ball and tap the button again.\n\nThe screen shows your shot number, how far you hit it, and how far you have left to the pin.",
  },
  {
    title: "🏆 Keeping score (optional)",
    body: "Want to play a full round? Tap \"Keep score for a round\". Tap \"In the cup\" when you finish each hole, and \"Finish round\" when you're done. Play 9, 18, or just a few holes.",
  },
  {
    title: "🎯 Your tee",
    body: "Set Blue, White, or Red once on the Me tab. The app remembers it.",
  },
  {
    title: "👤 Guest or account",
    body: "Guest: play free — nothing is saved. Your round is erased when you close the app, and guests don't appear on the leaderboard.\n\nFree account: saves your rounds and puts you on the club leaderboard.",
  },
  {
    title: "❓ Need this again?",
    body: "Tap the round ? button in the top-right corner of the map any time.",
  },
];

export default function Instructions({ onClose }) {
  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed", inset:0, zIndex:4000, background:"#06140c", overflowY:"auto", fontFamily:"'Inter',sans-serif", color:"#f0ead6"}}>
      <div style={{maxWidth:520, margin:"0 auto", padding:"max(env(safe-area-inset-top),24px) 1.25rem 3rem"}}>
        <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:34, color:"#d4af37", textAlign:"center", marginBottom:"1.25rem"}}>
          How it works
        </h2>
        <div style={{display:"flex", flexDirection:"column", gap:14}}>
          {SECTIONS.map(s => (
            <div key={s.title} style={{background:"rgba(255,255,255,0.05)", border:"1px solid rgba(212,175,55,0.35)", borderRadius:16, padding:"16px 18px"}}>
              <p style={{fontWeight:800, fontSize:23, color:"#d4af37", marginBottom:8}}>{s.title}</p>
              <p style={{fontSize:20, color:"#f0ead6", lineHeight:1.5, whiteSpace:"pre-line"}}>{s.body}</p>
            </div>
          ))}
        </div>
        <p style={{textAlign:"center", fontSize:14, color:"#c8d8cc", marginTop:18, lineHeight:1.5}}>
          The Unofficial Miles Grant Golf Companion App. Not affiliated with or endorsed by Miles Grant Country Club. Made free by a member, for members.
        </p>
        <button onClick={onClose}
          style={{width:"100%", marginTop:22, padding:"22px", borderRadius:16, border:"none", background:"#d4af37", color:"#000", fontWeight:900, fontSize:26, cursor:"pointer", fontFamily:"'Inter',sans-serif", letterSpacing:"0.03em"}}>
          Got it
        </button>
      </div>
    </div>
  );
}
