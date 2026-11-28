"""Leak check: walks through holes with the next-hole arrow and counts how many maps, 3D scenes and renderers are
still alive after each one. Every count must stay at 1; a count that climbs means holes are piling up in memory.
usage: leak.py URL GFX(high|low) HOLES [snapshot.heapsnapshot]"""
import sys, time, re, io, os
from PIL import Image
from playwright.sync_api import sync_playwright
url, gfx, N = sys.argv[1], sys.argv[2], int(sys.argv[3])
buf = io.BytesIO(); Image.new("RGB", (256, 256), (104, 128, 96)).save(buf, "JPEG"); TILE = buf.getvalue()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, reduced_motion="reduce")
    ctx.route(re.compile(r"arcgisonline"), lambda r: r.fulfill(status=200, content_type="image/jpeg", body=TILE, headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route(re.compile(r"rainviewer|open-meteo|googleapis|gstatic|accounts.google|api/"), lambda r: r.abort())
    pg = ctx.new_page(); pg.goto(url)
    pg.evaluate("""([gfx]) => { localStorage.clear(); localStorage.setItem('mgg_gfx', gfx); localStorage.setItem('mgg_gfx_phone_v1','1'); localStorage.setItem('mgg_map_style','3d'); localStorage.setItem('mg_instructions_seen','1');
      localStorage.setItem('mg_resume_v1', JSON.stringify({t:Date.now(), uid:'guest', screen:'hole', holeIdx:0, roundStart:0, roundEnd:18, scores:{}, skipped:{}, shots:{}, scoring:false, round:null})); }""", [gfx])
    pg.reload(); time.sleep(1.5)
    pg.get_by_text("Continue as Guest").click(timeout=8000)
    for t in ["Continue without GPS", "Got it"]:
        try: pg.get_by_text(t, exact=False).first.click(timeout=2500)
        except Exception: pass
    cdp = ctx.new_cdp_session(pg)
    def count(expr):
        o = cdp.send("Runtime.evaluate", {"expression": expr})["result"]
        if "objectId" not in o: return -1
        q = cdp.send("Runtime.queryObjects", {"prototypeObjectId": o["objectId"], "objectGroup": "probe"})["objects"]
        n = cdp.send("Runtime.callFunctionOn", {"objectId": q["objectId"], "functionDeclaration": "function(){return this.length}"})["result"]["value"]
        cdp.send("Runtime.releaseObjectGroup", {"objectGroup": "probe"}); cdp.send("Runtime.releaseObject", {"objectId": o["objectId"]})
        return n
    for i in range(N):
        pg.wait_for_function("() => window.__mggSceneStats && window.__mggMap && window.__mggMap.loaded()", timeout=180000)
        time.sleep(4)
        cdp.send("HeapProfiler.collectGarbage"); time.sleep(1)
        heap = pg.evaluate("() => Math.round(performance.memory.usedJSHeapSize / 1e6)")
        print("hole", i + 1, "heap", heap, "maps", count("Object.getPrototypeOf(window.__mggMap)"), "scenes", count("Object.getPrototypeOf(window.__mggDbg.scene)"),
              "renderers", count("Object.getPrototypeOf(window.__mggDbg.renderer)"), "canvases", count("HTMLCanvasElement.prototype"), "imgdata", count("ImageData.prototype"), flush=True)
        if i < N - 1:
            pg.evaluate("() => { window.__mggSceneStats = null; }")
            pg.locator('button[aria-label="Next hole"]').click()
            time.sleep(0.5)
    if len(sys.argv) > 4:
        import json
        chunks = []
        cdp.on("HeapProfiler.addHeapSnapshotChunk", lambda e: chunks.append(e["chunk"]))
        cdp.send("HeapProfiler.takeHeapSnapshot", {"reportProgress": False})
        open(sys.argv[4], "w").write("".join(chunks)); print("snapshot written")
    b.close()
