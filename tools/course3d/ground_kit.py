"""Helpers for built-up areas traced by hand at zoom 20: the clubhouse grounds (parking lot, pool,
courts, practice areas) and the maintenance yard. They end up in traced.json "grounds".

Run from the repo root with tools/course3d/.venv/bin/python.

Coordinates are WHOLE-COURSE zoom-19 pixels (the same grid as water_kit.py; fractions are fine).
The photos shown are zoom-20 tiles (about 0.13 m per pixel), fetched with curl into .cache.

  crop X0 Y0 X1 Y1 [SCALE] [NAME]    gridded close-up            -> .work/NAME.jpg
  check X0 Y0 X1 Y1 [SCALE] [NAME]   the same with the built course.json drawn on it (run build.py first)
  pave                               pavement outlines by colour inside each grounds_px.json "pave" entry
                                     -> .work/pave_<tag>.json (pixel rings) + .work/pave_<tag>.jpg to look at
  add                                grounds_px.json (+ the pave results) -> traced.json "grounds" (lng/lat)

grounds_px.json holds everything traced by hand, in those pixel coordinates; see its "_note".
"""
import json, math, os, subprocess, sys
import numpy as np, cv2

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, 'tools', 'course3d')
CACHE = os.path.join(HERE, '.cache')
WORK = os.path.join(HERE, '.work')
TR = os.path.join(HERE, 'traced.json')
SRC = os.path.join(HERE, 'grounds_px.json')
Z = 19
os.makedirs(CACHE, exist_ok=True); os.makedirs(WORK, exist_ok=True)


def tile_xy(lat, lng, z=Z):
    n = 2 ** z
    return (lng + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


_s, _w, _n, _e = json.load(open(TR))['regions'][0]['bbox']
TX0, TY0 = int(tile_xy(_n, _w)[0]), int(tile_xy(_n, _w)[1])
MPP = 156543.03 * math.cos(math.radians((_s + _n) / 2)) / 2 ** Z      # metres per course pixel


def px(lng, lat):
    x, y = tile_xy(lat, lng)
    return (x - TX0) * 256, (y - TY0) * 256


def ll(x, y):
    n = 2 ** Z; tx = x / 256 + TX0; ty = y / 256 + TY0
    return round(tx / n * 360 - 180, 7), round(math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * ty / n)))), 7)


class Photo:
    """Zoom-20 photo of a course-pixel box. self.img is at 2 photo pixels per course pixel."""
    def __init__(self, x0, y0, x1, y1):
        self.x0, self.y0 = math.floor(x0 / 128) * 128, math.floor(y0 / 128) * 128      # snap to z20 tile edges
        tx0, ty0 = TX0 * 2 + self.x0 // 128, TY0 * 2 + self.y0 // 128
        cols, rows = math.ceil((x1 - self.x0) / 128), math.ceil((y1 - self.y0) / 128)
        need = [(tx0 + i, ty0 + j) for i in range(cols) for j in range(rows)]
        miss = [t for t in need if not os.path.exists(os.path.join(CACHE, f'20_{t[0]}_{t[1]}.jpg'))
                or os.path.getsize(os.path.join(CACHE, f'20_{t[0]}_{t[1]}.jpg')) == 0]
        if miss:        # curl, in parallel: the system Python's SSL can't reach the tile server reliably
            cfg = ''.join(f'url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/20/{ty}/{tx}"\n'
                          f'output = "{os.path.join(CACHE, f"20_{tx}_{ty}.jpg")}"\n' for tx, ty in miss)
            subprocess.run(['curl', '-sS', '-f', '--parallel', '--parallel-max', '8', '-A', 'mgg-course3d', '-K', '-'],
                           input=cfg.encode(), check=True)
        self.img = np.zeros((rows * 256, cols * 256, 3), np.uint8)
        for i in range(cols):
            for j in range(rows):
                self.img[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = cv2.imread(os.path.join(CACHE, f'20_{tx0 + i}_{ty0 + j}.jpg'))

    def at(self, x, y):                      # course pixel -> photo pixel
        return (x - self.x0) * 2, (y - self.y0) * 2

    def crop(self, x0, y0, x1, y1, scale, path, step=None, grid=True, draw=None):
        a = self.img[int((y0 - self.y0) * 2):int((y1 - self.y0) * 2), int((x0 - self.x0) * 2):int((x1 - self.x0) * 2)]
        c = cv2.resize(a, None, fx=scale / 2, fy=scale / 2, interpolation=cv2.INTER_CUBIC if scale > 2 else cv2.INTER_AREA)
        if draw: draw(c, lambda x, y: (int(round((x - x0) * scale)), int(round((y - y0) * scale))))
        if grid:
            step = step or (10 if scale >= 2.5 else 50)
            major = step * 5 if step == 10 else 100
            for x in range((int(x0) // step + 1) * step, int(x1), step):
                X = int((x - x0) * scale)
                cv2.line(c, (X, 0), (X, c.shape[0]), (255, 255, 255) if x % major == 0 else (120, 120, 120), 1)
                if x % major == 0: cv2.putText(c, str(x), (X + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1)
            for y in range((int(y0) // step + 1) * step, int(y1), step):
                Y = int((y - y0) * scale)
                cv2.line(c, (0, Y), (c.shape[1], Y), (255, 255, 255) if y % major == 0 else (120, 120, 120), 1)
                if y % major == 0: cv2.putText(c, str(y), (2, Y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1)
        cv2.imwrite(path, c, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return path


# ── check: the built course.json over the photo ───────────────────────────────────────────────
KCOL = {'green': (0, 0, 255), 'fringe': (0, 0, 160), 'tee': (255, 0, 255), 'fairway': (0, 255, 0), 'bunker': (0, 220, 255),
        'water': (255, 120, 0), 'pool': (255, 255, 0), 'building': (0, 140, 255), 'paved': (255, 0, 255), 'pad': (255, 255, 255),
        'course': (60, 160, 60)}


def draw_course(c, P, cj, labels=True, kinds=None, thick=1):
    R = lambda ring: np.array([P(*px(lng, lat)) for lng, lat in ring], np.int32)
    H, W = c.shape[:2]
    for i, f in enumerate(cj['features']):
        k = f['properties']['kind']; g = f['geometry']
        if kinds and k not in kinds: continue
        if k in KCOL:
            for poly in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
                for ring in poly: cv2.polylines(c, [R(ring)], True, KCOL[k], thick + (k in ('green', 'bunker')))
        elif k in ('cartpath', 'road', 'hedge', 'fence'):
            cv2.polylines(c, [R(g['coordinates'])], False, {'cartpath': (200, 200, 255), 'road': (40, 40, 40), 'hedge': (0, 90, 0), 'fence': (0, 0, 0)}[k], 2)
        elif k == 'mark':
            for ln in g['coordinates']: cv2.polylines(c, [R(ln)], False, (0, 255, 255), 1)
        elif k == 'tree':
            x, y = P(*px(*g['coordinates']))
            if not (0 <= x < W and 0 <= y < H): continue
            col = (0, 0, 255) if f['properties']['type'] == 'palm' else (0, 255, 255)
            cv2.circle(c, (x, y), max(int(f['properties']['r'] / MPP * (P(1, 0)[0] - P(0, 0)[0])), 4), col, 1)
            cv2.drawMarker(c, (x, y), col, cv2.MARKER_CROSS, 8, 1)
            if labels:
                cv2.putText(c, str(i), (x + 4, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 3)
                cv2.putText(c, str(i), (x + 4, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)


def check(x0, y0, x1, y1, scale, name, kinds=None):
    cj = json.load(open(os.path.join(ROOT, 'public', 'course3d', 'course.json')))
    ph = Photo(x0, y0, x1, y1)
    return ph.crop(x0, y0, x1, y1, scale, os.path.join(WORK, name + '.jpg'), draw=lambda c, P: draw_course(c, P, cj, kinds=kinds))


# ── shapes ─────────────────────────────────────────────────────────────────────────────────────
def rect(cx, cy, w, h, ang):
    """Rectangle ring (pixels): centre, width along the angle, height across it, angle in degrees
    (0 = pointing east, positive = turning toward the south on the photo, i.e. clockwise)."""
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    return [[cx + u * ca - v * sa, cy + u * sa + v * ca] for u, v in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]


def oval(cx, cy, rx, ry, ang=0, ex=2.0, n=48):
    a = math.radians(ang); out = []
    for i in range(n):
        t = 2 * math.pi * i / n; c, s = math.cos(t), math.sin(t)
        x = rx * math.copysign(abs(c) ** (2 / ex), c); y = ry * math.copysign(abs(s) ** (2 / ex), s)
        out.append([cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)])
    return out


def ring_of(sh):
    if 'rect' in sh: return rect(*sh['rect'])
    if 'oval' in sh: return oval(*sh['oval'])
    return sh['ring']


def court_lines(kind, cx, cy, ang, length_px=None):
    """Painted lines of a tennis or pickleball court as pixel segments. The court's long axis points
    along `ang` (degrees, as in rect); real dimensions, scaled by MPP (or by a measured length)."""
    L, Wd = (23.77, 10.97) if kind == 'tennis' else (13.41, 6.10)
    k = (length_px / L) if length_px else 1 / MPP                        # pixels per metre
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    P = lambda u, v: [cx + (u * ca - v * sa) * k, cy + (u * sa + v * ca) * k]
    S = lambda u1, v1, u2, v2: P(u1, v1) + P(u2, v2)
    h, w = L / 2, Wd / 2
    segs = [S(-h, -w, h, -w), S(-h, w, h, w), S(-h, -w, -h, w), S(h, -w, h, w)]
    if kind == 'tennis':
        s = 8.23 / 2
        segs += [S(-h, -s, h, -s), S(-h, s, h, s), S(-6.40, -s, -6.40, s), S(6.40, -s, 6.40, s), S(-6.40, 0, 6.40, 0)]
    else:
        segs += [S(-2.13, -w, -2.13, w), S(2.13, -w, 2.13, w), S(-h, 0, -2.13, 0), S(2.13, 0, h, 0)]
    return segs, S(0, -w - (0.91 if kind == 'tennis' else 0.3), 0, w + (0.91 if kind == 'tennis' else 0.3))    # lines, net


def stall_rows(rows):
    """Parking stall lines: each row gives its first and last painted line ([x1,y1,x2,y2]) and how
    many lines there are; the ones between are spaced evenly."""
    segs = []
    for r in rows:
        a, b, n = r['a'], r['b'], r['n']
        for i in range(n):
            t = i / (n - 1) if n > 1 else 0
            segs.append([a[j] + (b[j] - a[j]) * t for j in range(4)])
    return segs


# ── pave: pavement by colour ───────────────────────────────────────────────────────────────────
def pave():
    src = json.load(open(SRC))
    for pv in src.get('pave', []):
        roi = np.array(pv['roi'], float)
        x0, y0, x1, y1 = roi[:, 0].min() - 4, roi[:, 1].min() - 4, roi[:, 0].max() + 4, roi[:, 1].max() + 4
        ph = Photo(x0, y0, x1, y1); img = ph.img
        Q = lambda ring: np.array([ph.at(x, y) for x, y in ring], np.int32)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
        b, g, r = [img[..., i].astype(int) for i in range(3)]
        s, v = hsv[..., 1], hsv[..., 2]
        lit = (s < pv.get('sat', 50)) & (v > 115)                           # sunlit asphalt/concrete, painted lines, pale cars
        shade = (v <= 115) & (v > 25) & (b >= g - 2) & (s < 110)            # in shadow: grey-blue (grass in shadow is green)
        m = ((lit | shade) * 255).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        keep = np.zeros(m.shape, np.uint8); cv2.fillPoly(keep, [Q(pv['roi'])], 255)
        m &= keep
        for ring in pv.get('add', []): cv2.fillPoly(m, [Q(ring_of({'ring': ring}) if isinstance(ring, list) else ring_of(ring))], 255)
        for ring in pv.get('cut', []): cv2.fillPoly(m, [Q(ring_of({'ring': ring}) if isinstance(ring, list) else ring_of(ring))], 0)
        m &= keep
        px_m2 = (MPP / 2) ** 2
        # cars, dark roofs of cars and small shadow gaps are holes in the pavement: fill the small ones
        n, lab, st, _ = cv2.connectedComponentsWithStats(255 - m, 4)
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] * px_m2 < pv.get('fillHoles', 14): m[lab == i] = 255
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, 4)
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] * px_m2 < pv.get('minArea', 20): m[lab == i] = 0
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)
        m = cv2.GaussianBlur(m, (0, 0), 2.0); m = ((m > 127) * 255).astype(np.uint8)      # round off pixel steps
        cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        polys = []
        for i, c in enumerate(cs):
            if hier[0][i][3] != -1 or cv2.contourArea(c) * px_m2 < pv.get('minArea', 20): continue
            rings = [cv2.approxPolyDP(c, pv.get('tol', 1.6), True)[:, 0, :]]
            j = hier[0][i][2]
            while j != -1:
                if cv2.contourArea(cs[j]) * px_m2 >= pv.get('minIsland', 3): rings.append(cv2.approxPolyDP(cs[j], pv.get('tol', 1.6), True)[:, 0, :])
                j = hier[0][j][0]
            polys.append([[[round(ph.x0 + x / 2, 2), round(ph.y0 + y / 2, 2)] for x, y in rg] for rg in rings if len(rg) >= 3])
        json.dump(polys, open(os.path.join(WORK, f'pave_{pv["tag"]}.json'), 'w'))
        ov = img.copy(); ov[m > 0] = (ov[m > 0] * 0.55 + np.array([255, 0, 255]) * 0.45).astype(np.uint8)
        for poly in polys:
            for rg in poly: cv2.polylines(ov, [Q(rg)], True, (0, 255, 255), 1)
        cv2.polylines(ov, [Q(pv['roi'])], True, (255, 255, 255), 1)
        sc = min(1.0, 1500 / max(ov.shape[:2]))
        cv2.imwrite(os.path.join(WORK, f'pave_{pv["tag"]}.jpg'), cv2.resize(ov, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 88])
        print(pv['tag'], len(polys), 'polygons,', sum(len(p) - 1 for p in polys), 'islands,', sum(len(r) for p in polys for r in p), 'points,',
              round(sum(cv2.contourArea(np.array(p[0], np.float32)) for p in polys) * MPP ** 2), 'm2')


# ── add: pixels -> traced.json "grounds" ──────────────────────────────────────────────────────
def add():
    src = json.load(open(SRC)); d = json.load(open(TR))
    L = lambda ring: [list(ll(x, y)) for x, y in ring]
    g = {'paved': [], 'pads': [], 'lines': [], 'greens': [], 'bunkers': [], 'pools': [], 'fences': [], 'sheds': []}
    for pv in src.get('pave', []):
        for poly in json.load(open(os.path.join(WORK, f'pave_{pv["tag"]}.json'))):
            g['paved'].append({'tag': pv['tag'], 'c': pv.get('c', 'lot'), 'rings': [L(r) for r in poly]})
    for sh in src.get('paved', []):                                       # hand-traced pavement (c: lot / walk / brick ...)
        g['paved'].append({'tag': sh.get('tag', ''), 'c': sh.get('c', 'lot'), 'rings': [L(ring_of(sh))] + [L(h) for h in sh.get('holes', [])]})
    lines = {}
    def add_lines(tag, color, w, segs, minzoom=None):
        e = lines.setdefault((tag, color, w), {'tag': tag, 'color': color, 'w': w, 'lines': []})
        if minzoom: e['minzoom'] = minzoom
        e['lines'] += [[list(ll(s[0], s[1])), list(ll(s[2], s[3]))] for s in segs]
    for sh in src.get('pads', []):
        g['pads'].append({'tag': sh.get('tag', ''), 'color': sh['color'], 'o': sh.get('o', 1), 'ring': L(ring_of(sh))})
    for c in src.get('courts', []):                                       # {"kind","at":[cx,cy,ang],"color","len"?}
        k, (cx, cy, ang) = c['kind'], c['at']
        Lm, Wm = (23.77, 10.97) if k == 'tennis' else (13.41, 6.10)
        sc = (c['len'] / Lm) if c.get('len') else 1 / MPP
        g['pads'].append({'tag': k + ' court', 'color': c.get('color', '#3f6f9f'), 'o': 3, 'ring': L(rect(cx, cy, Lm * sc, Wm * sc, ang))})
        segs, net = court_lines(k, cx, cy, ang, c.get('len'))
        add_lines('court lines', '#ffffff', 0.06, segs)
        g['fences'].append({'tag': k + ' net', 'h': 0.95 if k == 'tennis' else 0.88, 'color': '#20242a', 'post': 0, 'line': [list(ll(net[0], net[1])), list(ll(net[2], net[3]))]})
    for ln in src.get('lines', []):
        segs = stall_rows(ln['rows']) if 'rows' in ln else ln['segs']
        add_lines(ln.get('tag', ''), ln.get('color', '#ffffff'), ln.get('w', 0.1), segs, ln.get('minzoom'))
    g['lines'] = list(lines.values())
    for sh in src.get('greens', []): g['greens'].append({'tag': sh.get('tag', ''), 'ring': L(ring_of(sh))})
    for sh in src.get('bunkers', []): g['bunkers'].append({'tag': sh.get('tag', ''), 'ring': L(ring_of(sh))})
    for sh in src.get('pools', []): g['pools'].append({'tag': sh.get('tag', ''), 'ring': L(ring_of(sh))})
    for sh in src.get('fences', []):
        g['fences'].append({'tag': sh.get('tag', ''), 'h': sh.get('h', 3.0), 'color': sh.get('color', '#1d2b22'), 'post': sh.get('post', 3.0),
                            'line': L(sh['line'])})
    for sh in src.get('sheds', []):                                       # small buildings the LiDAR missed: simple hip/gable/flat roofs
        g['sheds'].append({'tag': sh.get('tag', ''), 'ring': L(ring_of(sh)), 'h': sh['h'], 'eave': sh.get('eave', sh['h']),
                           'roof': sh.get('roof', '#b9b4aa'), 'rt': sh.get('rt', 's')})
    for sh in src.get('lawns', []):                                       # mowed lawn between buildings (build.py clips it to the
        x0, y0, x1, y1 = sh['box'] if 'box' in sh else (None,) * 4        # club, minus the course turf and water)
        g.setdefault('lawns', []).append({'tag': sh.get('tag', ''),
                                          'ring': L([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] if 'box' in sh else ring_of(sh))})
    d['grounds'] = {k: v for k, v in g.items() if v}
    if 'noTrees' in src: d['grounds']['noTrees'] = [L(ring_of(sh)) for sh in src['noTrees']]
    json.dump(d, open(TR, 'w'), indent=1)
    print('traced.json grounds:', {k: len(v) for k, v in d['grounds'].items()})


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] in ('crop', 'check'):
        x0, y0, x1, y1 = map(float, a[1:5]); sc = float(a[5]) if len(a) > 5 else 3.0; name = a[6] if len(a) > 6 else 'ground_' + a[0]
        if a[0] == 'crop': print(Photo(x0, y0, x1, y1).crop(x0, y0, x1, y1, sc, os.path.join(WORK, name + '.jpg')))
        else: print(check(x0, y0, x1, y1, sc, name, kinds=set(a[7].split(',')) if len(a) > 7 else None))
    elif a[0] == 'pave': pave()
    elif a[0] == 'add': add()
