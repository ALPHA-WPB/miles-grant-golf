"""Bunker audit helper (backlog item 18), all coordinates in hole-N photo pixels (trace_kit grid).

  overview N out.jpg                      whole hole photo with the bunkers in course.json outlined (cyan)
  detect N tag x0 y0 x1 y1 [x0 y0 x1 y1 ...] [--min A] [--dry]
        find warm sand inside each box with the build.py colour rule, but WITHOUT the road/path
        blocking that hides sand strips next to roads; each blob over A m^2 (default 12) is smoothed
        and written to traced.json bunkerEdits.add as {tag, ring}; writes .work/bk<N>_<tag>.jpg to check
  undo tag                                drop every bunkerEdits.add entry with that tag
  rm N x,y,r [x,y,r ...]                  mark a detected 'bunker' as not sand (radius r metres)
"""
import sys, json, cv2, numpy as np
sys.path.insert(0, 'tools/course3d')
import trace_kit as tk

TJ = 'tools/course3d/traced.json'


def chaikin(pts, n=2):
    for _ in range(n):
        out = []
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
            out += [(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1), (0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1)]
        pts = out
    return pts


def bunkers_px(hi):
    cj = json.load(open('public/course3d/course.json'))
    out = []
    for f in cj['features']:
        if f['properties']['kind'] != 'bunker': continue
        g = f['geometry']
        for poly in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
            out.append(np.array([hi.px(lat, lng) for lng, lat in poly[0]], np.int32))
    return out


def overview(num, out):
    hi = tk.HoleImage(num)
    im = cv2.convertScaleAbs(hi.img, alpha=1.2, beta=-10)
    for p in bunkers_px(hi): cv2.polylines(im, [p], True, (255, 255, 0), 2)
    for x in range(0, im.shape[1], 100):
        cv2.line(im, (x, 0), (x, im.shape[0]), (200, 200, 200), 1); cv2.putText(im, str(x), (x + 2, 14), 0, 0.45, (0, 255, 255), 1)
    for y in range(0, im.shape[0], 100):
        cv2.line(im, (0, y), (im.shape[1], y), (200, 200, 200), 1); cv2.putText(im, str(y), (2, y - 2), 0, 0.45, (0, 255, 255), 1)
    cv2.imwrite(out, im); print(out, im.shape)


def detect(num, tag, boxes, amin, dry):
    hi = tk.HoleImage(num); im = hi.img; mpp = hi.mpp
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(int)
    b, g, r = [im[..., i].astype(int) for i in range(3)]
    s, v = hsv[..., 1], hsv[..., 2]
    sand = (((v > 165) & (s < 70)) | ((v > 138) & (s < 62))) & (r > b + 12) & (r >= g - 5)
    d = json.load(open(TJ)); adds = d['bunkerEdits'].setdefault('add', [])
    vis = cv2.convertScaleAbs(im, alpha=1.2, beta=-10)
    for p in bunkers_px(hi): cv2.polylines(vis, [p], True, (255, 255, 0), 1)
    n = 0
    for x0, y0, x1, y1 in boxes:
        m = np.zeros(sand.shape, np.uint8); m[y0:y1, x0:x1] = sand[y0:y1, x0:x1]
        m = cv2.morphologyEx(m * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        cv2.rectangle(vis, (x0, y0), (x1, y1), (0, 255, 255), 1)
        for c in cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
            area = cv2.contourArea(c) * mpp * mpp
            if area < amin: continue
            c = cv2.approxPolyDP(c, 1.2, True).reshape(-1, 2)
            if len(c) < 3: continue
            pts = chaikin([tuple(map(float, p)) for p in c])
            cv2.polylines(vis, [np.array(pts, np.int32)], True, (0, 0, 255), 1)
            ring = [[round(lng, 7), round(lat, 7)] for lat, lng in (hi.ll(x, y) for x, y in pts)]
            ring.append(ring[0]); adds.append({'tag': tag, 'ring': ring}); n += 1
            print('blob %.0f m2 at %d,%d' % (area, *np.array(pts).mean(0)))
        pad = 40
        crop = vis[max(y0 - pad, 0):y1 + pad, max(x0 - pad, 0):x1 + pad]
    X0 = max(min(bx[0] for bx in boxes) - 40, 0); Y0 = max(min(bx[1] for bx in boxes) - 40, 0)
    X1 = max(bx[2] for bx in boxes) + 40; Y1 = max(bx[3] for bx in boxes) + 40
    out = 'tools/course3d/.work/bk%d_%s.jpg' % (num, tag)
    cv2.imwrite(out, cv2.resize(vis[Y0:Y1, X0:X1], None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
    print(n, 'bunkers', '(dry run)' if dry else 'added', '->', out)
    if not dry: open(TJ, 'w').write(json.dumps(d, indent=1))


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'overview': overview(int(a[1]), a[2])
    elif a[0] == 'undo':
        d = json.load(open(TJ)); d['bunkerEdits']['add'] = [x for x in d['bunkerEdits'].get('add', []) if x['tag'] != a[1]]
        open(TJ, 'w').write(json.dumps(d, indent=1))
    elif a[0] == 'list':        # list N x0 y0 x1 y1: bunkers inside the box -> a point inside each (px) and area
        from shapely.geometry import Polygon
        hi = tk.HoleImage(int(a[1])); x0, y0, x1, y1 = map(int, a[2:6])
        for p in bunkers_px(hi):
            q = Polygon(p).buffer(0); rp = q.representative_point()
            if x0 <= rp.x <= x1 and y0 <= rp.y <= y1:
                print('%d,%d  %.0f m2' % (rp.x, rp.y, q.area * hi.mpp ** 2))
    elif a[0] == 'rm':          # rm N x,y,r_m [x,y,r_m ...]: not sand (worn grass, beds, paths) -> bunkerEdits.remove
        hi = tk.HoleImage(int(a[1])); d = json.load(open(TJ))
        for v in a[2:]:
            x, y, rm = map(float, v.split(',')); lat, lng = hi.ll(x, y)
            d['bunkerEdits']['remove'].append([round(lng, 7), round(lat, 7), rm])
        open(TJ, 'w').write(json.dumps(d, indent=1))
    elif a[0] == 'detect':
        dry = '--dry' in a; a = [x for x in a if x != '--dry']
        amin = 12.0
        if '--min' in a: i = a.index('--min'); amin = float(a[i + 1]); del a[i:i + 2]
        nums = list(map(int, a[3:]))
        detect(int(a[1]), a[2], [nums[i:i + 4] for i in range(0, len(nums), 4)], amin, dry)
