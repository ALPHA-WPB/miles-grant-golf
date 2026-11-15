"""audit N: side-by-side raw | numbered-tree overlay close-ups along hole N's corridor (hole pixel grid)."""
import sys, json, os, math, numpy as np, cv2
sys.path.insert(0, 'tools/course3d')
import trace_kit as tk
num = int(sys.argv[1]); out = sys.argv[2]
hi = tk.HoleImage(num)
cj = json.load(open('public/course3d/course.json'))
raw = cv2.convertScaleAbs(hi.img, alpha=1.25, beta=-10); ov = raw.copy()
P = lambda ring: np.array([hi.px(lat, lng) for lng, lat in ring], np.int32)
colors = {'green': (0, 0, 255), 'tee': (255, 0, 255), 'fairway': (0, 255, 0), 'bunker': (255, 255, 0)}
trees = []
for i, f in enumerate(cj['features']):
    k = f['properties']['kind']; g = f['geometry']
    if k in colors:
        for p in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']): cv2.polylines(ov, [P(p[0])], True, colors[k], 1)
    elif k == 'tree': trees.append((i, f))
g = hi.px(*hi.hole['green']); tees = [hi.px(*t) for t in hi.hole['tees']]
t0 = max(tees, key=lambda t: math.hypot(t[0]-g[0], t[1]-g[1]))
L = math.hypot(g[0]-t0[0], g[1]-t0[1]); n = max(1, round(L / 230))
SC = 2.2; hw, hh = 160, 125
big = cv2.resize(ov, None, fx=SC, fy=SC, interpolation=cv2.INTER_CUBIC)
for i, f in trees:
    x, y = hi.px(f['geometry']['coordinates'][1], f['geometry']['coordinates'][0])
    if not (0 <= x < ov.shape[1] and 0 <= y < ov.shape[0]): continue
    col = (0, 0, 255) if f['properties']['type'] == 'palm' else (0, 255, 255)
    X, Y = int(x*SC), int(y*SC)
    cv2.circle(big, (X, Y), max(int(f['properties']['r']/hi.mpp*SC), 6), col, 1); cv2.circle(big, (X, Y), 2, col, -1)
    cv2.putText(big, str(i), (X+4, Y-4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0,0,0), 3); cv2.putText(big, str(i), (X+4, Y-4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255,255,255), 1)
rbig = cv2.resize(raw, None, fx=SC, fy=SC, interpolation=cv2.INTER_CUBIC)
for im in (big, rbig):
    for x in range(0, raw.shape[1], 50):
        cv2.line(im, (int(x*SC), 0), (int(x*SC), im.shape[0]), (255,255,255) if x % 100 == 0 else (150,150,150), 1)
    for y in range(0, raw.shape[0], 50):
        cv2.line(im, (0, int(y*SC)), (im.shape[1], int(y*SC)), (255,255,255) if y % 100 == 0 else (150,150,150), 1)
for j in range(n + 1):
    cx = t0[0] + (g[0]-t0[0]) * j / n; cy = t0[1] + (g[1]-t0[1]) * j / n
    x0 = int(min(max(cx-hw, 0), raw.shape[1]-2*hw)); y0 = int(min(max(cy-hh, 0), raw.shape[0]-2*hh))
    a = rbig[int(y0*SC):int((y0+2*hh)*SC), int(x0*SC):int((x0+2*hw)*SC)].copy(); b = big[int(y0*SC):int((y0+2*hh)*SC), int(x0*SC):int((x0+2*hw)*SC)].copy()
    for im in (a, b):
        for x in range((x0//50+1)*50, x0+2*hw, 50): cv2.putText(im, str(x), (int((x-x0)*SC)+2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0,255,255), 1)
        for y in range((y0//50+1)*50, y0+2*hh, 50): cv2.putText(im, str(y), (2, int((y-y0)*SC)-2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0,255,255), 1)
    p = f'{out}/audit{num}_{j}.jpg'; cv2.imwrite(p, np.hstack([a, np.zeros((a.shape[0], 6, 3), np.uint8), b]), [cv2.IMWRITE_JPEG_QUALITY, 85]); print(p, a.shape)
