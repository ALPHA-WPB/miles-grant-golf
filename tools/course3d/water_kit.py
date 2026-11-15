"""Helpers for tracing lakes/ponds (traced.json "water") from the Esri photo + LiDAR.

Run from the repo root with tools/course3d/.venv/bin/python.

  overview          Whole-course photo with a pixel grid, hole numbers, OSM water (blue) and traced
                    water (cyan) -> .work/water_overview.jpg (+ water_q{0..3}.jpg larger quarters).
  crop X0 Y0 X1 Y1  Gridded close-up of that whole-course pixel box -> .work/water_crop.jpg
  detect            Propose lake outlines: dark, smooth, blue-green photo pixels that are also flat and
                    low in the LiDAR, inside the box list in .work/water_boxes.json ([[x0,y0,x1,y1],...]
                    whole-course pixels). Writes .work/water_found.json (pixel rings) for review.
  add               Store .work/water_found.json rings (minus indexes given as extra args) into
                    traced.json "water" as lat/lng rings.
"""
import json, math, os, sys
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace_kit import ROOT, HERE, CACHE, WORK, Z, tile_xy, holes, grid_crop

TR = os.path.join(HERE, 'traced.json')


class Course:
    def __init__(self):
        s, w, n, e = json.load(open(TR))['regions'][0]['bbox']
        x0, y0 = tile_xy(n, w); x1, y1 = tile_xy(s, e)
        self.tx0, self.ty0 = int(x0), int(y0)
        cols, rows = int(x1) - self.tx0 + 1, int(y1) - self.ty0 + 1
        self.img = np.zeros((rows * 256, cols * 256, 3), np.uint8)
        for i in range(cols):
            for j in range(rows):
                self.img[j*256:(j+1)*256, i*256:(i+1)*256] = cv2.imread(os.path.join(CACHE, f'{Z}_{self.tx0+i}_{self.ty0+j}.jpg'))
        self.mpp = 156543.03 * math.cos(math.radians((s + n) / 2)) / 2 ** Z

    def px(self, lng, lat):
        x, y = tile_xy(lat, lng)
        return (x - self.tx0) * 256, (y - self.ty0) * 256

    def ll(self, px, py):
        n = 2 ** Z; x = px / 256 + self.tx0; y = py / 256 + self.ty0
        return round(x / n * 360 - 180, 7), round(math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))), 7)


def annotated(c):
    out = c.img.copy()
    P = lambda ring: np.array([c.px(lng, lat) for lng, lat in ring], np.int32)
    osm = json.load(open(os.path.join(CACHE, 'osm.json')))['elements']
    for e in osm:
        if e.get('tags', {}).get('natural') == 'water':
            cv2.polylines(out, [P([(p['lon'], p['lat']) for p in e['geometry']])], True, (255, 80, 0), 3)
    for ring in json.load(open(TR)).get('water', []):
        cv2.polylines(out, [P(ring)], True, (255, 255, 0), 2)
    for n, h in holes().items():
        x, y = c.px(h['green'][1], h['green'][0])
        cv2.putText(out, str(n), (int(x) - 20, int(y) + 14), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 0, 0), 8)
        cv2.putText(out, str(n), (int(x) - 20, int(y) + 14), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 255, 255), 3)
    return out


def overview():
    c = Course(); out = annotated(c); H, W = out.shape[:2]
    print(W, H, c.mpp)
    print(grid_crop(out, 0, 0, W, H, 1500 / W, os.path.join(WORK, 'water_overview.jpg'), step=100))
    for q, (a, b) in enumerate([(0, 0), (1, 0), (0, 1), (1, 1)]):
        print(grid_crop(out, a * W // 2 - 60 * a, b * H // 2 - 60 * b, (a + 1) * W // 2 + 60, (b + 1) * H // 2 + 60, 0.55,
                        os.path.join(WORK, f'water_q{q}.jpg'), step=100))


def crop(x0, y0, x1, y1):
    c = Course(); out = annotated(c)
    fp = os.path.join(WORK, 'water_found.json')
    if os.path.exists(fp):
        for i, ring in enumerate(json.load(open(fp))):
            r = np.array(ring, np.int32)
            cv2.polylines(out, [r], True, (0, 255, 255), 2)
            cv2.putText(out, str(i), tuple(int(v) for v in r.mean(0)), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 255), 3)
    sc = min(2.0, 1500 / max(x1 - x0, y1 - y0))
    print(grid_crop(out, x0, y0, x1, y1, sc, os.path.join(WORK, 'water_crop.jpg'), step=50 if sc > 0.8 else 100))


def lidar_on(c):
    """LiDAR elevation resampled onto the whole-course photo grid (metres NAVD88, NaN where no data)."""
    import tifffile
    from pyproj import Transformer
    p = os.path.join(HERE, 'lidar', 'terrain_utm17_meters.tif')
    with tifffile.TiffFile(p) as t:
        a = t.asarray().astype(np.float32); tags = t.pages[0].tags
        sx, sy = tags['ModelPixelScaleTag'].value[:2]; tp = tags['ModelTiepointTag'].value
        ox, oy = tp[3], tp[4]
    a[a < -100] = np.nan
    H, W = c.img.shape[:2]
    step = 4
    xs, ys = np.meshgrid(np.arange(0, W, step), np.arange(0, H, step))
    n = 2 ** Z
    lng = (xs / 256 + c.tx0) / n * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (ys / 256 + c.ty0) / n))))
    ex, ny = Transformer.from_crs(4326, 32617, always_xy=True).transform(lng, lat)
    col = ((ex - ox) / sx).astype(np.float32); row = ((oy - ny) / sy).astype(np.float32)
    z = cv2.remap(a, col, row, cv2.INTER_NEAREST, borderValue=float('nan'))
    return cv2.resize(z, (W, H), interpolation=cv2.INTER_NEAREST)


def detect():
    c = Course(); img = c.img
    z = lidar_on(c)
    zf = np.nan_to_num(z, nan=99.0)
    k = np.ones((9, 9), np.float32) / 81
    m = cv2.filter2D(zf, -1, k); v = cv2.filter2D(zf * zf, -1, k) - m * m
    flat = (v < 0.0004) & (zf < 50)                       # hydro-flattened water: no relief at all
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    tex = cv2.GaussianBlur(np.abs(cv2.Laplacian(gray, cv2.CV_32F)), (0, 0), 3)
    dark = (hsv[..., 2] < 95) & (tex < 9)
    cand = (flat & dark).astype(np.uint8) * 255
    cv2.imwrite(os.path.join(WORK, 'water_flat.png'), cv2.resize(flat.astype(np.uint8) * 255, None, fx=0.28, fy=0.28))
    mask = np.zeros_like(cand)
    for x0, y0, x1, y1 in json.load(open(os.path.join(WORK, 'water_boxes.json'))):
        mask[y0:y1, x0:x1] = cand[y0:y1, x0:x1]
    r = lambda d: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))
    mask = cv2.morphologyEx(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, r(15)), cv2.MORPH_OPEN, r(9))
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    rings = []
    for ct in sorted(cs, key=cv2.contourArea, reverse=True):
        if cv2.contourArea(ct) * c.mpp ** 2 < 150: continue
        ap = cv2.approxPolyDP(ct, 2.5, True)[:, 0, :]
        rings.append(ap.tolist())
        print(len(rings) - 1, 'area m2', round(cv2.contourArea(ct) * c.mpp ** 2), 'pts', len(ap), 'bbox', cv2.boundingRect(ct))
    json.dump(rings, open(os.path.join(WORK, 'water_found.json'), 'w'))


def add(skip):
    c = Course(); d = json.load(open(TR))
    rings = [r for i, r in enumerate(json.load(open(os.path.join(WORK, 'water_found.json')))) if i not in skip]
    d['water'] = [[list(c.ll(x, y)) for x, y in r] for r in rings]
    json.dump(d, open(TR, 'w'), indent=1)
    print('traced.json water:', len(d['water']), 'rings')


if __name__ == '__main__':
    a = sys.argv[1:]
    {'overview': overview, 'crop': lambda: crop(*map(int, a[1:5])), 'detect': detect,
     'add': lambda: add({int(v) for v in a[1:]})}[a[0]]()
