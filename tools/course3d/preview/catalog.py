import sys, time, os
from playwright.sync_api import sync_playwright
url, out = sys.argv[1], sys.argv[2]
W, H = int(os.environ.get("W", 1500)), int(os.environ.get("H", 700))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": W, "height": H})
    logs = []
    pg.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:400])); pg.on("console", lambda m: logs.append(m.text[:300]) if m.type == "error" else None)
    pg.goto(url)
    try: pg.wait_for_function("() => window.__done", timeout=120000)
    except Exception as e: print("timeout")
    time.sleep(0.5); pg.screenshot(path=out)
    try: print(pg.evaluate("() => window.__info.tris.join('  ')"))
    except Exception: pass
    for l in logs[:6]: print("LOG", l)
    b.close()
