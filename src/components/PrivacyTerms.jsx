import { useState } from "react";
import { createPortal } from "react-dom";

const CONTACT = "milesgrantgolfapp@gmail.com";

const SECTIONS = [
  ["Unofficial app",
   "This is a free, unofficial app made by a Miles Grant member. It is not affiliated with, endorsed by, or operated by Miles Grant Country Club."],
  ["Your location",
   "The app asks for your phone's location only to show distances on the course. Your location is used on your phone only. It is never stored, never sent to us, and never shared or sold."],
  ["What we save",
   "Guests: nothing is sent to or saved by us. Your round is erased when you close the app, and guests don't appear on the leaderboard.\n\nOn your phone only: your longest shot of the day and a few app settings (like whether you've seen the instructions) are remembered on your device. They never leave your phone.\n\nAccount holders: your name, email address, and round scores are saved so you can see your history and the club leaderboard. If you sign in with Google or Apple, they share only your name and email with us."],
  ["Who sees your information",
   "Other players see only your name on the leaderboard, never your email. Only the app's creator can see the list of account holders, to know how many people use the app."],
  ["No selling or sharing",
   "We never sell, rent, or share your personal information with anyone. There are no ads."],
  ["Services that run the app",
   "The app is hosted by Vercel and stores account data with Supabase. We use Vercel's anonymous page-view counts (no names, emails, or locations). Map images load from Esri and fonts from Google Fonts. Like any website, these services see basic technical details such as your IP address, but not your GPS location or account."],
  ["Deleting your data",
   `Email ${CONTACT} and we will delete your account and scores.`],
  ["Distances are estimates",
   "GPS distances can be off by several yards. They are for casual play only, not for official or tournament use."],
  ["Play safely",
   "Don't use the app while driving a golf cart. Stay aware of other players, carts, and errant golf balls."],
  ["Provided \"as is\"",
   "The app is free and provided \"as is\" without warranties of any kind. By using it, you agree that its creator is not liable for any loss, damage, or injury related to its use."],
  ["Children",
   "The app is not intended for children under 13, and we do not knowingly collect their information."],
  ["Changes",
   "These terms may be updated from time to time. Continuing to use the app means you accept the current version."],
];

export function PrivacyTerms({ onClose }) {
  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed", inset:0, zIndex:4500, background:"#06140c", overflowY:"auto", fontFamily:"'Inter',sans-serif", color:"#f0ead6", textAlign:"left"}}>
      <div style={{maxWidth:560, margin:"0 auto", padding:"max(env(safe-area-inset-top),24px) 1.25rem 7rem"}}>
        <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:30, color:"#d4af37", textAlign:"center", marginBottom:4}}>Privacy &amp; Terms</h2>
        <p style={{textAlign:"center", fontSize:14, color:"#c8d8cc", marginBottom:18}}>The Unofficial Miles Grant Golf Companion App · Updated September 2026</p>
        <div style={{display:"flex", flexDirection:"column", gap:12}}>
          {SECTIONS.map(([t, b]) => (
            <div key={t} style={{background:"rgba(255,255,255,0.05)", border:"1px solid rgba(212,175,55,0.3)", borderRadius:14, padding:"14px 16px"}}>
              <p style={{fontWeight:800, fontSize:19, color:"#d4af37", marginBottom:6}}>{t}</p>
              <p style={{fontSize:17, lineHeight:1.5, whiteSpace:"pre-line"}}>{b}</p>
            </div>
          ))}
        </div>
        <p style={{textAlign:"center", fontSize:15, color:"#c8d8cc", marginTop:16}}>Questions: {CONTACT}</p>
        <button onClick={onClose}
          style={{width:"100%", marginTop:18, padding:"20px", borderRadius:16, border:"none", background:"#d4af37", color:"#000", fontWeight:900, fontSize:22, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
          Close
        </button>
      </div>
    </div>
  );
}

// Small footer used on the sign-in and round-start screens
export default function LegalFooter({ style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p style={{textAlign:"center", fontSize:10, color:"#7a9e84", lineHeight:1.45, ...style}}>
        Unofficial app. Not affiliated with Miles Grant Country Club. Your location is used only on your phone to show distances and is never stored, shared, or sold. By using this app you agree to the{" "}
        <button onClick={() => setOpen(true)}
          style={{background:"none", border:"none", padding:0, color:"#d4af37", fontSize:11, fontWeight:700, textDecoration:"underline", cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
          Privacy &amp; Terms
        </button>.
      </p>
      {open && createPortal(<PrivacyTerms onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
