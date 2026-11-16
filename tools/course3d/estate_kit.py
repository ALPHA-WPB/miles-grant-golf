"""Residential areas inside Miles Grant (condo blocks, villa streets): lanes, parking lots, driveways,
pools, stall lines and lawns, found semi-automatically and reviewed on the photo.

Run from the repo root with tools/course3d/.venv/bin/python.

  detect [AREA ...]   for each area in AREAS: OSM lane centrelines (buffered to their width) plus
                      asphalt found by colour within 30 m of them (roofs and the shadows the roofs cast
                      north are masked out), light concrete driveways/walks touching that paving,
                      pools by their cyan colour, and painted stall lines grouped into rows (rows are
                      filled in evenly under parked cars). -> .work/estate_<AREA>.json + .work/estate_<AREA>.jpg
  add                 every .work/estate_*.json -> grounds_px.json entries tagged 'auto:<AREA>' (replacing
                      earlier auto entries; hand-traced entries are left alone). Then run ground_kit.py add.

Coordinates: whole-course zoom-19 pixels (as ground_kit.py). Per-area corrections live in AREAS:
  cut / add  : pixel rings removed from / added to the asphalt; roi: extra search rings (no OSM lanes there)
  walkCut    : rings where light paving is not kept (white roofs the LiDAR outline misses, etc.)
"""
import json, math, os, sys
import numpy as np, cv2
from shapely.geometry import Polygon, LineString, Point, MultiPolygon, box as sbox
from shapely.ops import unary_union, transform as shp_transform

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ground_kit as g

HERE, WORK = g.HERE, g.WORK
SRC = os.path.join(HERE, 'grounds_px.json')
M = 1 / g.MPP                     # course pixels per metre
SKIP_NAMES = {'Miles Grant Road', 'Southeast Miles Grant Road'}   # the perimeter road and its divided entrance: drawn as roads already

# box = x0, y0, x1, y1 in course pixels. Areas are cut where they meet the clubhouse grounds (item P2).
AREAS = {
    'nw-rows':    {'box': [2470, 1270, 3290, 1660], 'lane_w': 6.0,
                   'cut': [[[2795, 1345], [2870, 1345], [2870, 1425], [2795, 1425]], [[2965, 1515], [3005, 1515], [3005, 1580], [2965, 1580]],
                           [[3160, 1515], [3240, 1515], [3240, 1570], [3160, 1570]]],   # tree shade on lawns
                   'roi': [[[2480, 1380], [2560, 1340], [2700, 1300], [2850, 1300], [3000, 1310], [3200, 1290], [3290, 1300],
                            [3290, 1560], [3100, 1560], [2900, 1640], [2700, 1660], [2480, 1660]]]},
    'central':    {'box': [1050, 1850, 3150, 2780], 'lane_w': 6.0,
                   'cut': [[[1300, 2050], [1385, 2040], [1420, 2200], [1340, 2215]],            # fifth tennis court
                           [[1440, 2040], [1500, 2040], [1500, 2080], [1440, 2080]], [[1160, 2300], [1260, 2300], [1260, 2350], [1160, 2350]],
                           [[1262, 2395], [1340, 2395], [1340, 2485], [1262, 2485]], [[1235, 2558], [1320, 2558], [1320, 2615], [1235, 2615]],
                           [[1365, 2350], [1445, 2350], [1445, 2430], [1365, 2430]], [[1715, 2315], [1755, 2315], [1755, 2385], [1715, 2385]],
                           [[2675, 1985], [2725, 1985], [2725, 2035], [2675, 2035]]],                # tree shade on lawns
                   'lawnCut': [[[1100, 2175], [1375, 2050], [1415, 2200], [1320, 2265], [1310, 2345], [1180, 2345], [1150, 2300]]]},   # tennis courts, patio
    'south-row':  {'box': [2480, 2450, 4380, 3320], 'lane_w': 6.0, 'laneOnly': True,
                   'poolCut': [[[3478, 2750], [3512, 2750], [3512, 2784], [3478, 2784]]]},   # dark blue patch north of the pool house: not clearly a pool
    'southwest':  {'box': [920, 2900, 2280, 3920], 'lane_w': 6.5, 'laneOnly': True,
                   'poolCut': [[[1675, 3211], [1715, 3211], [1715, 3251], [1675, 3251]], [[1804, 3190], [1844, 3190], [1844, 3230], [1804, 3230]]]},   # pools under screen cages
    'lake-villas': {'box': [4430, 560, 5220, 1760], 'lane_w': 5.5, 'laneOnly': True},
    'landing':    {'box': [5180, 560, 6480, 2180], 'lane_w': 6.5,
                   'lanes': [{'circle': [5655, 1212, 50], 'w': 7.0},                              # roundabout (not in OSM)
                             {'line': [[5627.5, 1262], [5625, 1300], [5624, 1345], [5630, 1395], [5650, 1435], [5675, 1470], [5700, 1500]], 'w': 7.3}],
                   'cut': [[[5755, 1680], [5830, 1680], [5830, 1770], [5755, 1770]], [[5215, 2115], [5305, 2115], [5305, 2185], [5215, 2185]]],   # tree shade
                   'lawnNear': 25,                                                      # lawn only round the buildings: not the river edge or mangroves
                   'lawnCut': [[[5800, 1320], [5900, 1310], [5975, 1400], [5975, 1560], [5880, 1560], [5810, 1450]]]},   # marsh pond
}


def club_px():
    d = json.load(open(g.TR))
    P = lambda ring: Polygon([g.px(*q) for q in ring]).buffer(0)
    club = unary_union([P(d['clubPerimeter'])] + [P(r) for r in d.get('clubExtra', [])])
    photo = unary_union([P(pa['ring']) for pa in d.get('photoAreas', [])] or [Polygon()])
    return club, photo


def course_px():
    cj = json.load(open(os.path.join(g.ROOT, 'public', 'course3d', 'course.json')))
    out = {'course': [], 'water': [], 'pool': [], 'building': []}
    traced_pools = [Polygon(pl['ring']) for pl in json.load(open(g.TR)).get('grounds', {}).get('pools', [])]
    for f in cj['features']:
        k = f['properties']['kind']
        if k not in out: continue
        if k == 'pool' and any(tp.contains(Point(*f['geometry']['coordinates'][0][0])) or tp.buffer(1e-6).contains(Point(*f['geometry']['coordinates'][0][0])) for tp in traced_pools):
            continue                                    # our own traced pools from the last build: not 'already there'
        gm = f['geometry']
        for poly in ([gm['coordinates']] if gm['type'] == 'Polygon' else gm['coordinates']):
            out[k].append(Polygon([g.px(*q) for q in poly[0]], [[g.px(*q) for q in h] for h in poly[1:]]).buffer(0))
    return {k: unary_union(v) if v else Polygon() for k, v in out.items()}


def osm_lanes(club, photo, bx):
    osm = json.load(open(os.path.join(g.CACHE, 'osm.json')))
    lanes = []
    for e in osm['elements']:
        t = e.get('tags', {}); geo = e.get('geometry')
        if not geo or t.get('highway') not in ('residential', 'service', 'unclassified', 'living_street'): continue
        if t.get('name') in SKIP_NAMES: continue
        ls = LineString([g.px(q['lon'], q['lat']) for q in geo])
        ls = ls.intersection(club).intersection(bx).difference(photo)
        if ls.is_empty: continue
        lanes.append((ls, t.get('highway'), t.get('service')))
    return lanes


def to_mask(geom, ph, shape):
    m = np.zeros(shape, np.uint8)
    polys = [geom] if isinstance(geom, Polygon) else list(getattr(geom, 'geoms', []))
    for p in polys:
        if not isinstance(p, Polygon) or p.is_empty: continue
        cv2.fillPoly(m, [np.array([ph.at(x, y) for x, y in p.exterior.coords], np.int32)], 255)
        for h in p.interiors: cv2.fillPoly(m, [np.array([ph.at(x, y) for x, y in h.coords], np.int32)], 0)
    return m


def from_mask(m, ph, min_m2, tol_m=0.35):
    px_m2 = (g.MPP / 2) ** 2
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for i, c in enumerate(cs):
        if hier[0][i][3] != -1 or cv2.contourArea(c) * px_m2 < min_m2: continue
        C = lambda cc: [(ph.x0 + x / 2, ph.y0 + y / 2) for x, y in cc[:, 0, :]]
        holes = []; j = hier[0][i][2]
        while j != -1:
            if cv2.contourArea(cs[j]) * px_m2 >= 6 and len(cs[j]) >= 4: holes.append(C(cs[j]))
            j = hier[0][j][0]
        if len(c) < 4: continue
        p = Polygon(C(c), holes).buffer(0).simplify(tol_m * M)
        if not p.is_empty: out.append(p)
    return unary_union(out) if out else Polygon()


def fill_small_holes(m, max_m2, px_m2):
    n, lab, st, _ = cv2.connectedComponentsWithStats(255 - m, 4)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] * px_m2 < max_m2: m[lab == i] = 255
    return m


def drop_small(m, min_m2, px_m2):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 4)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] * px_m2 < min_m2: m[lab == i] = 0
    return m


def stall_lines(img, asph_m, ph):
    """Painted stall lines: thin bright strips 3.6-6.2 m long inside the asphalt, grouped into rows
    (same direction, midpoints on one line across them, about one stall apart); gaps of up to four
    stalls inside a row are filled evenly, so rows continue under parked cars."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY); hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    top = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    inner = cv2.erode(asph_m, np.ones((5, 5), np.uint8))
    m = ((top > 45) & (hsv[..., 1] < 70) & (gray > 140) & (inner > 0)).astype(np.uint8) * 255
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    mpp = g.MPP / 2; det = []
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 8: continue
        ys, xs = np.where(lab == i)
        (cx, cy), (w, h), ang = cv2.minAreaRect(np.column_stack([xs, ys]).astype(np.float32))
        L, W = max(w, h) * mpp, min(w, h) * mpp
        if not (3.6 <= L <= 6.2 and W <= 0.55 and len(xs) * mpp * mpp < L * 0.5): continue
        a = math.radians(ang if w >= h else ang + 90)
        det.append((cx, cy, math.cos(a), math.sin(a), max(w, h)))
    # group into rows
    used = [False] * len(det); rows = []
    for i, (cx, cy, dx, dy, L) in enumerate(det):
        if used[i]: continue
        grp = [i]; used[i] = True; changed = True
        while changed:
            changed = False
            for j, (cx2, cy2, dx2, dy2, L2) in enumerate(det):
                if used[j]: continue
                for k in grp:
                    ck = det[k]
                    if abs(ck[2] * dx2 + ck[3] * dy2) < math.cos(math.radians(10)): continue
                    ux, uy = -ck[3], ck[2]                        # along the row (across the lines)
                    t = (cx2 - ck[0]) * ux + (cy2 - ck[1]) * uy; q = (cx2 - ck[0]) * ck[2] + (cy2 - ck[1]) * ck[3]
                    if abs(q) < 0.9 / mpp and 1.8 / mpp < abs(t) < 3.6 * 4.2 / mpp:
                        grp.append(j); used[j] = True; changed = True; break
        rows.append(grp)
    segs = []
    for grp in rows:
        D = [det[k] for k in grp]
        if len(D) < 2:
            if len(D) == 1 and D[0][4] * mpp > 4.2:                 # a lone clear line: keep it as it is
                cx, cy, dx, dy, L = D[0]; segs.append((cx - dx * L / 2, cy - dy * L / 2, cx + dx * L / 2, cy + dy * L / 2))
            continue
        dx = np.median([d[2] if d[2] * D[0][2] + d[3] * D[0][3] > 0 else -d[2] for d in D])
        dy = np.median([d[3] if d[2] * D[0][2] + d[3] * D[0][3] > 0 else -d[3] for d in D]); nn = math.hypot(dx, dy); dx, dy = dx / nn, dy / nn
        ux, uy = -dy, dx
        c0 = np.mean([[d[0], d[1]] for d in D], 0)
        T = sorted(((d[0] - c0[0]) * ux + (d[1] - c0[1]) * uy) for d in D)
        q0 = float(np.median([(d[0] - c0[0]) * dx + (d[1] - c0[1]) * dy for d in D]))
        gaps = np.diff(T); base = [gp for gp in gaps if 2.3 / mpp <= gp <= 3.4 / mpp]
        s = float(np.median(base)) if base else None
        L = float(np.median([d[4] for d in D]))
        ts = [T[0]]
        for a, b in zip(T, T[1:]):
            k = round((b - a) / s) if s else 1
            if s and 2 <= k <= 5 and abs((b - a) / k - s) < 0.25 * s:
                ts += [a + (b - a) * i / k for i in range(1, k)]
            ts.append(b)
        for t in ts:
            cx, cy = c0[0] + ux * t + dx * q0, c0[1] + uy * t + dy * q0
            if inner[int(min(max(cy, 0), inner.shape[0] - 1)), int(min(max(cx, 0), inner.shape[1] - 1))] == 0: continue
            segs.append((cx - dx * L / 2, cy - dy * L / 2, cx + dx * L / 2, cy + dy * L / 2))
    return [[round(ph.x0 + a / 2, 1), round(ph.y0 + b / 2, 1), round(ph.x0 + c / 2, 1), round(ph.y0 + d / 2, 1)] for a, b, c, d in segs], len(det)


def detect(name):
    A = AREAS[name]; x0, y0, x1, y1 = A['box']; bx = sbox(x0, y0, x1, y1)
    club, photo = club_px(); C = course_px()
    src = json.load(open(SRC))
    hand = unary_union([Polygon(e['ring'], e.get('holes', [])).buffer(0) for e in src.get('paved', []) if not e.get('tag', '').startswith('auto:')] or [Polygon()])
    area = bx.intersection(club).difference(photo).difference(C['water']).difference(hand)
    lanes = osm_lanes(club, photo, bx)
    extra = []
    for ln in A.get('lanes', []):                       # hand-traced lanes OSM lacks: {'line': [...]} or {'circle': [cx, cy, r]}, w in metres
        if 'circle' in ln:
            cx, cy, r = ln['circle']; ls = LineString([(cx + r * math.cos(t), cy + r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 73)])
        else: ls = LineString(ln['line'])
        extra.append(ls.buffer(ln['w'] / 2 * M, 8))
    lane_geom = unary_union([ls.buffer((A['lane_w'] if hw != 'service' else 4.5) / 2 * M, 8) for ls, hw, sv in lanes] + extra or [Polygon()])
    roi = unary_union([lane_geom.buffer(24 * M)] + [Polygon(r) for r in A.get('roi', [])]).intersection(area)
    ph = g.Photo(x0, y0, x1, y1); img = ph.img; shape = img.shape[:2]
    px_m2 = (g.MPP / 2) ** 2
    sys.path.insert(0, os.path.dirname(__file__))
    I = img.astype(int); b, gg, r = I[..., 0], I[..., 1], I[..., 2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int); s, v = hsv[..., 1], hsv[..., 2]
    grey = (np.abs(gg - b) < 18) & (np.abs(gg - r) < 22) & (gg - b < 12)
    asph = ((grey & (v >= 25) & (v <= 150) & (s <= 60)) | ((b > gg + 8) & (v < 110) & (v > 15))).astype(np.uint8) * 255
    roofs = C['building']
    # roof shadows fall north (and a little west): sweep each roof up to 9 m north, 1.4 m west
    shade = unary_union([shp_transform(lambda X, Y, z=None, k=k: (X - 1.4 * M * k, Y - 9 * M * k), roofs) for k in np.linspace(0, 1, 7)])
    no = to_mask(roofs.buffer(0.5 * M).union(shade), ph, shape)
    keep = to_mask(roi, ph, shape)
    asph = cv2.morphologyEx(asph, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    asph = cv2.morphologyEx(asph, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    lane_m = to_mask(lane_geom.intersection(area), ph, shape)
    asph = ((asph > 0) & (keep > 0) & ((no == 0) | (lane_m > 0))).astype(np.uint8) * 255
    if A.get('laneOnly'): asph[:] = 0                # villa streets: no parking lots, the lane outline is enough
    for rg in A.get('cut', []): cv2.fillPoly(asph, [np.array([ph.at(*q) for q in rg], np.int32)], 0)
    asph = fill_small_holes(asph, 30, px_m2)
    asph = cv2.morphologyEx(asph, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2.2 * M * 2) | 1,) * 2))   # drop strips < ~2 m wide
    asph = drop_small(asph, 45, px_m2)
    asph = np.maximum(asph, lane_m)
    for rg in A.get('add', []): cv2.fillPoly(asph, [np.array([ph.at(*q) for q in rg], np.int32)], 255)
    asph = fill_small_holes(asph, 30, px_m2)
    asph = cv2.GaussianBlur(asph, (0, 0), 2.0); asph = ((asph > 127) * 255).astype(np.uint8)
    asph &= to_mask(area, ph, shape)
    asph_poly = from_mask(asph, ph, 25).difference(roofs)
    # light concrete (driveways, walks) touching the paving or the drawn perimeter road
    d = json.load(open(g.TR)); kk = 1
    road = unary_union([LineString([g.px(*q) for q in rd['line']]).buffer(rd.get('w', 6.2) / 2 * M, 8) for rd in d.get('roads', [])]).intersection(bx.buffer(50 * M))
    seed = asph_poly.union(road)
    lite = ((v >= 128) & (s <= 45) & (np.abs(gg - b) < 25)).astype(np.uint8) * 255
    lite = cv2.morphologyEx(lite, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    lite &= 255 - to_mask(roofs.buffer(1.0 * M), ph, shape)
    for rg in A.get('walkCut', []): cv2.fillPoly(lite, [np.array([ph.at(*q) for q in rg], np.int32)], 0)
    lite &= to_mask(area.intersection(seed.buffer(30 * M)).difference(road), ph, shape)
    lite = cv2.morphologyEx(lite, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    lite = drop_small(lite, 6, px_m2)
    walk = from_mask(lite, ph, 6, 0.25).difference(asph_poly).difference(roofs)
    walk = unary_union([p for p in getattr(walk, 'geoms', [walk]) if isinstance(p, Polygon) and p.buffer(1.8 * M).intersects(seed) and p.area / M ** 2 >= 6]
                       or [Polygon()])
    # pools: clear cyan water
    h_ = hsv[..., 0]
    pm = ((h_ >= 80) & (h_ <= 106) & (s > 60) & (v > 120)).astype(np.uint8) * 255
    pm = cv2.morphologyEx(pm, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)); pm &= to_mask(bx.intersection(club).difference(photo), ph, shape)
    big = drop_small(cv2.morphologyEx(pm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))), 350, px_m2)   # blue courts, not pools
    pm[big > 0] = 0
    courts = from_mask(cv2.dilate(big, np.ones((9, 9), np.uint8)), ph, 350, 0.5)
    pools = [p for p in getattr(from_mask(pm, ph, 10, 0.2), 'geoms', [from_mask(pm, ph, 10, 0.2)])
             if isinstance(p, Polygon) and not p.is_empty and not p.intersects(C['pool'].buffer(1 * M))
             and not roofs.contains(p.representative_point()) and not any(Polygon(r).contains(p.representative_point()) for r in A.get('poolCut', []))]          # pools under screen cages are hidden by the roof anyway
    segs, ndet = stall_lines(img, to_mask(asph_poly, ph, shape), ph)
    res = {'asphalt': poly_json(asph_poly), 'walk': poly_json(walk), 'pools': [list(map(list, p.exterior.coords)) for p in pools],
           'stalls': segs, 'courts': poly_json(courts)}
    if A.get('lawnNear'):
        near = unary_union([asph_poly, walk, roofs.intersection(bx)]).buffer(A['lawnNear'] * M, 8).buffer(-6 * M).intersection(bx)
        res['lawnRings'] = [list(map(list, p.simplify(1.5 * M).exterior.coords)) for p in getattr(near, 'geoms', [near]) if isinstance(p, Polygon) and p.area > 200 * M * M]
    json.dump(res, open(os.path.join(WORK, f'estate_{name}.json'), 'w'))
    # review image
    ov = img.copy()
    Q = lambda ring: np.array([ph.at(*q) for q in ring], np.int32)
    tint = to_mask(asph_poly, ph, shape) > 0; ov[tint] = (ov[tint] * 0.55 + np.array([255, 0, 255]) * 0.45).astype(np.uint8)
    wt = to_mask(walk, ph, shape) > 0; ov[wt] = (ov[wt] * 0.5 + np.array([0, 200, 255]) * 0.5).astype(np.uint8)
    for p in pools: cv2.polylines(ov, [Q(p.exterior.coords)], True, (255, 255, 0), 2)
    for sg in segs: cv2.line(ov, tuple(map(int, ph.at(sg[0], sg[1]))), tuple(map(int, ph.at(sg[2], sg[3]))), (0, 255, 255), 1)
    for ls, hw, sv in lanes:
        for part in getattr(ls, 'geoms', [ls]): cv2.polylines(ov, [Q(part.coords)], False, (255, 255, 255), 1)
    cv2.imwrite(os.path.join(WORK, f'estate_{name}_full.jpg'), ov, [cv2.IMWRITE_JPEG_QUALITY, 85])
    sc = min(1.0, 1800 / max(ov.shape[:2]))
    out = cv2.resize(ov, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    step = 50 if sc * 2 > 0.5 else 100
    for X in range((x0 // step + 1) * step, x1, step):
        P = int((X - ph.x0) * 2 * sc); cv2.line(out, (P, 0), (P, out.shape[0]), (200, 200, 200), 1)
        if X % 100 == 0: cv2.putText(out, str(X), (P + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
    for Y in range((y0 // step + 1) * step, y1, step):
        P = int((Y - ph.y0) * 2 * sc); cv2.line(out, (0, P), (out.shape[1], P), (200, 200, 200), 1)
        if Y % 100 == 0: cv2.putText(out, str(Y), (2, P - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
    cv2.imwrite(os.path.join(WORK, f'estate_{name}.jpg'), out, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(name, f'asphalt {asph_poly.area / M ** 2:.0f} m2, walks {walk.area / M ** 2:.0f} m2, {len(pools)} pools, {len(segs)} stall lines ({ndet} seen), {len(lanes)} OSM lanes')


def poly_json(geom):
    polys = [geom] if isinstance(geom, Polygon) else list(getattr(geom, 'geoms', []))
    return [[[[round(x, 1), round(y, 1)] for x, y in p.exterior.coords]] + [[[round(x, 1), round(y, 1)] for x, y in h.coords] for h in p.interiors]
            for p in polys if isinstance(p, Polygon) and not p.is_empty]


def add():
    src = json.load(open(SRC))
    for k in ('paved', 'pools', 'lines', 'lawns'):
        src[k] = [e for e in src.get(k, []) if not e.get('tag', '').startswith('auto:')]
    for name in AREAS:
        f = os.path.join(WORK, f'estate_{name}.json')
        if not os.path.exists(f): continue
        r = json.load(open(f)); tag = 'auto:' + name
        for c, key in (('lot', 'asphalt'), ('walk', 'walk')):
            for poly in r[key]:
                src['paved'].append({'tag': tag, 'c': c, 'ring': poly[0], 'holes': poly[1:]})
        src.setdefault('pools', []).extend({'tag': tag, 'ring': p} for p in r['pools'])
        if r['stalls']: src.setdefault('lines', []).append({'tag': tag, 'color': '#f4f4f0', 'w': 0.12, 'minzoom': 17, 'segs': r['stalls']})
        x0, y0, x1, y1 = AREAS[name]['box']
        cuts = AREAS[name].get('lawnCut', []) + [p[0] for p in r.get('courts', [])]       # no lawn on courts
        for lw in (r.get('lawnRings') or [None]):
            src.setdefault('lawns', []).append({'tag': tag, **({'ring': lw} if lw else {'box': [x0, y0, x1, y1]}), **({'cut': cuts} if cuts else {})})
    open(SRC, 'w').write(json.dumps(src, indent=1))
    print({k: len(src.get(k, [])) for k in ('paved', 'pools', 'lines', 'lawns')})


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'detect':
        for n in (a[1:] or AREAS): detect(n)
    elif a and a[0] == 'add': add()
    else: print(__doc__)
