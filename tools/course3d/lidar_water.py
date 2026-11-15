"""Lakes and ponds from the LiDAR bare-earth terrain. Water surfaces in this survey are
hydro-flattened (one exact height per lake), so a lake is a large patch of perfectly flat ground;
its edge is the real shoreline. Writes tools/course3d/lidar/water.json (lng/lat rings, committed).

  tools/course3d/.venv/bin/python tools/course3d/lidar_water.py
"""
import json, os
import numpy as np, cv2, tifffile, pyproj
from shapely.geometry import Polygon
HERE = os.path.dirname(os.path.abspath(__file__))
to_ll = pyproj.Transformer.from_crs('EPSG:26917', 'EPSG:4326', always_xy=True).transform
tif = tifffile.TiffFile(os.path.join(HERE, 'lidar', 'terrain_utm17_meters.tif')).pages[0]
dem = tif.asarray().astype(np.float32)
sx = tif.tags['ModelPixelScaleTag'].value[0]; e0, n0 = tif.tags['ModelTiepointTag'].value[3:5]
valid = dem > -9000
d = np.where(valid, dem, 0)
k = np.ones((5, 5), np.uint8)
flat = (cv2.dilate(d, k) - cv2.erode(d, k) < 0.004) & valid & (d < 3.0)     # flat to 4 mm over ~3.8 m, below 3 m NAVD88
flat = flat.astype(np.uint8)
flat = cv2.morphologyEx(flat, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(flat, 8)
out = []
for i in range(1, n):
    area = st[i, cv2.CC_STAT_AREA] * sx * sx
    if area < 250: continue
    m = (lab == i).astype(np.uint8)
    lvl = float(np.median(d[m > 0]))
    # grow back over the 2-pixel rim the 5x5 window shaved off, staying at the lake's level
    grow = cv2.dilate(m, np.ones((5, 5), np.uint8)) & (np.abs(d - lvl) < 0.02).astype(np.uint8)
    m = cv2.morphologyEx(m | grow, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    for c in cs:
        if cv2.contourArea(c) * sx * sx < 250: continue
        c = cv2.approxPolyDP(c, 0.8, True).reshape(-1, 2)
        ring = [to_ll(e0 + (x + 0.5) * sx, n0 - (y + 0.5) * sx) for x, y in c]
        p = Polygon(ring).buffer(0)
        out.append({'ring': [[round(a, 7), round(b, 7)] for a, b in p.exterior.coords], 'level': round(lvl, 2),
                    'area': round(cv2.contourArea(c) * sx * sx)})
json.dump(out, open(os.path.join(HERE, 'lidar', 'water.json'), 'w'))
print(len(out), 'water bodies', sorted([o['area'] for o in out], reverse=True)[:15])
