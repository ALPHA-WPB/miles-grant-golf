"""Buildings (and bridges) inside Miles Grant from the owner's 2018-19 Martin County QL1 LiDAR.

For every building (LiDAR class 6) inside the club area this writes
  - the roof outline, squared up to the building's own direction (straight walls),
  - the wall line (the outline pulled in by the eave overhang),
  - a 1 m grid of roof heights above the ground, in the building's own direction. The measured
    roof is first cleaned into flat planes (hips, gables, flat parts), so ridges come out straight.
Bridges (class 17) are written as a deck rectangle with its height.

  tools/course3d/.venv/bin/python tools/course3d/lidar_buildings.py
      -> tools/course3d/lidar/buildings.json, tools/course3d/lidar/bridges.json  (both committed)

Needs tools/course3d/lidar/points_buildings_water.npz (lidar_extract.py; needs the full point cloud)
and tools/course3d/lidar/terrain_utm17_meters.tif. build.py only needs the two JSON files.
"""
import json, math, os, base64
import numpy as np, cv2, tifffile, pyproj
from shapely.geometry import Polygon, MultiPoint
from shapely.ops import unary_union, transform as shp_transform

HERE = os.path.dirname(os.path.abspath(__file__))
CELL = 0.5          # analysis grid (m)
STEP = 1.0          # roof height grid shipped to the app (m)
MIN_AREA = 22       # m²; smaller blobs are sheds, AC pads, noise
OVERHANG = 0.4      # eaves: the walls stand this far inside the roof outline (m)
MPD = 111320.0      # metres per degree of latitude (same constant as the app)

traced = json.load(open(os.path.join(HERE, 'traced.json')))
to_utm = pyproj.Transformer.from_crs('EPSG:4326', 'EPSG:26917', always_xy=True).transform
to_ll = pyproj.Transformer.from_crs('EPSG:26917', 'EPSG:4326', always_xy=True).transform


def club_region_ll():
    parts = [Polygon(traced['clubPerimeter'])] + [Polygon(r) for r in traced.get('clubExtra', [])]
    return unary_union([p.buffer(0) for p in parts])


def nearest_fill(a, valid):
    """Copy the nearest valid value into every invalid cell."""
    if valid.all(): return a.copy()
    _, lab = cv2.distanceTransformWithLabels((~valid).astype(np.uint8), cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros(int(lab.max()) + 1, a.dtype); lut[lab[valid]] = a[valid]
    return lut[lab]


def largest(g):
    return max(getattr(g, 'geoms', [g]), key=lambda p: p.area)


def main_direction(poly):
    """Angle (radians, counter-clockwise from +x) of the long side of the best-fit rectangle."""
    xs = list(poly.minimum_rotated_rectangle.exterior.coords)
    best = max(range(4), key=lambda i: math.dist(xs[i], xs[i + 1]))
    return math.atan2(xs[best + 1][1] - xs[best][1], xs[best + 1][0] - xs[best][0])


def regularize(poly):
    """Straight walls: snap the outline to the building's main direction (and its right angle),
    keep genuinely angled walls, and drop the small steps left by the laser's cell edges."""
    th = main_direction(poly)
    cx, cy = poly.centroid.x, poly.centroid.y
    ct, st = math.cos(-th), math.sin(-th)
    rot = lambda x, y: ((x - cx) * ct - (y - cy) * st, (x - cx) * st + (y - cy) * ct)
    unrot = lambda u, v: (cx + u * math.cos(th) - v * math.sin(th), cy + u * math.sin(th) + v * math.cos(th))
    p = Polygon([rot(x, y) for x, y in poly.exterior.coords])
    p = p.buffer(0.45, join_style=2).buffer(-0.9, join_style=2).buffer(0.45, join_style=2)   # close, then open; square corners
    if p.is_empty: return poly
    p = largest(p).simplify(0.5)
    pts = list(p.exterior.coords)[:-1]
    if len(pts) < 4: return poly
    edges = []      # each edge: [type, position, length, start, end]; h = along the building, v = across it, d = diagonal
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180
        L = math.dist(a, b)
        if ang < 17 or ang > 163: e = ['h', (a[1] + b[1]) / 2, L, a, b]
        elif 73 < ang < 107: e = ['v', (a[0] + b[0]) / 2, L, a, b]
        else: e = ['d', None, L, a, b]
        if edges and edges[-1][0] == e[0] and e[0] != 'd':          # merge runs of parallel edges
            w0 = edges[-1][2]
            edges[-1][1] = (edges[-1][1] * w0 + e[1] * L) / (w0 + L); edges[-1][2] += L; edges[-1][4] = b
        else:
            edges.append(e)
    if len(edges) > 1 and edges[0][0] == edges[-1][0] and edges[0][0] != 'd':
        w0, w1 = edges[0][2], edges[-1][2]
        edges[0][1] = (edges[0][1] * w0 + edges[-1][1] * w1) / (w0 + w1); edges[0][2] += w1; edges[0][3] = edges[-1][3]; edges.pop()
    if len(edges) < 3: return poly
    def line(e):
        if e[0] == 'h': return (0.0, e[1]), (1.0, 0.0)
        if e[0] == 'v': return (e[1], 0.0), (0.0, 1.0)
        a, b = e[3], e[4]; L = math.dist(a, b) or 1
        return a, ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
    out = []
    for i in range(len(edges)):
        (p1, d1), (p2, d2) = line(edges[i - 1]), line(edges[i])
        den = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(den) < 1e-6:
            out.append(edges[i][3]); continue
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
        out.append((p1[0] + t * d1[0], p1[1] + t * d1[1]))
    q = Polygon([unrot(u, v) for u, v in out]).buffer(0)
    if q.is_empty or q.geom_type != 'Polygon' or not (0.85 < q.area / poly.area < 1.15) or q.hausdorff_distance(poly) > 1.6:
        return Polygon([unrot(u, v) for u, v in pts]).buffer(0)
    return q


def sane(coef):
    return bool(np.all(np.isfinite(coef)) and abs(coef[0]) < 2.5 and abs(coef[1]) < 2.5)


def ransac_plane(E, N, Z, rng, tol=0.07, iters=70):
    """Best plane z = a*e + b*n + c through most of the points; returns (coef, inlier mask)."""
    n = len(Z)
    A = np.c_[E, N, np.ones(n)]
    best, best_in = None, None
    for _ in range(iters):
        i = rng.choice(n, 3, replace=False)
        try: coef = np.linalg.solve(A[i], Z[i])
        except np.linalg.LinAlgError: continue
        if not sane(coef): continue                                   # steeper than any roof
        inl = np.abs(E * coef[0] + N * coef[1] + coef[2] - Z) < tol
        if best_in is None or inl.sum() > best_in.sum(): best, best_in = coef, inl
    if best is None:
        coef, *_ = np.linalg.lstsq(A, Z, rcond=None)
        return coef, np.abs(E * coef[0] + N * coef[1] + coef[2] - Z) < tol * 2
    for _ in range(2):                                                # polish on the inliers
        if best_in.sum() < 6: break
        c2, *_ = np.linalg.lstsq(A[best_in], Z[best_in], rcond=None)
        if not sane(c2): break
        best = c2
        best_in = np.abs(E * best[0] + N * best[1] + best[2] - Z) < tol * 1.5
    return best, best_in


def clean_roof(hh, valid, th, rng):
    """Turn the measured roof heights (0.5 m cells, metres) into flat planes that meet at straight
    ridges. Returns (heights, number of planes)."""
    H, W = hh.shape
    f = nearest_fill(hh, valid).astype(np.float32)
    sm = cv2.GaussianBlur(f, (0, 0), 1.0)
    ge = cv2.Sobel(sm, cv2.CV_32F, 1, 0, ksize=3) / (8 * CELL)        # slope toward the east, per metre
    gn = -cv2.Sobel(sm, cv2.CV_32F, 0, 1, ksize=3) / (8 * CELL)       # toward the north
    gu = ge * math.cos(th) + gn * math.sin(th); gv = -ge * math.sin(th) + gn * math.cos(th)
    mag = np.hypot(gu, gv)
    inner = cv2.erode(valid.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    cls = np.zeros((H, W), np.uint8)                                   # 1 flat, 2 +u, 3 -u, 4 +v, 5 -v
    cls[inner & (mag < 0.10)] = 1
    steep = inner & (mag >= 0.10); au = np.abs(gu) >= np.abs(gv)
    cls[steep & au & (gu > 0)] = 2; cls[steep & au & (gu <= 0)] = 3
    cls[steep & ~au & (gv > 0)] = 4; cls[steep & ~au & (gv <= 0)] = 5
    EE, NN = np.meshgrid(np.arange(W) * CELL, -np.arange(H) * CELL)
    planes, masks = [], []
    for c in range(1, 6):
        m = cv2.morphologyEx((cls == c).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, 4)
        for i in range(1, n):
            comp = lab == i
            for _ in range(4):                                         # one direction can hold several planes (steps, pitches)
                if comp.sum() * CELL * CELL < 3.0: break
                coef, inl = ransac_plane(EE[comp], NN[comp], f[comp], rng)
                got = np.zeros((H, W), bool); got[comp] = inl
                n2, lab2, st2, _ = cv2.connectedComponentsWithStats(got.astype(np.uint8), 8)
                if n2 < 2: break
                big = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
                part = lab2 == big
                if part.sum() * CELL * CELL < 3.0: break
                planes.append(coef); masks.append(part)
                comp = comp & ~got
    if not planes:
        return sm, 0
    best = np.full((H, W), -1, np.int32)
    for _ in range(2):                                                  # give every cell the nearby plane that fits it best
        best_err = np.full((H, W), np.inf, np.float32); best[:] = -1
        for k, (coef, m) in enumerate(zip(planes, masks)):
            near = cv2.dilate(m.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            err = np.abs(coef[0] * EE + coef[1] * NN + coef[2] - f) + np.where(m, 0, 0.04).astype(np.float32)
            upd = near & valid & (err < best_err)
            best_err[upd] = err[upd]; best[upd] = k
        masks = [best == k for k in range(len(planes))]
        for k, m in enumerate(masks):                                   # refit with the new members
            if m.sum() >= 12:
                A = np.c_[EE[m], NN[m], np.ones(int(m.sum()))]
                coef, *_ = np.linalg.lstsq(A, f[m], rcond=None)
                if not sane(coef): continue
                r = np.abs(EE[m] * coef[0] + NN[m] * coef[1] + coef[2] - f[m]); keep = r < max(0.1, 2 * np.median(r))
                if keep.sum() >= 8:
                    c2, *_ = np.linalg.lstsq(A[keep], f[m][keep], rcond=None)
                    if sane(c2): coef = c2
                planes[k] = coef
    lab = nearest_fill(best, best >= 0) if (best >= 0).any() else best
    P = np.zeros((H, W), np.float32)
    for k, coef in enumerate(planes):
        m = lab == k
        P[m] = (coef[0] * EE + coef[1] * NN + coef[2])[m]
    out = np.where(np.abs(P - f) < 0.5, P, sm)                           # chimneys, dormers, bad fits: keep what was measured
    if np.median(np.abs(out - f)[valid]) > 0.2: return sm, 0
    return out.astype(np.float32), len(planes)


def main():
    rng = np.random.default_rng(7)
    reg = shp_transform(to_utm, club_region_ll())
    d = np.load(os.path.join(HERE, 'lidar', 'points_buildings_water.npz'))
    m = d['c'] == 6
    x, y, z = d['x'][m], d['y'][m], d['z'][m]
    x0, y0, x1, y1 = reg.bounds
    x0 -= 10; y0 -= 10; x1 += 10; y1 += 10
    keep = (x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)
    x, y, z = x[keep], y[keep], z[keep]
    W, H = int((x1 - x0) / CELL) + 1, int((y1 - y0) / CELL) + 1
    ci = ((x - x0) / CELL).astype(int); rj = ((y1 - y) / CELL).astype(int)
    dsm = np.full((H, W), -999.0, np.float32); np.maximum.at(dsm, (rj, ci), z)
    cnt = np.zeros((H, W), np.int32); np.add.at(cnt, (rj, ci), 1)
    regm = np.zeros((H, W), np.uint8)
    for part in getattr(reg, 'geoms', [reg]):
        cv2.fillPoly(regm, [np.array([((px - x0) / CELL, (y1 - py) / CELL) for px, py in part.exterior.coords], np.int32)], 1)
    mask = ((cnt > 0) & (regm > 0)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    inv = (1 - mask).astype(np.uint8)                                   # fill laser gaps (holes under 6 m²); courtyards stay
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] * CELL * CELL < 6: mask[lab == i] = 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # bare-earth terrain (same survey) on this grid
    tif = tifffile.TiffFile(os.path.join(HERE, 'lidar', 'terrain_utm17_meters.tif')).pages[0]
    dem = tif.asarray().astype(np.float32); dem[dem < -9000] = np.nan
    sx = tif.tags['ModelPixelScaleTag'].value[0]; e0, n0 = tif.tags['ModelTiepointTag'].value[3:5]
    jj, ii = np.mgrid[0:H, 0:W]
    gx = ((x0 + (ii + 0.5) * CELL) - e0) / sx - 0.5; gy = (n0 - (y1 - (jj + 0.5) * CELL)) / sx - 0.5
    ground = cv2.remap(np.nan_to_num(dem, nan=0), gx.astype(np.float32), gy.astype(np.float32), cv2.INTER_LINEAR)
    dsm_f = dsm.copy(); dsm_f[cnt == 0] = np.nan
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    out, nplanes, fallback = [], 0, 0
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] * CELL * CELL < MIN_AREA: continue
        bx, by, bw, bh = st[i, :4]
        pad = 6
        blob = np.zeros((bh + 2 * pad, bw + 2 * pad), np.uint8); blob[pad:-pad, pad:-pad] = lab[by:by + bh, bx:bx + bw] == i
        ringm = cv2.dilate(blob, np.ones((9, 9), np.uint8)) - cv2.dilate(blob, np.ones((3, 3), np.uint8))
        gsub = np.pad(ground[by:by + bh, bx:bx + bw], pad, mode='edge')
        g0 = float(np.median(gsub[ringm > 0]))
        hs = np.pad(dsm_f[by:by + bh, bx:bx + bw], pad, constant_values=np.nan) - g0
        vals = hs[(blob > 0) & np.isfinite(hs)]
        if len(vals) < 20: continue
        top = float(np.percentile(vals, 98))
        if top < 2.0: continue                                           # low wall or slab, not a building
        cs, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea).reshape(-1, 2).astype(float)
        if len(c) < 3: continue
        ex0, ny1 = x0 + (bx - pad) * CELL, y1 - (by - pad) * CELL        # this crop's west edge and north edge (UTM)
        poly = Polygon([(ex0 + (px + 0.5) * CELL, ny1 - (py + 0.5) * CELL) for px, py in c]).buffer(0)
        if poly.is_empty: continue
        poly = largest(regularize(largest(poly)))
        # measured roof heights on the 0.5 m cells: gaps filled, AC units and antennas filtered out
        valid = blob > 0
        hh = np.where(valid & np.isfinite(hs), hs, np.nan).astype(np.float32)
        have = np.isfinite(hh)
        if not have.any(): continue
        hh = nearest_fill(np.nan_to_num(hh, nan=0), have)
        hh = cv2.medianBlur(hh, 5)
        hc, k = clean_roof(hh, valid, main_direction(poly), rng)
        nplanes += k; fallback += k == 0
        hc = nearest_fill(hc, valid)                                     # eave heights continue past the outline
        # building-local frame from lng/lat, exactly as the app builds it: e east, n north (m) from an anchor
        pl = shp_transform(to_ll, poly)
        alng, alat = pl.centroid.x, pl.centroid.y
        kk = math.cos(math.radians(alat))
        enu = lambda lng, lat: ((lng - alng) * MPD * kk, (lat - alat) * MPD)
        pe = Polygon([enu(*p) for p in pl.exterior.coords])
        th = main_direction(pe)
        ct, st_ = math.cos(th), math.sin(th)
        uv = [(e * ct + nn * st_, -e * st_ + nn * ct) for e, nn in pe.exterior.coords]
        u0 = min(p[0] for p in uv) - 0.3; v0 = min(p[1] for p in uv) - 0.3
        gw = int(math.ceil((max(p[0] for p in uv) + 0.3 - u0) / STEP)) + 1
        gh = int(math.ceil((max(p[1] for p in uv) + 0.3 - v0) / STEP)) + 1
        iu, jv = np.meshgrid(u0 + np.arange(gw) * STEP, v0 + np.arange(gh) * STEP)
        ne = iu * ct - jv * st_; nn_ = iu * st_ + jv * ct                 # node positions, east/north of the anchor
        nlng = alng + ne / (MPD * kk); nlat = alat + nn_ / MPD
        ue, un = to_utm(nlng.ravel(), nlat.ravel())
        mapx = ((np.array(ue) - ex0) / CELL - 0.5).astype(np.float32).reshape(gh, gw)
        mapy = ((ny1 - np.array(un)) / CELL - 0.5).astype(np.float32).reshape(gh, gw)
        nodes = cv2.remap(hc, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        hmin = math.floor(float(nodes.min()) * 10) / 10
        sc = max((float(nodes.max()) - hmin) / 255, 0.01)
        q = np.clip(np.round((nodes - hmin) / sc), 0, 255).astype(np.uint8)
        walls = poly.buffer(-OVERHANG, join_style=2)
        walls = largest(walls) if not walls.is_empty and walls.area > 0.5 * poly.area else poly
        r7 = lambda ring: [[round(a, 7), round(b, 7)] for a, b in ring]
        out.append({'ring': r7(pl.exterior.coords), 'walls': r7(shp_transform(to_ll, walls).exterior.coords),
                    'area': round(poly.area, 1), 'ground': round(g0, 2), 'top': round(top, 2),
                    'eave': round(float(np.percentile(vals, 20)), 2), 'planes': k,
                    'grid': {'lng': round(float(nlng[0, 0]), 7), 'lat': round(float(nlat[0, 0]), 7), 'th': round(th, 4), 'step': STEP,
                             'w': gw, 'h': gh, 'min': hmin, 'sc': round(sc, 4), 'd': base64.b64encode(q.tobytes()).decode()}})
    json.dump({'source': 'Martin County QL1 LiDAR 2018-19, class 6', 'buildings': out},
              open(os.path.join(HERE, 'lidar', 'buildings.json'), 'w'), separators=(',', ':'))
    print(len(out), 'buildings,', round(sum(b['area'] for b in out)), 'm² of roof,', nplanes, 'roof planes,', fallback,
          'kept as measured; grid nodes', sum(b['grid']['w'] * b['grid']['h'] for b in out))

    # Bridges: class 17 clusters inside the club area -> deck rectangle + deck height (NAVD88 m)
    m = d['c'] == 17
    bx_, by_, bz_ = d['x'][m], d['y'][m], d['z'][m]
    cells = {}
    for i, (px, py) in enumerate(zip((bx_ // 8).astype(int).tolist(), (by_ // 8).astype(int).tolist())): cells.setdefault((px, py), []).append(i)
    seen, bridges = set(), []
    for c0 in cells:
        if c0 in seen: continue
        stack, idx = [c0], []
        while stack:
            q = stack.pop()
            if q in seen or q not in cells: continue
            seen.add(q); idx += cells[q]
            stack += [(q[0] + a, q[1] + b) for a in (-1, 0, 1) for b in (-1, 0, 1)]
        if len(idx) < 60: continue
        pts = MultiPoint([(bx_[j], by_[j]) for j in idx])
        if not reg.contains(pts.centroid): continue
        deck = pts.minimum_rotated_rectangle
        bridges.append({'ring': [[round(a, 7), round(b, 7)] for a, b in shp_transform(to_ll, deck).exterior.coords],
                        'deck': round(float(np.median(bz_[idx])), 2), 'points': len(idx)})
    json.dump(bridges, open(os.path.join(HERE, 'lidar', 'bridges.json'), 'w'), separators=(',', ':'))
    print(len(bridges), 'bridge(s)', [(b['deck'], b['points']) for b in bridges])


if __name__ == '__main__':
    main()
