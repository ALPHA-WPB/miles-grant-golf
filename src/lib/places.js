// Course facilities shown as icons on both the satellite and 3D maps (positions from the owner)
export const COURSE_PLACES = [
  { name: "Restrooms", icon: "🚻", lat: 27.148987, lng: -80.178747 },
  { name: "Restrooms", icon: "🚻", lat: 27.146393, lng: -80.179512 },
  { name: "Pro Shop", icon: "🏌️", lat: 27.147861, lng: -80.173954 },
  { name: "Tavern", icon: "🍺", lat: 27.148093, lng: -80.173914 },
  { name: "Rain Shelter", icon: "⛱️", lat: 27.145789, lng: -80.184848 },
];

// Badge markup shared by both maps: round icon with a small name tag beside it
export const placeBadgeHtml = (p) =>
  `<div style="display:flex;align-items:center;gap:4px;pointer-events:none;transform:translate(-14px,-14px)">` +
  `<div style="width:28px;height:28px;border-radius:50%;background:#fff;border:2px solid #0f3b22;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,0.55)">${p.icon}</div>` +
  `<div style="background:rgba(8,26,16,0.88);color:#f0ead6;font:700 10px Inter,sans-serif;padding:2px 6px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${p.name}</div></div>`;
