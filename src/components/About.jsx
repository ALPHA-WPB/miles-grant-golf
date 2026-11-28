import { APP_VERSION, APP_CHANGES, VERSION_HISTORY } from "../lib/version";

// More > About: which version this is, and the story of the versions so far
export default function About() {
  return (
    <div style={{ padding: "8px 12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="glass-card" style={{ padding: "16px 14px", textAlign: "center" }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: "#c8d8cc", textTransform: "uppercase", letterSpacing: "0.08em" }}>You are on</p>
        <p style={{ font: "700 40px 'Playfair Display',Georgia,serif", color: "#d4af37", lineHeight: 1.1, marginTop: 2 }}>Version {APP_VERSION}</p>
        <p style={{ fontSize: 17, color: "#f0ead6", marginTop: 8, lineHeight: 1.4 }}>
          Version 3 is the 3D course. The number after the dot counts every change made to the app since 3D began: <b style={{ color: "#d4af37" }}>{APP_CHANGES}</b> so far.
        </p>
      </div>
      <p style={{ fontSize: 15, fontWeight: 800, color: "#c8d8cc", textTransform: "uppercase", letterSpacing: "0.08em", margin: "6px 2px 0" }}>Version history</p>
      {VERSION_HISTORY.map(v => {
        const n = v.current ? APP_CHANGES : v.changes;
        return (
          <div key={v.n} className="glass-card" style={{ padding: "12px 14px", borderColor: v.current ? "#d4af37" : undefined }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <p style={{ font: "700 22px 'Playfair Display',Georgia,serif", color: v.current ? "#d4af37" : "#f0ead6" }}>Version {v.n} · {v.name}</p>
              {v.current && <span style={{ fontSize: 12, fontWeight: 800, color: "#0b1a10", background: "#d4af37", borderRadius: 8, padding: "2px 8px", whiteSpace: "nowrap" }}>NOW</span>}
            </div>
            <p style={{ fontSize: 14, color: "#7a9e84", marginTop: 2 }}>{v.when} · {n} change{n === 1 ? "" : "s"}</p>
            <p style={{ fontSize: 17, color: "#f0ead6", marginTop: 8, lineHeight: 1.45 }}>{v.text}</p>
          </div>
        );
      })}
      <p style={{ fontSize: 14, color: "#7a9e84", textAlign: "center", lineHeight: 1.5, marginTop: 4 }}>
        Free for Miles Grant members. Unofficial: not made by Miles Grant Country Club.
      </p>
    </div>
  );
}
