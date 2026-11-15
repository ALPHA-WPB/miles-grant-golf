"""Pull building (class 6), water (9) and bridge (17) points out of the owner's full Martin County
QL1 LiDAR point cloud (2018-19, UTM 17N, NAVD88 m) into a small cached .npz for build.py.

  tools/course3d/.venv/bin/python tools/course3d/lidar_extract.py [path/to/cloud.laz]
"""
import os, sys
import numpy as np, laspy
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    '~/Documents/Codex/2026-11-06/download-the-highest-resolution-available-lidar/outputs/Miles_Grant/pointcloud/'
    'Miles_Grant_2018_2019_full_resolution_utm17.laz')
OUT = os.path.join(HERE, 'lidar', 'points_buildings_water.npz')
keep = {6, 9, 17}
xs, ys, zs, cs, rs = [], [], [], [], []
with laspy.open(SRC) as f:
    print('points', f.header.point_count, 'scale', f.header.scales, 'offset', f.header.offsets)
    for chunk in f.chunk_iterator(4_000_000):
        c = np.asarray(chunk.classification)
        m = np.isin(c, list(keep))
        if not m.any(): continue
        xs.append(np.asarray(chunk.x)[m].astype(np.float64)); ys.append(np.asarray(chunk.y)[m].astype(np.float64))
        zs.append(np.asarray(chunk.z)[m].astype(np.float32)); cs.append(c[m].astype(np.uint8))
        rs.append(np.asarray(chunk.return_number)[m].astype(np.uint8))
        print('.', end='', flush=True)
x = np.concatenate(xs); y = np.concatenate(ys)
np.savez_compressed(OUT, x=x, y=y, z=np.concatenate(zs), c=np.concatenate(cs), r=np.concatenate(rs))
print('\nsaved', OUT, len(x), {k: int((np.concatenate(cs) == k).sum()) for k in keep})
