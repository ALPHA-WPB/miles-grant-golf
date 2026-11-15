"""edit N tag 'rm:i,j,k' 'x,y,h[,type,r];...'  — remove features by course.json index, add trees at hole-N pixels"""
import sys,json
sys.path.insert(0,'tools/course3d'); import trace_kit as tk
num=int(sys.argv[1]); tag=sys.argv[2]
hi=tk.HoleImage(num); cj=json.load(open('public/course3d/course.json'))
p='tools/course3d/traced.json'; d=json.load(open(p))
for i in [int(v) for v in sys.argv[3][3:].split(',') if v]:
    f=cj['features'][i]; assert f['properties']['kind']=='tree'
    c=f['geometry']['coordinates']; d['treeEdits']['remove'].append([c[0],c[1],1.0])
for a in [v.split(',') for v in sys.argv[4].split(';') if v]:
    x,y,h=float(a[0]),float(a[1]),float(a[2]); typ=a[3] if len(a)>3 else 'palm'; r=float(a[4]) if len(a)>4 else 1.9
    lat,lng=hi.ll(x,y); d['treeEdits']['add'].append([round(lng,7),round(lat,7),r,typ,tag,h])
open(p,'w').write(json.dumps(d,indent=1))
