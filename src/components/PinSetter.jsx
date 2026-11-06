import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { savePin, yardsBetween } from "../lib/pins";

// Admin: record where the cup is today. Step 1, stand next to the cup while the phone averages GPS for
// about 10 seconds. Step 2, drag the flag on the close-up satellite photo to fine-tune. Save = everyone's
// yardages and flag use it (queued on the phone if there's no signal).
const SECONDS = 10, MAX_ACC_M = 25;

// Accuracy-weighted average of the GPS fixes
function averageOf(samples) {
  if (!samples.length) return null;
  let w = 0, lat = 0, lng = 0;
  for (const s of samples) { const k = 1 / (s.acc * s.acc); w += k; lat += s.lat * k; lng += s.lng * k; }
  const best = Math.min(...samples.map(s => s.acc));
  return { lat: lat / w, lng: lng / w, acc: Math.max(1, best / Math.sqrt(Math.min(samples.length, 6))) };
}

export default function PinSetter({ hole, onSaved, onClose }) {
  const [phase, setPhase] = useState("measure");     // measure | adjust | saving
  const [samples, setSamples] = useState([]);         // { lat, lng, acc }
  const [secs, setSecs] = useState(0);
  const [gpsError, setGpsError] = useState(() => (navigator.geolocation ? null : "This phone has no GPS"));
  const [spot, setSpot] = useState(null);             // { lat, lng, acc }
  const mapBox = useRef(null), markerRef = useRef(null);
  const center = hole.greenCenter || hole.green;

  // Step 1: average GPS fixes (weighted by accuracy) while standing at the cup
  const toAdjust = (from) => { setSpot(from); setPhase("adjust"); };
  useEffect(() => {
    if (phase !== "measure" || !navigator.geolocation) return;
    const t0 = Date.now(), got = [];
    const id = navigator.geolocation.watchPosition(
      p => {
        const acc = p.coords.accuracy;
        if (acc > MAX_ACC_M) return;
        got.push({ lat: p.coords.latitude, lng: p.coords.longitude, acc });
        setSamples([...got]);
      },
      e => setGpsError(e.code === 1 ? "Location is blocked for this site" : "Can't get a GPS fix"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSecs(s);
      // move on by itself once the fix has settled (and it's by this hole's green)
      const a = averageOf(got);
      if (s >= SECONDS && got.length >= 3 && yardsBetween(a, center) <= 60) toAdjust(a);
    }, 250);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(tick); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const avg = averageOf(samples);
  const far = avg ? yardsBetween(avg, center) : null;

  // Step 2: close-up satellite photo with a draggable flag
  useEffect(() => {
    if (phase !== "adjust" || !mapBox.current || !spot) return;
    const map = L.map(mapBox.current, { zoomControl: false, attributionControl: false, rotate: false, rotateControl: false, touchRotate: false, maxZoom: 22 })
      .setView([spot.lat, spot.lng], 20);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 22, maxNativeZoom: 20 }).addTo(map);
    L.circleMarker([center.lat, center.lng], { radius: 4, color: "#fff", weight: 2, fillColor: "#0b2a18", fillOpacity: 1 })
      .bindTooltip("middle of green", { direction: "top", offset: [0, -4] }).addTo(map);
    if (spot.acc) L.circle([spot.lat, spot.lng], { radius: spot.acc, color: "#60a5fa", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
    const icon = L.divIcon({
      className: "",
      html: `<div style="position:relative;width:34px;height:46px"><div style="position:absolute;left:3px;top:2px;width:3px;height:42px;background:#f8f8f6;box-shadow:0 0 2px #000"></div>
        <div style="position:absolute;left:6px;top:2px;width:26px;height:17px;background:#fff;border:1px solid #0b2a18;font:900 12px Inter,sans-serif;color:#0b2a18;display:flex;align-items:center;justify-content:center">${hole.number}</div>
        <div style="position:absolute;left:0;top:40px;width:9px;height:5px;border-radius:50%;background:#000;opacity:.7"></div></div>`,
      iconSize: [34, 46], iconAnchor: [4, 43],
    });
    const m = L.marker([spot.lat, spot.lng], { icon, draggable: true, autoPan: true }).addTo(map);
    m.on("dragend", () => { const p = m.getLatLng(); setSpot(s => ({ ...s, lat: p.lat, lng: p.lng })); });
    map.on("click", e => { m.setLatLng(e.latlng); setSpot(s => ({ ...s, lat: e.latlng.lat, lng: e.latlng.lng })); });
    markerRef.current = m;
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); markerRef.current = null; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setPhase("saving");
    const r = await savePin(hole.number, { lat: spot.lat, lng: spot.lng, accuracy_m: spot.acc ?? null });
    onSaved(r);
  };

  const spotFar = spot ? Math.round(yardsBetween(spot, center)) : null;
  const btn = (bg, fg) => ({ flex: 1, padding: "12px 8px", borderRadius: 12, border: "none", background: bg, color: fg, font: "800 15px Inter,sans-serif", cursor: "pointer" });

  return (
    <div role="dialog" aria-label={`Set the pin on hole ${hole.number}`}
      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(4,14,8,0.7)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#0a1c12", border: "1.5px solid rgba(212,175,55,0.7)", borderRadius: 18, padding: 14, color: "#f0ead6", fontFamily: "Inter,sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ font: "800 13px Inter,sans-serif", letterSpacing: "0.08em", color: "#d4af37" }}>📍 SET THE PIN · HOLE {hole.number}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "rgba(240,234,214,0.7)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {phase === "measure" && (
          <>
            <p style={{ font: "700 17px Inter,sans-serif", marginBottom: 6 }}>Stand right next to the cup and hold still</p>
            <p style={{ fontSize: 13, color: "#c8d8cc", marginBottom: 12 }}>The phone averages its GPS for about {SECONDS} seconds for the best fix.</p>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", width: `${Math.min(100, (secs / SECONDS) * 100)}%`, background: "#d4af37", transition: "width 0.25s linear" }} />
            </div>
            <p style={{ fontSize: 13, color: "#c8d8cc", minHeight: 36 }}>
              {gpsError ? <span style={{ color: "#fca5a5" }}>{gpsError}</span>
                : avg ? <>GPS fixes: {samples.length} · accuracy about ±{Math.round(avg.acc * 1.094)} yds
                    {far != null && far > 60 && <><br /><span style={{ color: "#fca5a5" }}>You're {Math.round(far)} yds from hole {hole.number}'s green. Wrong hole?</span></>}</>
                : "Waiting for GPS…"}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button style={btn("rgba(255,255,255,0.08)", "#c8d8cc")} onClick={() => toAdjust({ ...(avg || hole.green), acc: avg?.acc ?? null })}>
                {avg ? "Use this now" : "Place it on the map"}
              </button>
            </div>
          </>
        )}

        {phase !== "measure" && (
          <>
            <p style={{ fontSize: 13, color: "#c8d8cc", marginBottom: 8 }}>Drag the flag (or tap the photo) to fine-tune, then save.</p>
            <div ref={mapBox} style={{ width: "100%", height: "min(52vh, 380px)", borderRadius: 12, overflow: "hidden", background: "#1d2b20" }} />
            <p style={{ fontSize: 12, color: "#c8d8cc", margin: "8px 0 10px" }}>
              {spotFar != null && <>{spotFar} yds from the middle of the green</>}
              {spot?.acc ? <> · GPS ±{Math.round(spot.acc * 1.094)} yds (blue ring)</> : null}
              {spotFar > 40 && <><br /><span style={{ color: "#fca5a5" }}>That's off the green — the app ignores pins more than 45 yds from it.</span></>}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn("rgba(255,255,255,0.08)", "#c8d8cc")} onClick={() => { setSamples([]); setSecs(0); setPhase("measure"); }} disabled={phase === "saving"}>Measure again</button>
              <button style={btn("#d4af37", "#0a1c12")} onClick={save} disabled={phase === "saving"}>{phase === "saving" ? "Saving…" : "Save pin"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
