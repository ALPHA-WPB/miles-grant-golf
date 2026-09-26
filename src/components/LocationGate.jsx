import { useState } from "react";

// Shown before GPS starts. Explains honestly why location is needed,
// then asks the phone for permission. Play can't start without it.
export default function LocationGate({ onGranted, onBack }) {
  const [status, setStatus] = useState("ask"); // ask | asking | denied

  function request() {
    if (!navigator.geolocation) { setStatus("denied"); return; }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      () => onGranted(),
      () => setStatus("denied"),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed", inset:0, zIndex:3500, background:"#06140c", overflowY:"auto", fontFamily:"'Inter',sans-serif", color:"#f0ead6", display:"flex", alignItems:"center", justifyContent:"center"}}>
      <div style={{maxWidth:480, width:"100%", padding:"2rem 1.25rem", textAlign:"center"}}>
        <p style={{fontSize:72, marginBottom:10}}>📍</p>
        <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:32, color:"#d4af37", marginBottom:16}}>
          Location needed
        </h2>
        <p style={{fontSize:21, lineHeight:1.5, marginBottom:14}}>
          This app uses your phone's GPS to show how far you are from the pin and how far you hit each shot.
        </p>
        <p style={{fontSize:19, lineHeight:1.5, color:"#c8d8cc", marginBottom:26}}>
          Your location stays on your phone. It is only used for distances and is never shared or sold.
        </p>

        {status === "denied" ? (
          <div style={{background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.5)", borderRadius:16, padding:"16px", marginBottom:18, textAlign:"left"}}>
            <p style={{fontSize:21, fontWeight:800, color:"#fca5a5", marginBottom:8}}>Location is turned off</p>
            <p style={{fontSize:18, lineHeight:1.5}}>
              <b>iPhone:</b> Settings → Privacy &amp; Security → Location Services → Safari Websites → "While Using the App".<br /><br />
              <b>Android:</b> Tap the lock icon next to the web address → Permissions → Location → Allow.<br /><br />
              Then tap "Try again".
            </p>
          </div>
        ) : null}

        <button onClick={request} disabled={status === "asking"}
          style={{width:"100%", padding:"22px", borderRadius:16, border:"none", background:"#d4af37", color:"#000", fontWeight:900, fontSize:25, cursor:"pointer", fontFamily:"'Inter',sans-serif", marginBottom:14, opacity: status === "asking" ? 0.6 : 1}}>
          {status === "asking" ? "Waiting for GPS…" : status === "denied" ? "Try again" : "Allow Location"}
        </button>
        <button onClick={onBack}
          style={{background:"transparent", border:"none", color:"#c8d8cc", fontSize:19, textDecoration:"underline", cursor:"pointer", padding:"10px", fontFamily:"'Inter',sans-serif"}}>
          Back to menu
        </button>
      </div>
    </div>
  );
}
