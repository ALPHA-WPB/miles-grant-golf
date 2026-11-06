// A Miles Grant #3 golf ball, drawn as vector art so it stays sharp at any size. Dimples sit on
// a sphere (Fibonacci layout) and are foreshortened toward the edge like a real ball.
const R = 100;
const DIMPLES = (() => {
  const out = [], n = 420, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (z < 0.08) continue;                              // back half
    const px = x * R * 0.94, py = -y * R * 0.94;
    const d = Math.hypot(px, py) || 1;
    const big = 6.6 * (0.9 + 0.1 * ((i * 7) % 3));
    out.push({ x: px, y: py, rx: big, ry: big * z, ang: Math.atan2(py, px) * 180 / Math.PI + 90, z, d });
  }
  return out;
})();

export default function GolfBall({ size = 100, style }) {
  return (
    <svg viewBox="-104 -104 208 208" width={size} height={size} style={{ textTransform: "none", ...style }} aria-hidden="true">
      <defs>
        <radialGradient id="gbShade" cx="-0.32" cy="-0.38" r="1.25" fx="-0.36" fy="-0.42">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#f6f7f4" />
          <stop offset="0.78" stopColor="#dcdfd8" />
          <stop offset="1" stopColor="#a9ada5" />
        </radialGradient>
        <radialGradient id="gbDimple" cx="0.62" cy="0.65" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#e9ebe6" stopOpacity="0.4" />
          <stop offset="1" stopColor="#8d928a" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id="gbRim" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.82" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#3b4038" stopOpacity="0.35" />
        </radialGradient>
        <clipPath id="gbClip"><circle r={R} /></clipPath>
      </defs>
      <circle r={R} fill="url(#gbShade)" />
      <g clipPath="url(#gbClip)">
        {DIMPLES.map((d, i) => (
          <ellipse key={i} cx={d.x} cy={d.y} rx={d.rx} ry={d.ry} fill="url(#gbDimple)"
            transform={`rotate(${d.ang} ${d.x} ${d.y})`} opacity={0.35 + 0.65 * d.z} />
        ))}
      </g>
      {/* printed logo, slightly worn into the dimples */}
      <g style={{ mixBlendMode: "multiply" }}>
        <text x="0" y="-14" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontStyle="italic"
          fontWeight="700" fontSize="27" fill="#0f3b22" textLength="128" lengthAdjust="spacingAndGlyphs">Miles Grant</text>
        <line x1="-46" y1="-4" x2="46" y2="-4" stroke="#b8932f" strokeWidth="2.2" />
        <text x="0" y="50" textAnchor="middle" fontFamily="'Inter', Arial, sans-serif" fontWeight="800"
          fontSize="54" fill="#c0262d">3</text>
      </g>
      <circle r={R} fill="url(#gbRim)" />
      <ellipse cx="-36" cy="-44" rx="22" ry="13" fill="#fff" opacity="0.55" transform="rotate(-35 -36 -44)" />
    </svg>
  );
}
