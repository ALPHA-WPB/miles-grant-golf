import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GolfBall from "./GolfBall";

// Full-screen loading page while a hole's 3D view and fly-through load: the Miles Grant 1972 ball spins
// inside a gold ring that fills 0–100%. All drawn in code, so it costs no download.
const shown = new Map();     // hole number -> last % shown, so a remount never runs the ring backwards
const R = 104, C = 2 * Math.PI * R;

export default function HoleLoader({ hole, tee, progress = 0, label, done = false, onGone }) {
  const [host, setHost] = useState(null);
  const ref = useCallback(node => setHost(node?.closest(".play-stage") ?? null), []);
  const [pct, setPct] = useState(() => shown.get(hole.number) ?? 0);
  const [gone, setGone] = useState(false);
  const target = useRef(progress);
  useEffect(() => { target.current = done ? 1 : progress; }, [progress, done]);

  // Ease the ring toward the real progress, creeping a little so it never looks frozen
  useEffect(() => {
    let raf = 0, last = performance.now();
    const step = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      setPct(p => {
        const t = target.current;
        const goal = t >= 1 ? 1 : Math.min(0.97, Math.max(t, p + dt * 0.02));
        const next = p + (goal - p) * Math.min(1, dt * (t >= 1 ? 10 : 4));
        shown.set(hole.number, next);
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hole.number]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => { setGone(true); shown.delete(hole.number); onGone?.(); }, 450);
    return () => clearTimeout(t);
  }, [done, hole.number, onGone]);

  const yards = hole.tees?.[tee]?.yards;
  const p = Math.round(pct * 100);
  const page = gone ? null : (
    <div aria-live="polite" aria-label={`Loading hole ${hole.number}, ${p} percent`}
      style={{ position: "absolute", inset: 0, zIndex: 1100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 18, opacity: done ? 0 : 1, transition: "opacity 0.42s ease-out", pointerEvents: done ? "none" : "auto",
        background: `radial-gradient(ellipse at 50% 42%, rgba(46,110,64,0.55) 0%, rgba(10,34,20,0) 62%),
          repeating-linear-gradient(115deg, rgba(255,255,255,0.028) 0 46px, rgba(0,0,0,0.035) 46px 92px), #0b2215` }}>
      <style>{`@keyframes mggSpin{to{transform:rotate(360deg)}}@keyframes mggBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}`}</style>
      <div style={{ position: "relative", width: 240, height: 240 }}>
        <svg viewBox="0 0 240 240" width="240" height="240" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
          <defs>
            <linearGradient id="mggRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f5dc83" /><stop offset="0.55" stopColor="#d4af37" /><stop offset="1" stopColor="#9c7a1c" />
            </linearGradient>
          </defs>
          <circle cx="120" cy="120" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <circle cx="120" cy="120" r={R} fill="none" stroke="url(#mggRing)" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 120 120)" style={{ filter: "drop-shadow(0 0 6px rgba(212,175,55,0.45))" }} />
        </svg>
        <div style={{ position: "absolute", left: "50%", top: 30, marginLeft: -59, animation: "mggBob 1.6s ease-in-out infinite" }}>
          <div style={{ animation: "mggSpin 1.4s linear infinite", filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.45))" }}>
            <GolfBall size={118} />
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, textAlign: "center", font: "900 26px Inter,sans-serif", color: "#f0ead6", letterSpacing: "0.02em" }}>
          {p}<span style={{ fontSize: 15, color: "#d4af37", marginLeft: 1 }}>%</span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ font: "700 34px 'Playfair Display',Georgia,serif", color: "#d4af37", lineHeight: 1.05 }}>Hole {hole.number}</div>
        <div style={{ font: "700 16px Inter,sans-serif", color: "#f0ead6", marginTop: 4 }}>Par {hole.par}{yards ? ` · ${yards} yds` : ""}</div>
        <div style={{ font: "600 12px Inter,sans-serif", color: "rgba(200,216,204,0.7)", marginTop: 10, minHeight: 15 }}>{label || "Loading the fly-through…"}</div>
      </div>
    </div>
  );
  return <span ref={ref} style={{ display: "none" }}>{host && page ? createPortal(page, host) : null}</span>;
}
