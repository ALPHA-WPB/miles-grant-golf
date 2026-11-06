"""Helpers for tracing a hole from Esri satellite imagery into tools/course3d/traced.json.

Run from the repo root with tools/course3d/.venv/bin/python.

  crop N            Stitch imagery around hole N and write gridded close-ups to tools/course3d/.work/:
                    holeN_overview.jpg, holeN_green.jpg, holeN_tees.jpg (grid labels are pixel
                    coordinates in that hole's image; use them in shapes files).
  add N FILE        Convert a shapes file written in those pixel coordinates to lat/lng and store it
                    in traced.json under holes.N (replacing greens/tees/fairways/fairwaySpines/cartPaths
                    that the file provides). Shapes file (JSON):
                      {"greens": [[cx, cy, rx, ry, angle_deg], ...],
                       "tees":   [[cx, cy, rx, ry, angle_deg], ...],
                       "fairwaySpines": [[[x, y, width_px], ...], ...],   # centerline, tee→green order
                       "fairways": [[[x, y], ...], ...],                  # or explicit polygons
                       "cartPaths": [[[x, y], ...], ...]}
  check N           After running build.py: overlay the built greens/tees/fairways/bunkers/cart paths
                    and numbered trees on the photo -> holeN_check.jpg (and _check_tees.jpg / _check_green.jpg).
                    Trees are drawn yellow (oak) / red (palm) with their index in course.json.
"""
import json, math, os, re, sys, urllib.request
import numpy as np, cv2

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, 'tools', 'course3d')
CACHE = os.path.join(HERE, '.cache')
WORK = os.path.join(HERE, '.work')
Z = 19
os.makedirs(CACHE, exist_ok=True); os.makedirs(WORK, exist_ok=True)


def holes():
    src = open(os.path.join(ROOT, 'src', 'App.jsx')).read()
    out = {}
    for m in re.finditer(r'number:\s*(\d+),.*?tees:\s*\{(.*?)\},\s*green:\s*\{\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)', src, re.S):
        tees = [(float(a), float(b)) for a, b in re.findall(r'lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)', m.group(2))]
        out[int(m.group(1))] = {'tees': tees, 'green': (float(m.group(3)), float(m.group(4)))}
    return out


def tile_xy(lat, lng):
    n = 2 ** Z
    return (lng + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


class HoleImage:
    """Stitched z19 imagery around one hole, with pixel <-> lat/lng conversion."""
    def __init__(self, num, pad_m=70):
        h = holes()[num]
        pts = h['tees'] + [h['green']]
        lats = [p[0] for p in pts]; lngs = [p[1] for p in pts]
        dl = pad_m / 111320; dg = pad_m / (111320 * math.cos(math.radians(lats[0])))
        self.s, self.n = min(lats) - dl, max(lats) + dl
        self.w, self.e = min(lngs) - dg, max(lngs) + dg
        x0, y0 = tile_xy(self.n, self.w); x1, y1 = tile_xy(self.s, self.e)
        self.tx0, self.ty0 = int(x0), int(y0)
        cols, rows = int(x1) - self.tx0 + 1, int(y1) - self.ty0 + 1
        self.img = np.zeros((rows * 256, cols * 256, 3), np.uint8)
        for i in range(cols):
            for j in range(rows):
                tx, ty = self.tx0 + i, self.ty0 + j
                p = os.path.join(CACHE, f'{Z}_{tx}_{ty}.jpg')
                if not os.path.exists(p):
                    u = f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}'
                    open(p, 'wb').write(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'mgg-trace'}), timeout=30).read())
                self.img[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = cv2.imread(p)
        self.num, self.hole = num, h
        self.mpp = 156543.03 * math.cos(math.radians(lats[0])) / 2 ** Z

    def px(self, lat, lng):
        x, y = tile_xy(lat, lng)
        return (x - self.tx0) * 256, (y - self.ty0) * 256

    def ll(self, px, py):
        n = 2 ** Z; x = px / 256 + self.tx0; y = py / 256 + self.ty0
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))), x / n * 360 - 180


def grid_crop(img, x0, y0, x1, y1, scale, path, step=None):
    H, W = img.shape[:2]
    x0, y0, x1, y1 = max(0, int(x0)), max(0, int(y0)), min(W, int(x1)), min(H, int(y1))
    c = cv2.resize(img[y0:y1, x0:x1].copy(), None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    step = step or (10 if scale >= 2.5 else 50)
    major = step * 5 if step == 10 else 100
    for x in range((x0 // step + 1) * step, x1, step):
        X = int((x - x0) * scale)
        cv2.line(c, (X, 0), (X, c.shape[0]), (255, 255, 255) if x % major == 0 else (110, 110, 110), 1)
        if x % major == 0: cv2.putText(c, str(x), (X + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    for y in range((y0 // step + 1) * step, y1, step):
        Y = int((y - y0) * scale)
        cv2.line(c, (0, Y), (c.shape[1], Y), (255, 255, 255) if y % major == 0 else (110, 110, 110), 1)
        if y % major == 0: cv2.putText(c, str(y), (2, Y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    cv2.imwrite(path, c, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return path


def crop(num):
    hi = HoleImage(num)
    g = hi.px(*hi.hole['green'])
    tees = [hi.px(*t) for t in hi.hole['tees']]
    img = hi.img.copy()
    for t in tees: cv2.circle(img, (int(t[0]), int(t[1])), 6, (255, 0, 0), 2)
    cv2.circle(img, (int(g[0]), int(g[1])), 7, (0, 0, 255), 2)
    H, W = img.shape[:2]
    sc = min(1.0, 1500 / max(W, H))
    out = [grid_crop(img, 0, 0, W, H, sc, os.path.join(WORK, f'hole{num}_overview.jpg'), step=50),
           grid_crop(cv2.convertScaleAbs(img, alpha=1.5, beta=-60), g[0] - 90, g[1] - 80, g[0] + 90, g[1] + 80, 3, os.path.join(WORK, f'hole{num}_green.jpg')),
           grid_crop(cv2.convertScaleAbs(img, alpha=1.5, beta=-60), min(t[0] for t in tees) - 70, min(t[1] for t in tees) - 70,
                     max(t[0] for t in tees) + 70, max(t[1] for t in tees) + 70, 2.5, os.path.join(WORK, f'hole{num}_tees.jpg'))]
    meta = {'hole': num, 'tile_origin': [hi.tx0, hi.ty0], 'size': [W, H], 'green_px': [round(v) for v in g],
            'tees_px': [[round(v) for v in t] for t in tees], 'meters_per_px': round(hi.mpp, 4),
            'bbox_s_w_n_e': [hi.s, hi.w, hi.n, hi.e]}
    json.dump(meta, open(os.path.join(WORK, f'hole{num}_meta.json'), 'w'), indent=1)
    print(json.dumps(meta, indent=1)); print('\n'.join(out))


def oval(hi, cx, cy, rx, ry, ang=0, ex=2.2, n=56):
    a = math.radians(ang); pts = []
    for i in range(n):
        t = 2 * math.pi * i / n; c, s = math.cos(t), math.sin(t)
        x = rx * math.copysign(abs(c) ** (2 / ex), c); y = ry * math.copysign(abs(s) ** (2 / ex), s)
        lat, lng = hi.ll(cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a))
        pts.append([round(lng, 7), round(lat, 7)])
    return pts


def add(num, shapes_path):
    hi = HoleImage(num)
    sh = json.load(open(shapes_path))
    tp = os.path.join(HERE, 'traced.json')
    d = json.load(open(tp))
    h = d['holes'].setdefault(str(num), {})
    ll = lambda x, y: [round(v, 7) for v in reversed(hi.ll(x, y))]
    if 'greens' in sh: h['greens'] = [oval(hi, *g, ex=2.0) for g in sh['greens']]
    if 'tees' in sh: h['tees'] = [oval(hi, *t) for t in sh['tees']]
    if 'fairwaySpines' in sh:
        h['fairwaySpines'] = [[ll(x, y) + [round(w * hi.mpp, 1)] for x, y, w in sp] for sp in sh['fairwaySpines']]
    if 'fairways' in sh: h['fairways'] = [[ll(x, y) for x, y in poly] for poly in sh['fairways']]
    if 'cartPaths' in sh: h['cartPaths'] = [[ll(x, y) for x, y in line] for line in sh['cartPaths']]
    json.dump(d, open(tp, 'w'), indent=1)
    print('hole', num, 'now has', {k: len(v) for k, v in h.items()})


def check(num):
    hi = HoleImage(num)
    cj = json.load(open(os.path.join(ROOT, 'public', 'course3d', 'course.json')))
    out = hi.img.copy()
    P = lambda ring: np.array([hi.px(lat, lng) for lng, lat in ring], np.int32)
    colors = {'green': (0, 0, 255), 'fringe': (0, 0, 160), 'tee': (255, 0, 255), 'fairway': (0, 255, 0), 'bunker': (255, 255, 0)}
    trees = []
    for i, f in enumerate(cj['features']):
        k = f['properties']['kind']; g = f['geometry']
        if k in colors:
            polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
            for p in polys: cv2.polylines(out, [P(p[0])], True, colors[k], 2)
        elif k == 'cartpath':
            cv2.polylines(out, [P(g['coordinates'])], False, (200, 200, 255), 3)
        elif k == 'tree':
            trees.append((i, f))
    for i, f in trees:
        x, y = hi.px(f['geometry']['coordinates'][1], f['geometry']['coordinates'][0])
        if not (0 <= x < out.shape[1] and 0 <= y < out.shape[0]): continue
        r = max(int(f['properties']['r'] / hi.mpp), 5)
        col = (0, 0, 255) if f['properties']['type'] == 'palm' else (0, 255, 255)
        cv2.circle(out, (int(x), int(y)), r, col, 1)
        cv2.putText(out, str(i), (int(x) - 8, int(y) + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 2)
        cv2.putText(out, str(i), (int(x) - 8, int(y) + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 0), 1)
    H, W = out.shape[:2]
    g = hi.px(*hi.hole['green']); tees = [hi.px(*t) for t in hi.hole['tees']]
    print(grid_crop(out, 0, 0, W, H, min(1.0, 1500 / max(W, H)), os.path.join(WORK, f'hole{num}_check.jpg'), step=50))
    print(grid_crop(out, g[0] - 90, g[1] - 80, g[0] + 90, g[1] + 80, 3, os.path.join(WORK, f'hole{num}_check_green.jpg')))
    print(grid_crop(out, min(t[0] for t in tees) - 70, min(t[1] for t in tees) - 70, max(t[0] for t in tees) + 70,
                    max(t[1] for t in tees) + 70, 2.5, os.path.join(WORK, f'hole{num}_check_tees.jpg')))


if __name__ == '__main__':
    cmd, num = sys.argv[1], int(sys.argv[2])
    {'crop': lambda: crop(num), 'check': lambda: check(num), 'add': lambda: add(num, sys.argv[3])}[cmd]()
