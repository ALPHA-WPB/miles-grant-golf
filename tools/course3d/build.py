"""Build public/course3d/course.json for the illustrated 3D map.

Sources: OpenStreetMap (course outline, buildings, roads, pools, water), Esri World
Imagery (bunkers and trees, detected by color), tools/course3d/traced.json (greens and
fairways traced by hand), and the hole/tee coordinates in src/App.jsx (tee boxes).

Run from the repo root with numpy, opencv-python-headless, shapely and tifffile installed:
    python tools/course3d/build.py
Downloads are cached in tools/course3d/.cache (git-ignored).
"""
import json, math, os, re, urllib.parse, urllib.request
import numpy as np, cv2
from shapely.geometry import Polygon, LineString, MultiLineString, Point, mapping, shape
from shapely.ops import unary_union, nearest_points, transform as shp_transform

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, 'tools', 'course3d')
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(ROOT, 'public', 'course3d', 'course.json')
Z = 19
UA = {'User-Agent': 'miles-grant-golf-course3d'}
os.makedirs(CACHE, exist_ok=True)

def get(url, path, data=None):
    if not os.path.exists(path) or os.path.getsize(path) == 0:     # an empty file is a failed earlier download
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            body = urllib.request.urlopen(req, timeout=120).read()
        except Exception:
            # the macOS system Python (LibreSSL 2.8) can't complete a TLS handshake with some servers
            # (e.g. overpass-api.de); curl can
            import subprocess
            cmd = ['curl', '-sS', '-f', '--max-time', '180', '-A', UA.get('User-Agent', 'mgg-course3d')]
            if data is not None: cmd += ['--data-binary', '@-']
            body = subprocess.run(cmd + [url], input=data, capture_output=True, check=True).stdout
        open(path, 'wb').write(body)
    return path

# ── Hole data from the app ───────────────────────────────────────────────
src = open(os.path.join(ROOT, 'src', 'App.jsx')).read()
HOLES = {}
for m in re.finditer(r'number:\s*(\d+),.*?tees:\s*\{(.*?)\},\s*green:\s*\{\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)', src, re.S):
    tees = [(float(a), float(b)) for a, b in re.findall(r'lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)', m.group(2))]
    HOLES[int(m.group(1))] = {'tees': tees, 'green': (float(m.group(3)), float(m.group(4)))}

traced = json.load(open(os.path.join(HERE, 'traced.json')))

# ── OpenStreetMap ────────────────────────────────────────────────────────
q = '''[out:json][timeout:80];(way["leisure"="golf_course"](27.140,-80.192,27.158,-80.165);
way["building"](27.141,-80.190,27.156,-80.167);way["highway"](27.141,-80.190,27.156,-80.167);
way["natural"="water"](27.141,-80.190,27.156,-80.167);way["leisure"="swimming_pool"](27.141,-80.190,27.156,-80.167););out geom;'''
osm = json.load(open(get('https://overpass-api.de/api/interpreter', os.path.join(CACHE, 'osm.json'),
                         urllib.parse.urlencode({'data': q}).encode())))['elements']
ring = lambda e: [(p['lon'], p['lat']) for p in e['geometry']]
course_el = next(e for e in osm if e.get('tags', {}).get('leisure') == 'golf_course')
course = Polygon(ring(course_el))

# ── Imagery helpers ──────────────────────────────────────────────────────
def tile_xy(lat, lng):
    n = 2 ** Z
    return (lng + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n

def tile_xy_z(lat, lng, z):
    n = 2 ** z
    return (lng + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n

class Region:
    def __init__(self, s, w, n, e):
        x0, y0 = tile_xy(n, w); x1, y1 = tile_xy(s, e)
        self.tx0, self.ty0 = int(x0), int(y0)
        cols, rows = int(x1) - self.tx0 + 1, int(y1) - self.ty0 + 1
        self.img = np.zeros((rows * 256, cols * 256, 3), np.uint8)
        for i in range(cols):
            for j in range(rows):
                tx, ty = self.tx0 + i, self.ty0 + j
                p = get(f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}',
                        os.path.join(CACHE, f'{Z}_{tx}_{ty}.jpg'))
                self.img[j*256:(j+1)*256, i*256:(i+1)*256] = cv2.imread(p)
        self.mpp = 156543.03 * math.cos(math.radians((s + n) / 2)) / 2 ** Z
    def px(self, lng, lat):
        x, y = tile_xy(lat, lng)
        return (x - self.tx0) * 256, (y - self.ty0) * 256
    def ll(self, px, py):
        n = 2 ** Z; x = px / 256 + self.tx0; y = py / 256 + self.ty0
        return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    def fill(self, mask, coords, val=255):
        cv2.fillPoly(mask, [np.array([self.px(*c) for c in coords], np.int32)], val)

def chaikin(pts, it=2):
    for _ in range(it):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            out += [(0.75*a[0]+0.25*b[0], 0.75*a[1]+0.25*b[1]), (0.25*a[0]+0.75*b[0], 0.25*a[1]+0.75*b[1])]
        pts = out
    return pts

def detect(region):
    im = region.img; H, W = im.shape[:2]
    mask = np.zeros((H, W), np.uint8); blocked = np.zeros((H, W), np.uint8)
    region.fill(mask, list(course.exterior.coords))
    for e in osm:
        t = e.get('tags', {})
        if 'building' in t or t.get('leisure') == 'swimming_pool':
            region.fill(blocked, ring(e))
        if t.get('highway') in ('residential', 'service', 'tertiary'):
            cv2.polylines(blocked, [np.array([region.px(*c) for c in ring(e)], np.int32)], False, 255, 18)
    paths = np.zeros((H, W), np.uint8)
    for e in osm:
        if e.get('tags', {}).get('highway') in ('footway', 'path', 'cycleway'):
            cv2.polylines(paths, [np.array([region.px(*c) for c in ring(e)], np.int32)], False, 255, 14)
    blocked = cv2.dilate(blocked, np.ones((15, 15), np.uint8))
    ok = (mask > 0) & (blocked == 0)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(int)
    b, g, r = [im[..., i].astype(int) for i in range(3)]
    s, v = hsv[..., 1], hsv[..., 2]
    mpp = region.mpp

    ok_sand = ok & (paths == 0)
    strong = ok_sand & (v > 165) & (s < 70) & (r > b + 12) & (r >= g - 5)
    weak = ok_sand & (v > 138) & (s < 62) & (r > b + 15) & (r >= g - 5)      # sand in partial shade
    sand = (strong | weak).astype(np.uint8) * 255
    sand = cv2.morphologyEx(sand, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    sand = cv2.morphologyEx(sand, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    bunkers = []
    for c in cv2.findContours(sand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
        area = cv2.contourArea(c) * mpp * mpp
        (_, _), (rw, rh), _ = cv2.minAreaRect(c)
        aspect = max(rw, rh) / max(min(rw, rh), 1)
        if area < 12 or aspect > 3.5:                            # specks and cart paths
            continue
        blob = np.zeros(sand.shape, np.uint8); cv2.drawContours(blob, [c], -1, 1, -1)
        if (strong & (blob > 0)).sum() < 0.3 * blob.sum():
            # mostly shaded sand: only accept a compact, bunker-shaped patch away from greens
            solidity = cv2.contourArea(c) / max(cv2.contourArea(cv2.convexHull(c)), 1)
            cx, cy = c.reshape(-1, 2).mean(0)
            on_green = any(Polygon(gr).contains(Point(*region.ll(cx, cy))) for t in traced['holes'].values() for gr in t.get('greens', []))
            if area < 15 or aspect > 2.5 or solidity < 0.88 or on_green:
                continue
        c = cv2.approxPolyDP(c, 1.5, True).reshape(-1, 2)
        if len(c) < 3: continue
        pts = chaikin([tuple(p) for p in c])
        bunkers.append(Polygon([region.ll(x, y) for x, y in pts]).buffer(0))

    # Trees: canopy is mid-dark and textured; shadows are near-black and smooth (and fall
    # north of each tree in this imagery), so they are excluded rather than mistaken for trees.
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(float)
    m = cv2.blur(gray, (7, 7)); sd = np.sqrt(np.maximum(cv2.blur(gray * gray, (7, 7)) - m * m, 0))
    tblocked = blocked > 0
    near_shadow = cv2.dilate((v < 30).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    canopy = ((v >= 32) & (v <= 88) & (sd >= 9) & (g >= r) & ~tblocked & ~(near_shadow & (v < 40))).astype(np.uint8) * 255
    raw_canopy = cv2.morphologyEx(canopy, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    canopy = cv2.morphologyEx(canopy, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    canopy = cv2.morphologyEx(canopy, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lbl, stats, cent = cv2.connectedComponentsWithStats(canopy)
    dt = cv2.distanceTransform(canopy, cv2.DIST_L2, 5)
    found = []
    for i in range(1, n):
        x0, y0, w, h = stats[i, :4]
        comp = lbl[y0:y0 + h, x0:x0 + w] == i
        area = stats[i, cv2.CC_STAT_AREA] * mpp * mpp
        sub = dt[y0:y0 + h, x0:x0 + w] * comp
        if area < 7 or sub.max() * mpp < 1.0:          # specks and shadow-edge slivers
            continue
        if area < 60:                                   # one tree: palms have star-shaped crowns
            rc = ((raw_canopy[y0:y0 + h, x0:x0 + w] > 0) & comp).astype(np.uint8)
            cs, _ = cv2.findContours(rc, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            sol = 1.0
            if cs:
                c = max(cs, key=cv2.contourArea)
                sol = cv2.contourArea(c) / max(cv2.contourArea(cv2.convexHull(c)), 1)
            rr = math.sqrt(area / math.pi)
            palm = area < 18 or sol < 0.78
            found.append((cent[i][0], cent[i][1], 1.6 if palm else rr * 0.85, 'palm' if palm else 'oak'))
            continue
        pk = (sub == cv2.dilate(sub, np.ones((15, 15), np.uint8))) & (sub * mpp >= 2.0)
        ys, xs = np.nonzero(pk)
        acc = []
        for d, x, y in sorted(zip(sub[ys, xs], xs, ys), reverse=True):   # big canopies: a few wide trees
            rr = min(float(d) * mpp, 13.0)
            if any(math.hypot(x - ax, y - ay) * mpp < 0.9 * (rr + ar) for ax, ay, ar in acc):
                continue
            acc.append((x, y, rr))
        found += [(x0 + x, y0 + y, rr, 'oak') for x, y, rr in acc]
    # Drop "trees" that are really another tree's shadow: darker than a canopy and lying just
    # north of a tree (the sun is to the south in this imagery, so shadows fall north)
    def mean_v(x, y, rr):
        rp = max(2, int(rr / mpp * 0.7)); x, y = int(x), int(y)
        patch = v[max(0, y - rp):y + rp + 1, max(0, x - rp):x + rp + 1]
        return float(patch.mean()) if patch.size else 0.0
    vals = [mean_v(x, y, rr) for x, y, rr, _ in found]
    keep = []
    for i, (x, y, rr, kind) in enumerate(found):
        shadow = False
        for j, (sx, sy, sr, _) in enumerate(found):
            if j == i or sr < rr * 0.8:
                continue
            north = (sy - y) * mpp                      # meters this candidate sits north of tree j
            if 0.3 * sr < north < sr + rr + 2.4 * sr and abs(x - sx) * mpp < max(sr, 3) and vals[i] < vals[j] - 4:
                shadow = True
                break
        if not shadow:
            keep.append((x, y, rr, kind))
    found = keep
    # Palm crowns are small and green, so what gets found is often the crown's SHADOW, which lies
    # north of the tree. Follow the thin trunk shadow south to where it ends: that is the base.
    def snap_palm(x, y):
        xi, yi = int(round(x)), int(round(y)); cx = xi; end = None; gap = 0; started = False
        for dy in range(0, 110):
            row = yi + dy
            if row >= H or cx < 10 or cx >= W - 10: break
            seg = v[row, cx - 3:cx + 4]; j = int(np.argmin(seg))
            wide = int((v[row, cx - 9:cx + 10] < 72).sum())
            if not started:
                # step south through the wide crown shadow until it narrows to the trunk shadow
                if seg[j] < 72 and wide <= 6:
                    started = True; cx = cx - 3 + j; end = row
                elif dy > 18 or seg[j] >= 72:
                    if dy > 18 or wide == 0: break
                continue
            if seg[j] < 72 and wide <= 7:
                cx = cx - 3 + j; end = row; gap = 0
            else:
                gap += 1
                if gap > 2: break
        if started and end is not None and end - yi >= 8:
            return float(cx), float(end + 2), True
        return x, y, False
    snapped = []; nmoved = 0
    for x, y, rr, kind in found:
        if kind == 'palm':
            x, y, moved = snap_palm(x, y); nmoved += moved
        elif rr < 3.2:
            # a small "oak" with a thin trunk shadow running south of it is really a palm's crown shadow
            x2, y2, moved = snap_palm(x, y)
            if moved:
                x, y, rr, kind = x2, y2, 1.9, 'palm'; nmoved += 1
        snapped.append((x, y, rr, kind))
    found = snapped
    print('palms moved from crown shadow to trunk base:', nmoved, 'of', sum(1 for f in found if f[3] == 'palm'))
    out = []
    for x, y, rr, kind in found:
        lng, lat = region.ll(float(x), float(y))
        jitter = (int(x) * 7 + int(y) * 3) % 3
        out.append({'lng': round(lng, 7), 'lat': round(lat, 7), 'r': round(float(rr), 1), 'type': kind,
                    'h': round(7.0 + jitter * 0.8 if kind == 'palm' else min(3.5 + rr * 0.9, 12.0), 1)})
    return bunkers, out

# ── Assemble ─────────────────────────────────────────────────────────────
feats = []
def cart_ribbon(line, w):
    kk = math.cos(math.radians(27.148))
    m = LineString([(x * 111320 * kk, y * 111320) for x, y in line]).buffer(w / 2, 6, join_style=1)
    return shp_transform(lambda x, y, z=None: (x / (111320 * kk), y / 111320), m)

def add(geom, _prec=7, **props):
    if geom.is_empty: return
    g = mapping(geom)
    def rnd(o):
        return [rnd(x) for x in o] if isinstance(o, (list, tuple)) and not isinstance(o[0], float) else [round(o[0], _prec), round(o[1], _prec)]
    g = {'type': g['type'], 'coordinates': rnd(g['coordinates'])}
    feats.append({'type': 'Feature', 'properties': props, 'geometry': g})

# Built-up parts inside the course outline (clubhouse grounds): the aerial photo shows there instead of drawn turf
turf = course
for pa in traced.get('photoAreas', []):
    turf = turf.difference(Polygon(pa['ring']).buffer(0))
add(turf, kind='course')
# Miles Grant itself: the Miles Grant Rd / Cove Rd loop plus the SE Landing Way riverside condos and
# marina (owner, 2026-11-15). Nothing outside it is modeled; the aerial photo shows the rest.
club = unary_union([Polygon(traced['clubPerimeter'])] + [Polygon(r) for r in traced.get('clubExtra', [])]).buffer(0)
for e in osm:
    t = e.get('tags', {})
    if t.get('leisure') == 'swimming_pool' and len(e['geometry']) >= 4 and club.contains(Polygon(ring(e)).centroid):
        add(Polygon(ring(e)), kind='pool')
# Buildings: every roof inside Miles Grant from the owner's 2018-19 LiDAR (lidar_buildings.py), with
# its measured height and a 1 m roof height grid the app turns into the real roof shape. This
# replaces OpenStreetMap's partial buildings and the photo-traced condo boxes (traced.json houses).
LIDAR_B = json.load(open(os.path.join(HERE, 'lidar', 'buildings.json')))['buildings']

def shed_building(s):
    """A small building the laser missed (hidden under tree canopy), traced on the photo as a
    rectangle (traced.json sheds: ring of 4 corners, eave/ridge heights above the ground, ground
    level in m). Returns it in the LiDAR buildings format with a plain gable roof along its long side."""
    import base64
    MPD_ = 111320.0
    ring = [tuple(p) for p in s['ring'][:4]]
    alng = sum(p[0] for p in ring) / 4; alat = sum(p[1] for p in ring) / 4
    kk = math.cos(math.radians(alat))
    en = [((lng - alng) * MPD_ * kk, (lat - alat) * MPD_) for lng, lat in ring]
    d01, d12 = math.dist(en[0], en[1]), math.dist(en[1], en[2])
    a, b = (en[0], en[1]) if d01 >= d12 else (en[1], en[2])
    th = math.atan2(b[1] - a[1], b[0] - a[0]); ct, st_ = math.cos(th), math.sin(th)
    uv = [(e * ct + n * st_, -e * st_ + n * ct) for e, n in en]
    umin, umax = min(p[0] for p in uv), max(p[0] for p in uv); vmin, vmax = min(p[1] for p in uv), max(p[1] for p in uv)
    u0, v0 = umin - 0.3, vmin - 0.3
    gw = int(math.ceil((umax + 0.3 - u0))) + 1; gh = int(math.ceil((vmax + 0.3 - v0))) + 1
    half = (vmax - vmin) / 2; vc = (vmin + vmax) / 2
    nodes = np.array([[s['eave'] + (s['ridge'] - s['eave']) * max(0.0, 1 - abs(v0 + j - vc) / half) for i in range(gw)] for j in range(gh)])
    hmin = math.floor(float(nodes.min()) * 10) / 10; sc = max((float(nodes.max()) - hmin) / 255, 0.01)
    q = np.clip(np.round((nodes - hmin) / sc), 0, 255).astype(np.uint8)
    ll = lambda u, v: [round(alng + (u * ct - v * st_) / (MPD_ * kk), 7), round(alat + (u * st_ + v * ct) / MPD_, 7)]
    box = lambda m: [ll(umin + m, vmin + m), ll(umax - m, vmin + m), ll(umax - m, vmax - m), ll(umin + m, vmax - m), ll(umin + m, vmin + m)]
    o = ll(u0, v0)
    return {'ring': box(0), 'walls': box(0.4), 'ground': s['ground'], 'top': s['ridge'], 'roof': s.get('roof'), 'rt': s.get('rt'),
            'grid': {'lng': o[0], 'lat': o[1], 'th': round(th, 4), 'step': 1.0, 'w': gw, 'h': gh, 'min': hmin, 'sc': round(sc, 4),
                     'd': base64.b64encode(q.tobytes()).decode()}}

LIDAR_B = LIDAR_B + [shed_building(s) for s in traced.get('sheds', [])]
for i, b in enumerate(LIDAR_B):
    if not club.intersects(Polygon(b['ring'])): continue
    extra = {k: b[k] for k in ('roof', 'rt') if b.get(k)}      # traced sheds carry their own roof colour
    add(Polygon(b['ring']), kind='building', h=round(b['top'], 1), c=i % 5, g=b['grid'], wr=b['walls'], gnd=b['ground'], **extra)
BRIDGES = json.load(open(os.path.join(HERE, 'lidar', 'bridges.json')))
for b in BRIDGES:
    add(Polygon(b['ring']), kind='bridge', deck=b['deck'])
# Lakes: shorelines from the hydro-flattened LiDAR terrain (lidar_water.py); the river is left to
# the aerial photo
lakes = []
for w in json.load(open(os.path.join(HERE, 'lidar', 'water.json'))):
    wp = Polygon(w['ring'])
    if club.contains(wp.centroid) or course.contains(wp.centroid):
        lakes.append(wp.simplify(0.4 / 111320).buffer(0))
# plus water traced from the photo with water_kit.py (canal and river edge behind 17 green, pond SE of the club)
for wr in traced.get('water', []):
    lakes.append(Polygon(wr).buffer(0))
merged = unary_union(lakes) if lakes else Polygon()
for wp in getattr(merged, 'geoms', [merged]):
    if not wp.is_empty: add(wp, kind='water')

M_PER_DEG = 111320
def meters_poly(lng, lat, coords_m):
    k = math.cos(math.radians(lat))
    return Polygon([(lng + x / (M_PER_DEG * k), lat + y / M_PER_DEG) for x, y in coords_m])

def spine_poly(spine):
    lat0 = spine[0][1]; k = math.cos(math.radians(lat0))
    to_m = lambda lng, lat: ((lng - spine[0][0]) * M_PER_DEG * k, (lat - lat0) * M_PER_DEG)
    parts = [Point(to_m(lng, lat)).buffer(w / 2, 24) for lng, lat, w in spine]
    hull = unary_union([unary_union([parts[i], parts[i + 1]]).convex_hull for i in range(len(parts) - 1)])
    return Polygon([(spine[0][0] + x / (M_PER_DEG * k), lat0 + y / M_PER_DEG) for x, y in hull.exterior.coords])

def mow_stripes(fw, tee, green, width=7.0):
    """Alternate mowing bands across the fairway, square to the line of play."""
    lat0, lng0 = tee; k = math.cos(math.radians(lat0))
    to_m = lambda lng, lat: ((lng - lng0) * M_PER_DEG * k, (lat - lat0) * M_PER_DEG)
    gx, gy = to_m(green[1], green[0]); L = math.hypot(gx, gy); ux, uy = gx / L, gy / L
    fm = Polygon([to_m(x, y) for x, y in fw.exterior.coords])
    bands = []
    for i in range(-10, int(L / width) + 10, 2):
        a, b = i * width, (i + 1) * width
        bands.append(Polygon([(ux*a - uy*200, uy*a + ux*200), (ux*b - uy*200, uy*b + ux*200),
                              (ux*b + uy*200, uy*b - ux*200), (ux*a + uy*200, uy*a - ux*200)]))
    st = unary_union(bands).intersection(fm)
    back = lambda g: Polygon([(lng0 + x / (M_PER_DEG * k), lat0 + y / M_PER_DEG) for x, y in g.exterior.coords])
    from shapely.geometry import MultiPolygon
    return MultiPolygon([back(g) for g in getattr(st, 'geoms', [st]) if g.geom_type == 'Polygon' and not g.is_empty])

regions = [Region(*reg['bbox']) for reg in traced['regions']]
detected = [detect(rg) for rg in regions]

# Roof colors: the median color of each house's footprint in the imagery (edges trimmed); the photo
# covers all of Miles Grant (the detection regions stop at the course)
cs_, cw_, cn_, ce_ = club.bounds[1], club.bounds[0], club.bounds[3], club.bounds[2]
roof_regions = [Region(cs_ - 0.0003, cw_ - 0.0003, cn_ + 0.0003, ce_ + 0.0003)]
for f in feats:
    if f['properties']['kind'] != 'building':
        continue
    ring_ll = f['geometry']['coordinates'][0]
    if f['properties'].get('roof'): continue
    for rg in roof_regions:
        pts = np.array([rg.px(lng, lat) for lng, lat in ring_ll], np.int32)
        H, W = rg.img.shape[:2]
        if pts[:, 0].min() < 0 or pts[:, 1].min() < 0 or pts[:, 0].max() >= W or pts[:, 1].max() >= H:
            continue
        m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [pts], 1)
        m = cv2.erode(m, np.ones((5, 5), np.uint8))
        if m.sum() < 30:
            continue
        b, g, r = [int(np.median(rg.img[..., i][m > 0])) for i in range(3)]
        f['properties']['roof'] = '#%02x%02x%02x' % (r, g, b)
        # roof type from its colour: t = clay tile (orange/red/brown), m = white or metal, s = shingle
        f['properties']['rt'] = 'm' if min(r, g, b) > 150 and max(r, g, b) - min(r, g, b) < 40 else 't' if r > b + 28 and r >= g else 's'
        break
not_sand = [Point(lng, lat).buffer(rm / M_PER_DEG) for lng, lat, rm in traced.get('bunkerEdits', {}).get('remove', [])]
detected = [([b for b in bs if not any(z.intersects(b) for z in not_sand)], ts) for bs, ts in detected]
all_bunkers = [b for bs, _ in detected for b in bs]
traced_holes = sorted(int(k) for k in traced['holes'])
playing = []   # fairways, greens and tees: kept clear of trees
tees_greens = []
for num, t in traced['holes'].items():
    for g in t.get('greens', []):
        gp = Polygon(g)
        k = math.cos(math.radians(gp.centroid.y))
        sand = unary_union([b.buffer(0.8 / M_PER_DEG) for b in all_bunkers if b.distance(gp) < 10 / M_PER_DEG] or [Polygon()])
        # cut tiers around the green: a ~4.5 m first-cut collar, then the 1.2 m fringe, then the green
        add(gp.buffer(4.5 / M_PER_DEG / k, 32).difference(sand), kind='collar', hole=int(num))
        add(gp.buffer(1.2 / M_PER_DEG / k, 24).difference(sand), kind='fringe', hole=int(num))
        gp = gp.difference(sand)
        add(gp, kind='green', hole=int(num))
        playing.append(gp.buffer(1.6 / M_PER_DEG / k))
        tees_greens.append(gp)
    h = HOLES[int(num)]
    glat, glng = h['green']
    fws = [Polygon(f) for f in t.get('fairways', [])] + [spine_poly(s) for s in t.get('fairwaySpines', [])]
    for sp in t.get('fairwaySpines', []):     # fairway centerline: the fly-through walks along it
        add(LineString([(lng, lat) for lng, lat, _ in sp]), kind='spine', hole=int(num))
    for fw in fws:
        add(fw, kind='fairway', hole=int(num))
        playing.append(fw)
        add(mow_stripes(fw, h['tees'][1], h['green']), kind='stripe', hole=int(num))
    boxes = [Polygon(tp) for tp in t.get('tees', [])]   # traced tee boxes when we have them
    for lat, lng in ([] if boxes else h['tees']):
        k = math.cos(math.radians(lat))
        dx, dy = (glng - lng) * k, glat - lat
        ang = math.atan2(dy, dx)
        L2, W2 = 5.0, 3.6
        corners = [(-L2, -W2), (L2, -W2), (L2, W2), (-L2, W2)]
        rot = [(x * math.cos(ang) - y * math.sin(ang), x * math.sin(ang) + y * math.cos(ang)) for x, y in corners]
        boxes.append(meters_poly(lng, lat, rot).buffer(0.000008, 8))
    for b in getattr(unary_union(boxes), 'geoms', [unary_union(boxes)]):
        add(b, kind='tee', hole=int(num))
        playing.append(b)
        tees_greens.append(b)
    for cp in t.get('cartPaths', []):     # 2.6 m of paving on a 3.2 m edge, as true-width polygons (see the roads note)
        add(cart_ribbon(cp, 3.2), _prec=6, kind='cartedge', hole=int(num))
        add(cart_ribbon(cp, 2.6), _prec=6, kind='cartpath', hole=int(num))

# Rough outline round each whole hole (tees, fairway, green), drawn as a thin gold line in the app's
# zoomed-out view so every hole can be picked out. Worked in local metres, padded ~10 m and smoothed.
K_OUT = math.cos(math.radians(27.148))
to_m = lambda x, y, z=None: (x * M_PER_DEG * K_OUT, y * M_PER_DEG)
to_ll = lambda x, y, z=None: (x / (M_PER_DEG * K_OUT), y / M_PER_DEG)
for num in traced_holes:
    mine = lambda kinds: [shp_transform(to_m, shape(f['geometry'])) for f in feats
                          if f['properties'].get('hole') == num and f['properties']['kind'] in kinds]
    tees, play = mine(('tee',)), unary_union(mine(('collar', 'fairway')))    # the collar holds the green
    links = [LineString([t.centroid, nearest_points(t.centroid, play)[1]]).buffer(6) for t in tees if not play.is_empty]
    out = unary_union(tees + [play] + links).buffer(16, 24).buffer(-6, 24).simplify(1.5)
    if out.geom_type == 'MultiPolygon':
        out = max(out.geoms, key=lambda g: g.area)
    add(shp_transform(to_ll, Polygon(out.exterior)), _prec=6, kind='outline', hole=num)

# the perimeter road (Miles Grant Road loop): black asphalt with a yellow dashed centre line in the app
# Roads and cart paths are shipped as true-width POLYGONS, not lines: a line's width is set in screen
# pixels, and on the 3D terrain the map redraws it per terrain tile, so a line road swelled and
# shrank (and spilled onto the course) as the camera flew along it.
K_RD = math.cos(math.radians(27.148))
def ribbon(line, w, cap=1):
    """lng/lat centre line -> polygon w metres wide"""
    m = LineString([(x * M_PER_DEG * K_RD, y * M_PER_DEG) for x, y in line]).buffer(w / 2, 6, cap_style=cap, join_style=1)
    return shp_transform(lambda x, y, z=None: (x / (M_PER_DEG * K_RD), y / M_PER_DEG), m)
def dashes(line, w=0.3, on=3.0, gap=9.0):
    from shapely.ops import substring
    m = LineString([(x * M_PER_DEG * K_RD, y * M_PER_DEG) for x, y in line])
    parts = [substring(m, d, min(d + on, m.length)).buffer(w / 2, 1, cap_style=2, join_style=2) for d in np.arange(0, m.length, on + gap)]
    return shp_transform(lambda x, y, z=None: (x / (M_PER_DEG * K_RD), y / M_PER_DEG), unary_union(parts))
shoulders = unary_union([ribbon(rd['line'], rd.get('w', 6.2) * 1.12) for rd in traced.get('roads', [])])
asphalt = unary_union([ribbon(rd['line'], rd.get('w', 6.2)) for rd in traced.get('roads', [])])
add(shoulders, _prec=6, kind='roadcase')
add(asphalt, _prec=6, kind='road')
for rd in traced.get('roads', []):
    if rd.get('centerLine'):
        add(dashes(rd['line']), kind='roadline')

# paved or rock ground traced on the photo (service driveways, yards, rock gardens): either a polygon
# (ring) or a centre line with a width in metres; s = 'drive' (grey paving) or 'rock'
for pv in traced.get('paved', []):
    if 'ring' in pv:
        g = Polygon(pv['ring'])
    else:
        kk = math.cos(math.radians(pv['line'][0][1]))
        g = shp_transform(lambda x, y, z=None: (x / (M_PER_DEG * kk), y / M_PER_DEG),
                          LineString([(x * M_PER_DEG * kk, y * M_PER_DEG) for x, y in pv['line']]).buffer(pv['w'] / 2, 8, cap_style=2))
    add(g, _prec=6, kind='paved', s=pv.get('s', 'drive'))

# hand-traced hedge lines (thick shrub rows, e.g. along back yards): drawn as a solid leafy wall
for hg in traced.get('hedges', []):
    add(LineString(hg['line']), kind='hedge', h=hg.get('h', 3.8), w=hg.get('w', 3.0))

roofs_u = unary_union([Polygon(b['ring']) for b in LIDAR_B])        # no detected 'trees' on roofs or in the lakes
lakes_u = unary_union([Polygon(f['geometry']['coordinates'][0]) for f in feats if f['properties']['kind'] == 'water'] or [Polygon()])

# Hand-traced built-up ground (ground_kit.py add -> traced.json grounds): asphalt lanes and parking
# lots (c 'lot') or concrete walks (c 'walk'), mowed lawns between the condos (clipped to Miles Grant,
# minus the course turf and the lakes), and painted lines such as parking stalls
GR = traced.get('grounds', {})
by_c = {}
for pv in GR.get('paved', []):
    by_c.setdefault(pv.get('c', 'lot'), []).append(Polygon(pv['rings'][0], pv['rings'][1:]).buffer(0))
asphalt_u = Polygon()
for c, ps in by_c.items():
    u = unary_union(ps)
    add(u, _prec=6, kind='paved', s='asphalt' if c == 'lot' else c)
    if c == 'lot': asphalt_u = u
if GR.get('lawns'):
    lawn = unary_union([Polygon(l['ring']) for l in GR['lawns']]).intersection(club).difference(course).difference(lakes_u)
    lawn = lawn.difference(unary_union([Polygon(r) for l in GR['lawns'] for r in l.get('cut', [])] + [Polygon(pa['ring']) for pa in traced.get('photoAreas', [])]))
    add(lawn.simplify(0.3 / M_PER_DEG), _prec=6, kind='lawn')
for pl in GR.get('pools', []):          # pools missing from OpenStreetMap, traced on the photo
    add(Polygon(pl['ring']), _prec=7, kind='pool')
for ln in GR.get('lines', []):
    add(MultiLineString(ln['lines']), _prec=7, kind='mark', w=ln['w'], color=ln['color'], **({'minzoom': ln['minzoom']} if ln.get('minzoom') else {}))
for bunkers, trees in detected:
    for b in bunkers:
        add(b, kind='bunker')
    near = course.buffer(80 / M_PER_DEG)
    clear = unary_union(playing).buffer(-1.0 / M_PER_DEG)
    tg = unary_union(tees_greens)
    edits = traced.get('treeEdits', {})
    gone = [Point(lng, lat).buffer(rm / M_PER_DEG) for lng, lat, rm in edits.get('remove', [])]
    # hand-placed trees (verified on the photo): [lng, lat, r, kind, tag?, height?]; they skip the
    # automatic filters, since real trees do stand in fairways
    trees += [{'lng': a[0], 'lat': a[1], 'r': a[2], 'type': a[3], 'manual': True,
               'h': a[5] if len(a) > 5 else (7.5 if a[3] == 'palm' else min(3.5 + a[2] * 0.9, 12.0))}
              for a in edits.get('add', [])]
    manual_pts = [Point(t['lng'], t['lat']) for t in trees if t.get('manual')]
    trees = [t for t in trees if t.get('manual') or not any(m.distance(Point(t['lng'], t['lat'])) < 3.0 / M_PER_DEG for m in manual_pts)]
    for tr in trees:
        pt = Point(tr['lng'], tr['lat'])
        overhangs = tg.distance(pt) < 0.6 * tr['r'] / M_PER_DEG    # canopy would hang over a tee or green
        if not tr.get('manual') and (not near.contains(pt) or clear.contains(pt) or overhangs or any(z.contains(pt) for z in gone)
                                     or roofs_u.contains(pt) or lakes_u.contains(pt) or asphalt_u.contains(pt)):
            continue
        feats.append({'type': 'Feature', 'properties': {'kind': 'tree', 'r': tr['r'], 'h': tr['h'], 'type': tr['type']},
                      'geometry': {'type': 'Point', 'coordinates': [tr['lng'], tr['lat']]}})

# Bunker shading, drawn over the sand so each trap reads as a sunken bowl (as on Google's 3D photo):
# the south lip shades the sand just inside it, and the north face, which faces the sun, is lit.
# Each is a crescent: the bunker minus itself shifted a little. Stacked steps give a soft gradient.
from shapely.affinity import translate
SUN = (-0.158, 0.987)   # direction shadows fall (north, a little west), as for the house shadows
def crescent(b, d):     # d > 0: band along the sunny (south) edge; d < 0: along the north edge
    k = math.cos(math.radians(b.centroid.y))
    return b.difference(translate(b, SUN[0] * d / (M_PER_DEG * k), SUN[1] * d / M_PER_DEG)).simplify(0.12 / M_PER_DEG)
for kind, steps in (('bshade', (0.6, 1.4)), ('blit', (-0.9,))):
    for i, d in enumerate(steps):      # 10 cm precision is plenty for shading and keeps the file small
        add(unary_union([crescent(b, d) for b in all_bunkers]), _prec=6, kind=kind, s=i + 1)

# ── Terrain: USGS 3DEP bare-earth LiDAR (about 1 m), heights relative to the course ───────
# Bunkers are deepened a little where the LiDAR smooths them, with a slight lip, so they read
# as real hollows. The result becomes terrarium-encoded elevation tiles the map drapes over.
import tifffile, shutil
TS, TW, TN, TE = 27.1395, -80.1915, 27.1560, -80.1650
EXAGGERATION = 1   # true scale: the course is nearly flat, and that is how it should look
dw = int((TE - TW) * M_PER_DEG * math.cos(math.radians((TS + TN) / 2)))
dh = int((TN - TS) * M_PER_DEG)
MARTIN = os.path.join(HERE, 'lidar', 'terrain_utm17_meters.tif')
if os.path.exists(MARTIN):
    # Martin County QL1 LiDAR bare earth (2018-19, 0.762 m, UTM 17N / NAVD88 m), supplied by the
    # owner; resampled bilinearly onto this lat/lng grid
    import pyproj
    src = tifffile.TiffFile(MARTIN).pages[0]
    mdem = src.asarray().astype(np.float32)
    mdem[mdem < -9000] = np.nan
    sx = src.tags['ModelPixelScaleTag'].value[0]
    e0, n0 = src.tags['ModelTiepointTag'].value[3:5]
    jj, ii = np.mgrid[0:dh, 0:dw]
    lon = TW + (ii + 0.5) / dw * (TE - TW)
    lat = TN - (jj + 0.5) / dh * (TN - TS)
    east, north = pyproj.Transformer.from_crs('EPSG:4326', 'EPSG:26917', always_xy=True).transform(lon, lat)
    mapx = ((east - e0) / sx - 0.5).astype(np.float32)
    mapy = ((n0 - north) / sx - 0.5).astype(np.float32)
    dem = cv2.remap(np.nan_to_num(mdem, nan=-9999), mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=-9999)
    dem_source = 'Martin County QL1 LiDAR 2018-19 (0.76 m)'
else:
    dem_path = get('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?'
                   + urllib.parse.urlencode({'bbox': f'{TW},{TS},{TE},{TN}', 'bboxSR': 4326, 'imageSR': 4326, 'size': f'{dw},{dh}',
                                             'format': 'tiff', 'pixelType': 'F32', 'interpolation': 'RSP_BilinearInterpolation', 'f': 'image'}),
                   os.path.join(CACHE, f'dem_{dw}x{dh}.tif'))
    dem = tifffile.imread(dem_path).astype(np.float32)
    dem_source = 'USGS 3DEP (1 m)'
dem[(dem < -50) | (dem > 200)] = np.nan
dpx = lambda lng, lat: ((lng - TW) / (TE - TW) * dw - 0.5, (TN - lat) / (TN - TS) * dh - 0.5)
cmask = np.zeros((dh, dw), np.uint8)
cv2.fillPoly(cmask, [np.array([dpx(*c) for c in course.exterior.coords], np.int32)], 1)
base = float(np.nanmedian(dem[cmask > 0]))
rel = np.clip(np.nan_to_num(dem - base, nan=0.0), -4.6, 6.0)   # the lakes sit ~2 m below their banks (real); the river is capped just below them
rel = cv2.GaussianBlur(rel, (0, 0), 0.8 if 'Martin' in dem_source else 2.0)   # remove speckle, keep green and bunker shapes
for b in all_bunkers:
    for poly in getattr(b, 'geoms', [b]):
        m = np.zeros((dh, dw), np.uint8)
        cv2.fillPoly(m, [np.array([dpx(*c) for c in poly.exterior.coords], np.int32)], 1)
        if m.sum() < 4:
            continue
        ring = (cv2.dilate(m, np.ones((3, 3), np.uint8)) > 0) & (m == 0)
        rim = float(np.median(rel[ring]))
        inside = cv2.distanceTransform(m, cv2.DIST_L2, 3)
        # the Martin LiDAR already shows bunkers as hollows: only make sure each is at least a bit below its rim
        floor = rim - (np.minimum(0.35, 0.1 + 0.08 * inside) if 'Martin' in dem_source else np.minimum(0.75, 0.2 + 0.15 * inside))
        rel = np.where(m > 0, np.minimum(rel, floor), rel)
        outside = cv2.distanceTransform(1 - m, cv2.DIST_L2, 3)
        lip = (outside > 0) & (outside <= 2.2)
        if 'Martin' not in dem_source:
            rel[lip] += 0.12 * (1 - outside[lip] / 2.2)
        zone = cv2.dilate(m, np.ones((7, 7), np.uint8)) > 0
        rel = np.where(zone, cv2.GaussianBlur(rel, (0, 0), 0.8), rel)
# fade to zero at the edge of the data so there is no cliff where it stops
edge = np.minimum.reduce([np.arange(dw)[None, :].repeat(dh, 0), np.arange(dw)[::-1][None, :].repeat(dh, 0),
                          np.arange(dh)[:, None].repeat(dw, 1), np.arange(dh)[::-1][:, None].repeat(dw, 1)])
rel *= np.clip(edge / 120.0, 0, 1)

def elev(lng, lat):
    x, y = dpx(lng, lat)
    x0, y0 = int(math.floor(x)), int(math.floor(y))
    if x0 < 0 or y0 < 0 or x0 >= dw - 1 or y0 >= dh - 1:
        return 0.0
    fx, fy = x - x0, y - y0
    return float(rel[y0, x0] * (1 - fx) * (1 - fy) + rel[y0, x0 + 1] * fx * (1 - fy) + rel[y0 + 1, x0] * (1 - fx) * fy + rel[y0 + 1, x0 + 1] * fx * fy)

DEM_DIR = os.path.join(ROOT, 'public', 'course3d', 'dem')
shutil.rmtree(DEM_DIR, ignore_errors=True)
ntiles = 0
for z in range(13, 18):
    n = 2 ** z
    x0t, y0t = [int(v) for v in tile_xy_z(TN, TW, z)]
    x1t, y1t = [int(v) for v in tile_xy_z(TS, TE, z)]
    for tx in range(x0t, x1t + 1):
        for ty in range(y0t, y1t + 1):
            ii, jj = np.meshgrid(np.arange(256) + 0.5, np.arange(256) + 0.5)
            lng = (tx + ii / 256) / n * 360 - 180
            lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (ty + jj / 256) / n))))
            px_ = (lng - TW) / (TE - TW) * dw - 0.5
            py_ = (TN - lat) / (TN - TS) * dh - 0.5
            vals = cv2.remap(rel, px_.astype(np.float32), py_.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            v = vals.astype(np.float64) + 32768.0
            r_ = np.floor(v / 256); g_ = np.floor(v) % 256; b_ = np.floor((v - np.floor(v)) * 256)
            img = np.dstack([b_, g_, r_]).astype(np.uint8)
            os.makedirs(os.path.join(DEM_DIR, str(z), str(tx)), exist_ok=True)
            cv2.imwrite(os.path.join(DEM_DIR, str(z), str(tx), f'{ty}.png'), img, [cv2.IMWRITE_PNG_COMPRESSION, 9])
            ntiles += 1

# ground height under every tree and house, for placing the 3D models on the terrain
for f in feats:
    pr = f['properties']
    if pr['kind'] == 'tree':
        pr['z'] = round(elev(*f['geometry']['coordinates']), 2)
    elif pr['kind'] == 'building':
        pr['z'] = round(pr.pop('gnd') - base, 2)          # the ground level its roof heights were measured from
    elif pr['kind'] == 'bridge':
        pr['z'] = round(pr.pop('deck') - base, 2)         # deck height
    elif pr['kind'] == 'hedge':
        pr['zs'] = [round(elev(lng, lat), 2) for lng, lat in f['geometry']['coordinates']]
terrain_meta = {'tiles': '/course3d/dem/{z}/{x}/{y}.png', 'minzoom': 13, 'maxzoom': 17,
                'bounds': [TW, TS, TE, TN], 'exaggeration': EXAGGERATION}
# compact 3 m height grid over the traced holes, so the app knows the ground height anywhere
import base64
gs, gw_, gn, ge = traced['regions'][0]['bbox'][0], traced['regions'][0]['bbox'][1], traced['regions'][0]['bbox'][2], traced['regions'][0]['bbox'][3]
for reg in traced['regions'][1:]:
    a, b_, c, d_ = reg['bbox']; gs, gw_, gn, ge = min(gs, a), min(gw_, b_), max(gn, c), max(ge, d_)
gs, gw_, gn, ge = gs - 0.001, gw_ - 0.001, gn + 0.001, ge + 0.001
gW = int((ge - gw_) * M_PER_DEG * math.cos(math.radians((gs + gn) / 2)) / 3) + 1
gH = int((gn - gs) * M_PER_DEG / 3) + 1
grid = np.array([[elev(gw_ + (ge - gw_) * i / (gW - 1), gn - (gn - gs) * j / (gH - 1)) for i in range(gW)] for j in range(gH)])
terrain_meta['grid'] = {'bounds': [gw_, gs, ge, gn], 'w': gW, 'h': gH,
                        'cm': base64.b64encode(np.round(grid * 100).astype('<i2').tobytes()).decode()}
print('terrain:', dem_source, '| base', round(base, 2), 'm, relief', round(float(rel.min()), 2), 'to', round(float(rel.max()), 2), 'm,', ntiles, 'tiles')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({'type': 'FeatureCollection', 'holes': traced_holes, 'terrain': terrain_meta, 'features': feats}, open(OUT, 'w'), separators=(',', ':'))
kinds = {}
for f in feats: kinds[f['properties']['kind']] = kinds.get(f['properties']['kind'], 0) + 1
print(OUT, os.path.getsize(OUT) // 1024, 'KB', kinds)
