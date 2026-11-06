import { useEffect, useState } from "react";
import { useLightning, cardinal, minutesAgo, clearTime, RADIUS_MI } from "../lib/lightning";

// Hour-by-hour weather for the next 6 hours at Miles Grant (Open-Meteo: free, no key), shown over a
// translucent screen. Tap anywhere to close.
const URL = "https://api.open-meteo.com/v1/forecast?latitude=27.147&longitude=-80.179"
  + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,is_day"
  + "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day"
  + "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_hours=8";

let cache = null;   // { at, data } — reuse for 10 minutes

const ICONS = (code, day) => {
  if (code === 0) return day ? "☀️" : "🌙";
  if (code <= 2) return day ? "🌤️" : "☁️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 95) return "⛈️";
  if (code >= 80) return "🌦️";
  if (code >= 61) return "🌧️";
  if (code >= 51) return "🌦️";
  return "☁️";
};
const WORDS = (code) => code === 0 ? "Clear" : code <= 2 ? "Partly cloudy" : code === 3 ? "Cloudy" : code === 45 || code === 48 ? "Fog"
  : code >= 95 ? "Thunderstorms" : code >= 80 ? "Showers" : code >= 61 ? "Rain" : code >= 51 ? "Drizzle" : "Cloudy";
const hourLabel = (iso) => {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};

export default function WeatherPanel({ onClose }) {
  const [data, setData] = useState(cache?.data ?? null);
  const [failed, setFailed] = useState(false);
  const bolt = useLightning();

  useEffect(() => {
    if (cache && Date.now() - cache.at < 10 * 60 * 1000) return;
    let dead = false;
    fetch(URL).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { cache = { at: Date.now(), data: d }; if (!dead) setData(d); })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // the next 6 whole hours after now
  let hours = [];
  if (data?.hourly?.time) {
    const h = data.hourly, nowKey = (data.current?.time || "").slice(0, 13);
    let start = h.time.findIndex(t => t.slice(0, 13) > nowKey);
    if (start < 0) start = 0;
    hours = h.time.slice(start, start + 6).map((t, k) => {
      const i = start + k;
      return { t, temp: Math.round(h.temperature_2m[i]), pop: h.precipitation_probability[i] ?? 0, rain: h.precipitation[i] ?? 0,
        code: h.weather_code[i], day: h.is_day[i] === 1, wind: Math.round(h.wind_speed_10m[i]), gust: Math.round(h.wind_gusts_10m[i]),
        dir: h.wind_direction_10m[i] };
    });
  }
  const c = data?.current;
  const stormSoon = hours.some(x => x.code >= 95);

  const cell = { textAlign: "center", fontFamily: "'Inter',sans-serif" };
  return (
    <div onClick={onClose} role="dialog" aria-label="Hourly weather"
      style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 14,
        background: "rgba(4,14,8,0.55)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)", animation: "wxIn 0.18s ease-out" }}>
      <style>{"@keyframes wxIn{from{opacity:0}to{opacity:1}}"}</style>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 380, background: "rgba(8,24,15,0.82)", border: "1.5px solid rgba(212,175,55,0.7)", borderRadius: 18,
          padding: "14px 12px 12px", color: "#f0ead6", boxShadow: "0 10px 40px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ font: "800 13px Inter,sans-serif", letterSpacing: "0.08em", color: "#d4af37" }}>NEXT 6 HOURS · MILES GRANT</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "rgba(240,234,214,0.7)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>×</button>
        </div>

        {c && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", marginBottom: 10, background: "rgba(255,255,255,0.05)", borderRadius: 12 }}>
            <span style={{ fontSize: 34, lineHeight: 1 }}>{ICONS(c.weather_code, c.is_day === 1)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ font: "800 26px Inter,sans-serif", lineHeight: 1 }}>{Math.round(c.temperature_2m)}°<span style={{ fontSize: 13, fontWeight: 600, color: "#c8d8cc" }}> feels {Math.round(c.apparent_temperature)}°</span></div>
              <div style={{ font: "600 13px Inter,sans-serif", color: "#c8d8cc", marginTop: 3 }}>{WORDS(c.weather_code)} · Wind {cardinal(c.wind_direction_10m)} {Math.round(c.wind_speed_10m)} mph, gusts {Math.round(c.wind_gusts_10m)}</div>
            </div>
          </div>
        )}

        <div style={{ borderRadius: 10, padding: "6px 10px", marginBottom: 10, font: "700 13px Inter,sans-serif",
          ...(bolt.active
            ? { background: "rgba(250,204,21,0.92)", color: "#1c1400" }
            : { background: "rgba(255,255,255,0.05)", color: "#c8d8cc" }) }}>
          {bolt.active
            ? <>⚡ Lightning {Math.round(bolt.last.mi)} mi {cardinal(bolt.last.brg)} · {minutesAgo(bolt.last.t, bolt.now) === 0 ? "just now" : `${minutesAgo(bolt.last.t, bolt.now)} min ago`} · clear at {clearTime(bolt.last.t)}</>
            : bolt.ok === false
              ? <>⚡ Lightning check unavailable right now</>
              : bolt.ok
                ? <>⚡ No lightning within {RADIUS_MI} mi in the last 30 min</>
                : <>⚡ Checking for lightning…</>}
        </div>

        {stormSoon && (
          <div style={{ background: "rgba(250,204,21,0.15)", border: "1px solid rgba(250,204,21,0.6)", borderRadius: 10, padding: "6px 10px", marginBottom: 10, font: "700 13px Inter,sans-serif", color: "#fde68a" }}>
            ⚡ Thunderstorms in the forecast in the next 6 hours
          </div>
        )}

        {hours.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
            {hours.map(x => (
              <div key={x.t} style={{ ...cell, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "8px 2px 7px" }}>
                <div style={{ font: "700 11px Inter,sans-serif", color: "#c8d8cc" }}>{hourLabel(x.t)}</div>
                <div style={{ fontSize: 22, lineHeight: 1.25, margin: "3px 0 1px" }}>{ICONS(x.code, x.day)}</div>
                <div style={{ font: "800 17px Inter,sans-serif" }}>{x.temp}°</div>
                <div style={{ font: "700 12px Inter,sans-serif", color: x.pop >= 40 ? "#60a5fa" : "rgba(200,216,204,0.7)", marginTop: 4 }}>💧{x.pop}%</div>
                <div style={{ font: "600 10px Inter,sans-serif", color: "rgba(200,216,204,0.7)", minHeight: 13 }}>{x.rain >= 0.01 ? `${x.rain.toFixed(2)}"` : ""}</div>
                <div style={{ marginTop: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ display: "inline-block", fontSize: 13, color: "#d4af37", transform: `rotate(${x.dir + 180}deg)`, lineHeight: 1 }} aria-hidden="true">↑</span>
                  <span style={{ font: "800 12px Inter,sans-serif", color: "#d4af37" }}>{x.wind}</span>
                  <span style={{ font: "600 9px Inter,sans-serif", color: "rgba(200,216,204,0.65)" }}>{cardinal(x.dir)} · g{x.gust}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...cell, padding: "26px 0", color: "#c8d8cc", font: "600 14px Inter,sans-serif" }}>
            {failed ? "Couldn't load the forecast — check your signal." : "Loading forecast…"}
          </div>
        )}

        <div style={{ ...cell, marginTop: 10, font: "500 10px Inter,sans-serif", color: "rgba(200,216,204,0.5)" }}>
          Wind in mph (arrow shows where it blows, g = gusts) · 💧 chance of rain · Lightning from NOAA's GOES satellite · Tap anywhere to close
        </div>
      </div>
    </div>
  );
}
