// Thin pulsing gold bar shown at the top of the Start and Hole screens
// whenever GPS isn't giving us a usable position. The app keeps working
// underneath; only the distance features wait for a signal.
const MESSAGES = {
  off:         "Location is off — no distances. Tap to turn on",
  denied:      "Location is blocked — no distances. Tap to fix",
  weak:        "Weak GPS — turn on Precise Location. Tap for help",
  timeout:     "Searching for GPS signal… Tap to retry",
  unavailable: "No GPS signal — no distances. Tap to retry",
  unsupported: "This browser can't use GPS — no distances",
};

export default function GpsBanner({ status, onTap }) {
  const msg = MESSAGES[status];
  if (!msg) return null; // "ok" and "checking" show nothing
  return (
    <button type="button" className="gps-banner" role="alert" onClick={onTap}>
      ⚠️ {msg}
    </button>
  );
}
