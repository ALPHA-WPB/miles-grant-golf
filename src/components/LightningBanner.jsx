import { useState } from "react";
import { createPortal } from "react-dom";
import { useLightning, cardinal, minutesAgo, clearTime } from "../lib/lightning";

// Flashing yellow warning across the top whenever lightning has struck within 20 miles in the last
// 30 minutes. Tap to shrink it to a small chip (it pops open again if a strike lands 3+ miles closer).
export default function LightningBanner() {
  const { active, last, alertAt, now } = useLightning();
  // shrunk for the current alert only: a new (closer) alert opens it again
  const [smallFor, setSmallFor] = useState(null);
  const small = smallFor === alertAt;
  if (!active || !last) return null;

  const ago = minutesAgo(last.t, now);
  const where = `${Math.round(last.mi)} mi ${cardinal(last.brg)}`;
  const top = "calc(env(safe-area-inset-top, 0px) + 6px)";
  const css = `@keyframes mggBolt{0%,100%{background:#facc15}50%{background:#e3a008}}
    @keyframes mggBoltIn{from{transform:translateY(-12px);opacity:0}to{transform:none;opacity:1}}`;

  return createPortal(
    <>
      <style>{css}</style>
      {small ? (
        <button onClick={() => setSmallFor(null)} aria-label={`Lightning ${where}, ${ago} minutes ago. Tap for details`}
          style={{ position: "fixed", top, left: "50%", transform: "translateX(-50%)", zIndex: 8800, border: "none", borderRadius: 999,
            padding: "5px 12px", font: "800 13px Inter,sans-serif", color: "#1c1400", cursor: "pointer",
            boxShadow: "0 3px 12px rgba(0,0,0,0.45)", animation: "mggBolt 1.2s ease-in-out infinite" }}>
          ⚡ {where}
        </button>
      ) : (
        <div role="alert" onClick={() => setSmallFor(alertAt)}
          style={{ position: "fixed", top, left: 10, right: 10, zIndex: 8800, borderRadius: 14, padding: "9px 14px 8px", color: "#1c1400",
            cursor: "pointer", boxShadow: "0 6px 22px rgba(0,0,0,0.5)", border: "1.5px solid rgba(120,80,0,0.45)",
            animation: "mggBoltIn 0.25s ease-out, mggBolt 1.2s ease-in-out infinite", maxWidth: 520, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden="true">⚡</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "900 16px Inter,sans-serif", letterSpacing: "0.01em" }}>
                Lightning {where} · {ago === 0 ? "just now" : `${ago} min ago`}
              </div>
              <div style={{ font: "600 12px Inter,sans-serif", opacity: 0.85, marginTop: 1 }}>
                Seek shelter · all clear at {clearTime(last.t)} if no more strikes within 20 mi
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
