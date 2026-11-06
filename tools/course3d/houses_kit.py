"""Club housing from imagery: the condos and homes inside Miles Grant that OpenStreetMap lacks.

Run from the repo root with tools/course3d/.venv/bin/python.

  overview          Whole-club photo with OSM buildings (yellow), roads (white), the course outline
                    (green), the club perimeter (magenta) and detected houses (cyan) drawn on it ->
                    tools/course3d/.work/club_overview.jpg (grid labels are full-res pixel coords).
  zoom X0 Y0 X1 Y1  Close-up of that pixel box with the same overlays -> .work/club_zoom.jpg
  perimeter FILE    Store the club perimeter (JSON list of [x, y] in full-res pixels) in traced.json.
  detect            Find roofs inside the perimeter that no OSM building covers and store them in
                    traced.json under "houses" ({ring: [[lng, lat]...], roof: "#rrggbb", h: m}).
                    build.py turns them into buildings like the OSM ones.
  edit FILE         Apply {"remove": [[x, y], ...], "add": [[[x, y], ...], ...]} (full-res pixels):
                    remove deletes the detected house containing each point, add adds a footprint,
                    "rects": [[cx, cy, length, width, angle_deg], ...] adds rotated rectangles.
                    Run detect first, then edit (detect keeps hand-added houses).
"""
import json, math, os, sys
import numpy as np, cv2
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trace_kit as tk

HERE, WORK, CACHE = tk.HERE, tk.WORK, tk.CACHE
TRACED = os.path.join(HERE, 'traced.json')
S, W, N, E = 27.1425, -80.1872, 27.1545, -80.1700


class ClubImage(tk.HoleImage):
    def __init__(self):
        x0, y0 = tk.tile_xy(N, W); x1, y1 = tk.tile_xy(S, E)
        self.tx0, self.ty0 = int(x0), int(y0)
        cols, rows = int(x1) - self.tx0 + 1, int(y1) - self.ty0 + 1
        self.img = np.zeros((rows * 256, cols * 256, 3), np.uint8)
        import urllib.request
        for i in range(cols):
            for j in range(rows):
                tx, ty = self.tx0 + i, self.ty0 + j
                p = os.path.join(CACHE, f'{tk.Z}_{tx}_{ty}.jpg')
                if not os.path.exists(p):
                    u = f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{tk.Z}/{ty}/{tx}'
                    open(p, 'wb').write(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'mgg-trace'}), timeout=30).read())
                self.img[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = cv2.imread(p)
        self.mpp = 156543.03 * math.cos(math.radians(S)) / 2 ** tk.Z


def osm():
    els = json.load(open(os.path.join(CACHE, 'osm.json')))['elements']
    ring = lambda e: [(p['lon'], p['lat']) for p in e['geometry']]
    blds = [Polygon(ring(e)) for e in els if 'building' in e.get('tags', {}) and len(e['geometry']) >= 4]
    roads = [ring(e) for e in els if 'highway' in e.get('tags', {})]
    course = next(Polygon(ring(e)) for e in els if e.get('tags', {}).get('leisure') == 'golf_course')
    return blds, roads, course


def draw(ci, img, scale):
    traced = json.load(open(TRACED))
    blds, roads, course = osm()
    P = lambda lng, lat: tuple(int(v * scale) for v in ci.px(lat, lng))
    for r in roads:
        cv2.polylines(img, [np.array([P(*p) for p in r])], False, (255, 255, 255), 1)
    cv2.polylines(img, [np.array([P(*p) for p in course.exterior.coords])], True, (0, 220, 0), 2)
    for b in blds:
        cv2.polylines(img, [np.array([P(*p) for p in b.exterior.coords])], True, (0, 230, 255), 1)
    per = traced.get('clubPerimeter')
    if per: cv2.polylines(img, [np.array([P(*p) for p in per])], True, (255, 0, 255), 2)
    for h in traced.get('houses', []):
        cv2.polylines(img, [np.array([P(*p) for p in h["ring"]])], True, (255, 255, 0), 2)


def gridded(img, scale, x0, y0, step):
    H, W_ = img.shape[:2]
    for x in range((x0 // step + 1) * step, x0 + int(W_ / scale), step):
        X = int((x - x0) * scale); cv2.line(img, (X, 0), (X, H), (90, 90, 90), 1)
        cv2.putText(img, str(x), (X + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    for y in range((y0 // step + 1) * step, y0 + int(H / scale), step):
        Y = int((y - y0) * scale); cv2.line(img, (0, Y), (W_, Y), (90, 90, 90), 1)
        cv2.putText(img, str(y), (2, Y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)


def overview():
    ci = ClubImage()
    sc = 1600 / ci.img.shape[1]
    img = cv2.resize(ci.img, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    draw(ci, img, sc)
    gridded(img, sc, 0, 0, 500)
    p = os.path.join(WORK, 'club_overview.jpg'); cv2.imwrite(p, img, [cv2.IMWRITE_JPEG_QUALITY, 85]); print(p, ci.img.shape)


def zoom(x0, y0, x1, y1):
    ci = ClubImage()
    sc = min(2.0, 1400 / (x1 - x0))
    full = ci.img.copy()
    img = cv2.resize(full, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC) if sc != 1 else full
    draw(ci, img, sc)
    img = img[int(y0 * sc):int(y1 * sc), int(x0 * sc):int(x1 * sc)].copy()
    gridded(img, sc, x0, y0, 50 if x1 - x0 <= 900 else 100)
    p = os.path.join(WORK, 'club_zoom.jpg'); cv2.imwrite(p, img, [cv2.IMWRITE_JPEG_QUALITY, 88]); print(p)


def set_perimeter(path):
    ci = ClubImage()
    pts = json.load(open(path))
    traced = json.load(open(TRACED))
    traced['clubPerimeter'] = [[round(v, 7) for v in ci.ll(x, y)[::-1]] for x, y in pts]
    json.dump(traced, open(TRACED, 'w'), indent=1)
    print('perimeter', len(pts), 'points')


def roof_masks(img):
    """Roof candidates by color: terracotta tile, brown/grey shingle and light (white/tan) roofs."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
    b, g, r = [img[..., i].astype(int) for i in range(3)]
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # tile roofs: sunlit (pale salmon) and shaded (deep red) slopes both count
    terracotta = (r > g + 26) & (g >= b - 6) & (s > 48) & (v > 95)
    grass = (g > r + 4) & (g > b + 4)
    water = (b > r + 25) & (b > g)
    return terracotta, grass, water


def max_rect(a):
    """Largest all-ones axis-aligned rectangle in a 0/1 array: (area, x0, y0, x1, y1), end-exclusive."""
    H, W_ = a.shape
    hist = np.zeros(W_, int)
    best = (0, 0, 0, 0, 0)
    for y in range(H):
        hist = np.where(a[y] > 0, hist + 1, 0)
        stack = []
        for x in range(W_ + 1):
            h = hist[x] if x < W_ else 0
            start = x
            while stack and stack[-1][1] >= h:
                s, sh = stack.pop()
                if sh * (x - s) > best[0]:
                    best = (sh * (x - s), s, y - sh + 1, x, y + 1)
                start = s
            stack.append((start, h))
    return best


def main_angle(contour, img):
    """Building direction (degrees, mod 90) from the photo: roof edges, ridges and eaves inside the
    blob, as a magnitude-weighted histogram of image-gradient directions."""
    x, y, w, h = cv2.boundingRect(contour)
    x0, y0 = max(0, x - 4), max(0, y - 4)
    sub = cv2.cvtColor(img[y0:y + h + 4, x0:x + w + 4], cv2.COLOR_BGR2GRAY).astype(np.float32)
    m = np.zeros(sub.shape, np.uint8)
    cv2.drawContours(m, [contour - [x0, y0]], -1, 1, -1)
    m = cv2.dilate(m, np.ones((7, 7), np.uint8)) > 0
    gx, gy = cv2.Sobel(sub, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(sub, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)[m]
    ang = (np.degrees(np.arctan2(gy, gx))[m] + 90) % 90          # edge direction, folded to 0..90
    hist = np.bincount(np.round(ang).astype(int) % 90, weights=mag, minlength=90)
    hist = sum(np.roll(hist, k) * wt for k, wt in ((-2, .25), (-1, .6), (0, 1), (1, .6), (2, .25)))
    return float(np.argmax(hist))


def rectangles(contour, mpp, img, min_m2=22):
    """Split a roof blob into rectangles along the building's direction, so each part gets a hip roof.
    Narrow strips left between staggered units are dropped (under 3 m)."""
    ang = main_angle(contour, img)
    pts = contour.reshape(-1, 2).astype(np.float32)
    cx, cy = pts.mean(0)
    Rm = cv2.getRotationMatrix2D((float(cx), float(cy)), ang, 1.0)          # building edges -> axes
    rp = cv2.transform(pts[None], Rm)[0]
    x0, y0 = rp.min(0) - 3
    w, h = (rp.max(0) - rp.min(0) + 7).astype(int)
    full = np.zeros((h, w), np.uint8)
    cv2.fillPoly(full, [np.round(rp - [x0, y0]).astype(np.int32)], 1)
    rem, total, out = full.copy(), full.sum(), []
    Ri = cv2.invertAffineTransform(Rm)
    while rem.sum() > 0.03 * total:
        a, bx0, by0, bx1, by1 = max_rect(rem)
        if a * mpp * mpp < min_m2 * 0.4:
            break
        rem[by0:by1, bx0:bx1] = 0
        if min(bx1 - bx0, by1 - by0) * mpp < 3.0 or (bx1 - bx0) * (by1 - by0) * mpp * mpp < min_m2:
            continue
        corners = np.array([[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]], np.float32) + [x0, y0]
        out.append(cv2.transform(corners[None], Ri)[0].tolist())
    return out


def detect():
    ci = ClubImage()
    traced = json.load(open(TRACED))
    per = Polygon(traced['clubPerimeter'])
    blds, roads, course = osm()
    img = ci.img
    terr, grass, water = roof_masks(img)
    # inside the perimeter, outside the course and away from OSM buildings
    mask = np.zeros(img.shape[:2], np.uint8)
    cv2.fillPoly(mask, [np.array([ci.px(lat, lng) for lng, lat in per.exterior.coords], np.int32)], 1)
    taken = np.zeros_like(mask)
    for bp in blds:
        cv2.fillPoly(taken, [np.array([ci.px(lat, lng) for lng, lat in bp.exterior.coords], np.int32)], 1)
    taken = cv2.dilate(taken, np.ones((5, 5), np.uint8))
    cv2.fillPoly(taken, [np.array([ci.px(lat, lng) for lng, lat in course.buffer(-1 / 111320).exterior.coords], np.int32)], 1)
    m = (terr & (mask > 0) & (taken == 0)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    houses = []
    for c in cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
        area = cv2.contourArea(c) * ci.mpp ** 2
        if area < 30:            # sheds, umbrellas, cars
            continue
        for rect in rectangles(c, ci.mpp, img):
            ring = [[round(v, 7) for v in ci.ll(float(x), float(y))[::-1]] for x, y in rect]
            ring.append(ring[0])
            houses.append({'ring': ring, 'h': 7.5, 'src': 'tile'})   # the club condos are two-story
    keep = [h for h in traced.get('houses', []) if h.get('src') != 'tile']
    traced['houses'] = keep + houses
    json.dump(traced, open(TRACED, 'w'), indent=1)
    print('houses', len(houses), 'detected,', len(keep), 'hand-added kept')


def edit(path):
    ci = ClubImage()
    ed = json.load(open(path))
    traced = json.load(open(TRACED))
    hs = traced.get('houses', [])
    for x, y in ed.get('remove', []):
        lat, lng = ci.ll(x, y)
        hs = [h for h in hs if not Polygon(h['ring']).contains(Point(lng, lat))]
    for cx, cy, L, W, a in ed.get('rects', []):          # rotated rectangle: center, length, width, angle
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        ed.setdefault('add', []).append([[cx + u * ca - v * sa, cy + u * sa + v * ca]
                                         for u, v in ((-L / 2, -W / 2), (L / 2, -W / 2), (L / 2, W / 2), (-L / 2, W / 2))])
    for pts in ed.get('add', []):
        ring = [[round(v, 7) for v in ci.ll(x, y)[::-1]] for x, y in pts]
        ring.append(ring[0])
        hs.append({'ring': ring, 'h': 5.5, 'src': 'hand'})
    traced['houses'] = hs
    json.dump(traced, open(TRACED, 'w'), indent=1)
    print('houses now', len(hs))


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'overview': overview()
    elif cmd == 'zoom': zoom(*map(int, args))
    elif cmd == 'perimeter': set_perimeter(args[0])
    elif cmd == 'detect': detect()
    elif cmd == 'edit': edit(args[0])
