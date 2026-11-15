"""zoom N name x0 y0 x1 y1 [name x0 y0 x1 y1 ...] [-- sc]: close-ups in hole-N pixels with tree markers; tiles them into one image."""
import sys,cv2,json,numpy as np
sys.path.insert(0,'tools/course3d'); import trace_kit as tk
num=int(sys.argv[1]); out=sys.argv[2]; a=sys.argv[3:]; sc=5
hi=tk.HoleImage(num); cj=json.load(open('public/course3d/course.json'))
tiles=[]
for k in range(0,len(a),5):
    name=a[k]; x0,y0,x1,y1=map(int,a[k+1:k+5])
    c=cv2.resize(cv2.convertScaleAbs(hi.img[y0:y1,x0:x1],alpha=1.3,beta=-10),None,fx=sc,fy=sc,interpolation=cv2.INTER_CUBIC)
    for x in range((x0//10+1)*10,x1,10):
        cv2.line(c,((x-x0)*sc,0),((x-x0)*sc,c.shape[0]),(255,255,255) if x%50==0 else (120,120,120),1)
        if x%20==0: cv2.putText(c,str(x),((x-x0)*sc+2,12),cv2.FONT_HERSHEY_SIMPLEX,0.4,(0,255,255),1)
    for y in range((y0//10+1)*10,y1,10):
        cv2.line(c,(0,(y-y0)*sc),(c.shape[1],(y-y0)*sc),(255,255,255) if y%50==0 else (120,120,120),1)
        if y%20==0: cv2.putText(c,str(y),(2,(y-y0)*sc-2),cv2.FONT_HERSHEY_SIMPLEX,0.4,(0,255,255),1)
    for i,f in enumerate(cj['features']):
        if f['properties']['kind']=='tree':
            x,y=hi.px(f['geometry']['coordinates'][1],f['geometry']['coordinates'][0])
            if x0<=x<x1 and y0<=y<y1:
                X,Y=int((x-x0)*sc),int((y-y0)*sc); cv2.drawMarker(c,(X,Y),(0,0,255) if f['properties']['type']=='palm' else (0,255,255),cv2.MARKER_CROSS,14,2); cv2.putText(c,str(i),(X+5,Y-5),cv2.FONT_HERSHEY_SIMPLEX,0.45,(255,255,255),1)
                print(name,i,f['properties']['type'],f['properties']['r'],f['properties']['h'],round(x),round(y))
    cv2.putText(c,name,(4,c.shape[0]-6),cv2.FONT_HERSHEY_SIMPLEX,0.7,(0,255,0),2); tiles.append(c)
H=max(t.shape[0] for t in tiles)
row=np.hstack([np.vstack([t,np.zeros((H-t.shape[0],t.shape[1],3),np.uint8)]) for t in tiles])
cv2.imwrite(out,row); print(row.shape)
