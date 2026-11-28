"""Open a hole in the 3D view in headless Chrome and take screenshots from fixed cameras.
usage: shot.py URL HOLE GFX(high|low) OUTPREFIX [cams...]   cams: tee mid green top over  (default: all)
Prints triangle stats and Chrome memory (sum of RSS over all its processes)."""
import sys, time, json, re, io, os
import psutil
from PIL import Image
from playwright.sync_api import sync_playwright

url, hole, gfx, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
cams = sys.argv[5:] or ["tee", "mid", "green", "over"]
W, H, DPR = int(os.environ.get("W", 390)), int(os.environ.get("H", 844)), float(os.environ.get("DPR", 2))
WAIT = float(os.environ.get("WAIT", 3))

src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "src", "App.jsx")).read()
holes = {}
for m in re.finditer(r"number:\s*(\d+),[\s\S]*?tees:\s*\{([\s\S]*?)\},\s*green:\s*\{\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)", src):
    tees = [(float(a), float(b)) for a, b in re.findall(r"lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)", m.group(2))]
    holes[int(m.group(1))] = {"tee": tees[1], "green": (float(m.group(3)), float(m.group(4)))}
h = holes[hole]

buf = io.BytesIO(); Image.new("RGB", (256, 256), (104, 128, 96)).save(buf, "JPEG"); TILE = buf.getvalue()

def rss_mb(proc):
    tot = 0
    for p in [proc] + proc.children(recursive=True):
        try: tot += p.memory_info().rss
        except Exception: pass
    return round(tot / 1e6)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--disable-gpu-vsync"])
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR, is_mobile=W < 600, has_touch=W < 600, reduced_motion="reduce")
    ctx.route(re.compile(r"arcgisonline"), lambda r: r.fulfill(status=200, content_type="image/jpeg", body=TILE, headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route(re.compile(r"rainviewer|open-meteo|googleapis|gstatic|accounts.google|api/"), lambda r: r.abort())
    if os.environ.get("WX"):   # a made-up weather reading, so the weather buttons show
        ctx.route(re.compile(r"api\.open-meteo\.com/v1/forecast\?.*current="), lambda r: r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body='{"current":{"wind_speed_10m":9,"wind_direction_10m":120,"temperature_2m":78}}'))
    pg = ctx.new_page()
    logs = []
    pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
    pg.on("console", lambda m: logs.append(m.text[:300]) if m.type in ("error", "warning") and "404" not in m.text and "ERR_FAILED" not in m.text else None)
    pg.add_init_script(f"window.__texk = '{os.environ.get('TEXK', '')}'")
    pg.goto(url)
    pg.evaluate("""([h, gfx]) => { localStorage.clear(); localStorage.setItem('mgg_gfx', gfx); localStorage.setItem('mgg_gfx_phone_v1','1'); localStorage.setItem('mgg_map_style','3d'); localStorage.setItem('mg_instructions_seen','1'); if (window.__texk) localStorage.setItem('mgg_texk', window.__texk);
      localStorage.setItem('mg_resume_v1', JSON.stringify({t:Date.now(), uid:'guest', screen:'hole', holeIdx:h-1, roundStart:0, roundEnd:17, scores:{}, skipped:{}, shots:{}, scoring:false, round:null})); }""", [hole, gfx])
    pg.reload(); time.sleep(1.5)
    pg.get_by_text("Continue as Guest").click(timeout=8000)
    for t in ["Continue without GPS", "Got it", "Continue without GPS"]:
        try: pg.get_by_text(t, exact=False).first.click(timeout=2500)
        except Exception: pass
    t0 = time.time()
    pg.wait_for_function("() => window.__mggSceneStats && window.__mggMap && window.__mggMap.loaded()", timeout=180000)
    stats = pg.evaluate("() => window.__mggSceneStats")
    print("hole", hole, gfx, "triangles", stats["triangles"], "ready in", round(time.time() - t0, 1), "s")
    # hide the app's controls so the picture is the course
    if not os.environ.get("UI"):
        pg.add_style_tag(content=".play-stage > *:not(.mgg3d):not(:has(.mgg3d)) {visibility:hidden!important} .maplibregl-marker, .maplibregl-ctrl {visibility:hidden!important}")
    js_cam = """([tee, green, name]) => {
      const map = window.__mggMap; map.setCenterClampedToGround && map.setCenterClampedToGround(false);
      const z = (lng, lat) => map.queryTerrainElevation([lng, lat]) || 0;
      const lerp = (k) => [tee[1] + (green[1] - tee[1]) * k, tee[0] + (green[0] - tee[0]) * k];
      const kx = Math.cos(tee[0] * Math.PI / 180) * 111320, ky = 111320;
      const dx = (green[1] - tee[1]) * kx, dy = (green[0] - tee[0]) * ky, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const off = (p, along, side) => [p[0] + (ux * along - uy * side) / kx, p[1] + (uy * along + ux * side) / ky];
      const T = [tee[1], tee[0]], G = [green[1], green[0]];
      let from, fa, to, ta;
      if (name === 'tee')   { from = off(T, -14, 0); fa = 3.2; to = lerp(0.45); ta = 1; }
      if (name === 'mid')   { from = off(lerp(0.5), 0, 6); fa = 2.2; to = G; ta = 1.5; }
      if (name === 'side')  { from = off(lerp(0.35), 0, -25); fa = 2.0; to = off(lerp(0.6), 0, 30); ta = 3; }
      if (name === 'green') { from = off(G, -32, 4); fa = 2.4; to = G; ta = 0.6; }
      if (name === 'close') { from = off(G, -9, 1); fa = 1.7; to = G; ta = 0.2; }
      if (name === 'teebox'){ from = off(T, -9, 3); fa = 2.6; to = off(T, 6, 0); ta = 0; }
      if (name === 'over')  { from = off(lerp(0.5), -L * 0.75, 0); fa = L * 0.6; to = lerp(0.5); ta = 0; }
      if (name === 'top')   { from = off(lerp(0.5), -1, 0); fa = L * 1.25; to = lerp(0.5); ta = 0; }
      map.jumpTo(map.calculateCameraOptionsFromTo({lng: from[0], lat: from[1]}, z(...from) + fa, {lng: to[0], lat: to[1]}, z(...to) + ta));
      map.triggerRepaint();
    }"""
    for c in cams:
        pg.evaluate(js_cam, [list(h["tee"]), list(h["green"]), c])
        time.sleep(WAIT)
        try: pg.wait_for_function("() => window.__mggMap.areTilesLoaded()", timeout=30000)
        except Exception: pass
        time.sleep(1.0)
        pg.screenshot(path=f"{out}-h{hole}-{gfx}-{c}.png")
    proc = psutil.Process(b.process.pid) if hasattr(b, "process") else None
    chrome = [q for q in psutil.process_iter(["name", "cmdline"]) if "chrome" in (q.info["name"] or "")]
    tot = 0; gpu = 0; rend = 0
    for q in chrome:
        try:
            r = q.memory_info().rss; tot += r
            cl = " ".join(q.info["cmdline"] or [])
            if "--type=gpu-process" in cl: gpu = r
            if "--type=renderer" in cl: rend = max(rend, r)
        except Exception: pass
    heap = pg.evaluate("() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1")
    print("memory MB: all chrome", round(tot / 1e6), " renderer", round(rend / 1e6), " gpu", round(gpu / 1e6), " js heap", heap)
    for l in logs[:8]: print("LOG", l)
    b.close()
