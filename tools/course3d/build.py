"""Build public/course3d/course.json for the illustrated 3D map.

Sources: OpenStreetMap (course outline, buildings, roads, pools, water), Esri World
Imagery (bunkers and trees, detected by color), tools/course3d/traced.json (greens and
fairways traced by hand), and the hole/tee coordinates in src/App.jsx (tee boxes).

Run from the repo root with numpy, opencv-python-headless and shapely installed:
    python tools/course3d/build.py
Downloads are cached in tools/course3d/.cache (git-ignored).
"""
import json, math, os, re, urllib.parse, urllib.request
import numpy as np, cv2
from shapely.geometry import Polygon, LineString, Point, mapping
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, 'tools', 'course3d')
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(ROOT, 'public', 'course3d', 'course.json')
Z = 19
UA = {'User-Agent': 'miles-grant-golf-course3d'}
os.makedirs(CACHE, exist_ok=True)

def get(url, path, data=None):
    if not os.path.exists(path):
        req = urllib.request.Request(url, data=data, headers=UA)
        open(path, 'wb').write(urllib.request.urlopen(req, timeout=120).read())
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
    blocked = cv2.dilate(blocked, np.ones((15, 15), np.uint8))
    ok = (mask > 0) & (blocked == 0)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(int)
    b, g, r = [im[..., i].astype(int) for i in range(3)]
    s, v = hsv[..., 1], hsv[..., 2]
    mpp = region.mpp

    sand = (ok & (v > 165) & (s < 70) & (r >= g - 5) & (r > b + 12)).astype(np.uint8) * 255
    sand = cv2.morphologyEx(sand, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    sand = cv2.morphologyEx(sand, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    bunkers = []
    for c in cv2.findContours(sand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
        area = cv2.contourArea(c) * mpp * mpp
        (_, _), (rw, rh), _ = cv2.minAreaRect(c)
        if area < 12 or max(rw, rh) / max(min(rw, rh), 1) > 5:   # specks and cart paths
            continue
        c = cv2.approxPolyDP(c, 1.5, True).reshape(-1, 2)
        if len(c) < 3: continue
        pts = chaikin([tuple(p) for p in c])
        bunkers.append(Polygon([region.ll(x, y) for x, y in pts]).buffer(0))

    dark = ((blocked == 0) & (v < 95) & (g >= b)).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    dt = cv2.distanceTransform(dark, cv2.DIST_L2, 5)
    peaks = (dt == cv2.dilate(dt, np.ones((9, 9), np.uint8))) & (dt * mpp >= 1.1)
    ys, xs = np.nonzero(peaks)
    cand = sorted(zip(dt[ys, xs], xs, ys), reverse=True)
    trees = []
    for d, x, y in cand:
        rm = float(min(d * mpp * 0.95, 9.0)); x, y = int(x), int(y)
        if any(math.hypot(x - tx, y - ty) * mpp < 0.8 * (rm + tr) for tr, tx, ty in trees):
            continue
        trees.append((rm, x, y))
    out = []
    for rm, x, y in trees:
        lng, lat = region.ll(x, y)
        palm = rm < 2.3
        out.append({'lng': round(lng, 7), 'lat': round(lat, 7), 'r': round(max(rm, 1.4), 1),
                    'type': 'palm' if palm else 'oak',
                    'h': round(9 + (x * 7 + y * 3) % 3 if palm else min(5 + rm * 1.6, 17), 1)})
    return bunkers, out

# ── Assemble ─────────────────────────────────────────────────────────────
feats = []
def add(geom, **props):
    if geom.is_empty: return
    g = mapping(geom)
    def rnd(o):
        return [rnd(x) for x in o] if isinstance(o, (list, tuple)) and not isinstance(o[0], float) else [round(o[0], 7), round(o[1], 7)]
    g = {'type': g['type'], 'coordinates': rnd(g['coordinates'])}
    feats.append({'type': 'Feature', 'properties': props, 'geometry': g})

add(course, kind='course')
for e in osm:
    t = e.get('tags', {})
    if 'building' in t and len(e['geometry']) >= 4:
        p = Polygon(ring(e))
        area = p.area * (111320 ** 2) * math.cos(math.radians(27.15))
        h = 9 if t.get('building') in ('apartments', 'commercial') or area > 500 else 5.5
        add(p, kind='building', h=h, c=e['id'] % 4)
    elif t.get('leisure') == 'swimming_pool' and len(e['geometry']) >= 4:
        add(Polygon(ring(e)), kind='pool')
    elif t.get('natural') == 'water' and len(e['geometry']) >= 4:
        add(Polygon(ring(e)), kind='water')
    elif t.get('highway') in ('residential', 'tertiary', 'service', 'unclassified', 'primary', 'secondary'):
        add(LineString(ring(e)), kind='road', cls=t['highway'])

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

traced_holes = sorted(int(k) for k in traced['holes'])
for num, t in traced['holes'].items():
    for g in t.get('greens', []):
        gp = Polygon(g)
        k = math.cos(math.radians(gp.centroid.y))
        add(gp.buffer(1.6 / M_PER_DEG / k, 24), kind='fringe', hole=int(num))
        add(gp, kind='green', hole=int(num))
    h = HOLES[int(num)]
    glat, glng = h['green']
    fws = [Polygon(f) for f in t.get('fairways', [])] + [spine_poly(s) for s in t.get('fairwaySpines', [])]
    for fw in fws:
        add(fw, kind='fairway', hole=int(num))
        add(mow_stripes(fw, h['tees'][1], h['green']), kind='stripe', hole=int(num))
    boxes = []
    for lat, lng in h['tees']:
        k = math.cos(math.radians(lat))
        dx, dy = (glng - lng) * k, glat - lat
        ang = math.atan2(dy, dx)
        L2, W2 = 5.0, 3.6
        corners = [(-L2, -W2), (L2, -W2), (L2, W2), (-L2, W2)]
        rot = [(x * math.cos(ang) - y * math.sin(ang), x * math.sin(ang) + y * math.cos(ang)) for x, y in corners]
        boxes.append(meters_poly(lng, lat, rot).buffer(0.000008, 8))
    for b in getattr(unary_union(boxes), 'geoms', [unary_union(boxes)]):
        add(b, kind='tee', hole=int(num))

for reg in traced['regions']:
    region = Region(*reg['bbox'])
    bunkers, trees = detect(region)
    for b in bunkers:
        add(b, kind='bunker')
    near = course.buffer(80 / M_PER_DEG)
    for tr in trees:
        if not near.contains(Point(tr['lng'], tr['lat'])):
            continue
        feats.append({'type': 'Feature', 'properties': {'kind': 'tree', 'r': tr['r'], 'h': tr['h'], 'type': tr['type']},
                      'geometry': {'type': 'Point', 'coordinates': [tr['lng'], tr['lat']]}})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({'type': 'FeatureCollection', 'holes': traced_holes, 'features': feats}, open(OUT, 'w'), separators=(',', ':'))
kinds = {}
for f in feats: kinds[f['properties']['kind']] = kinds.get(f['properties']['kind'], 0) + 1
print(OUT, os.path.getsize(OUT) // 1024, 'KB', kinds)
