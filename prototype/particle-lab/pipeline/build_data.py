import json, base64, numpy as np, sys
sys.path.insert(0,'svg')
from parse2 import parse
from scipy import ndimage
raw=json.load(open('svg/dots_raw.json'))
def enc(arr): return base64.b64encode(np.round(np.asarray(arr,dtype=np.float64)).astype('<i2').tobytes()).decode()
out={}
# ---- hero shapes
hero={}
for key,name in [('ring','ring'),('world','world'),('africa','africa'),('southAmerica','sam'),('europe','europe')]:
    d=np.array(raw[name]['dots'])  # x,y,r,op in hero frame coords
    x0,y0,cs=-300,-500,6
    W,H=int(2100/cs),int(2100/cs)
    grid=np.zeros((H,W))
    ix=((d[:,0]-x0)/cs).astype(int); iy=((d[:,1]-y0)/cs).astype(int)
    np.add.at(grid,(iy.clip(0,H-1),ix.clip(0,W-1)),1)
    dens=ndimage.gaussian_filter(grid,3.0)
    empty=dens<0.012
    lab,n=ndimage.label(empty)
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))
    sizes=ndimage.sum(empty,lab,range(1,n+1))
    holes=np.zeros_like(empty)
    for i in range(1,n+1):
        if i not in border and sizes[i-1]*cs*cs>1500: holes|=(lab==i)
    dist=ndimage.distance_transform_edt(~holes)*cs
    edge=np.clip(dist[iy.clip(0,H-1),ix.clip(0,W-1)]/160,0,1)
    if key=='world': c=(706.0,480.0)
    else:
        lab2,n2=ndimage.label(holes); big=np.argmax(ndimage.sum(holes,lab2,range(1,n2+1)))+1
        cy,cx=ndimage.center_of_mass(lab2==big); c=(x0+cx*cs,y0+cy*cs)
    print(key,len(d),'holes px',int(holes.sum()*cs*cs),'center',[round(v) for v in c],'edge<0.2',int((edge<0.2).sum()))
    arr=np.column_stack([(d[:,0]-720)*8,(d[:,1]-450)*8,d[:,2]*1000,d[:,3]*1000,edge*1000])
    hero[key]={'n':len(d),'c':[round(c[0]-720,1),round(c[1]-450,1)],'b':enc(arr)}
out['hero']=hero
# ---- band
b=np.array(parse('svg/band.svg'))
cy=b[:,1].mean()
out['band']={'n':len(b),'b':enc(np.column_stack([(b[:,0]-720)*8,(b[:,1]-cy)*8,b[:,2]*1000,b[:,3]*1000]))}
print('band',len(b),'cy',cy, 'yspread',np.percentile(b[:,1]-cy,[5,95]))
# ---- team: mask + card clip
t=np.array(parse('svg/team_full.svg'))
P0,P1,P2,P3=np.array([4.55,867.41]),np.array([197.387,857.407]),np.array([579.951,0.5]),np.array([762.686,0.5])
s=np.linspace(0,1,400)[:,None]
curve=((1-s)**3)*P0+3*((1-s)**2)*s*P1+3*(1-s)*s*s*P2+s**3*P3
cy_sorted=np.argsort(curve[:,1])
cx_at=lambda y: np.interp(y,curve[cy_sorted,1],curve[cy_sorted,0])
inside=(t[:,1]<=867.4)&(t[:,1]>=0.5)&(t[:,0]<=1227.2)&(t[:,0]>=cx_at(t[:,1]))
tc=t[inside].copy(); tc[:,0]+=180; tc[:,1]-=100
vis=(tc[:,0]>=0)&(tc[:,0]<=1360)&(tc[:,1]>=0)&(tc[:,1]<=532)
tc=tc[vis]
out['team']={'n':len(tc),'b':enc(np.column_stack([(tc[:,0]-680)*8,(tc[:,1]-266)*8,tc[:,2]*1000,tc[:,3]*1000]))}
print('team visible',len(tc),'r max',tc[:,2].max())
# ---- research regions (160 box, centered 80,80)
reg={}
g=np.array(parse('svg/gafrica.svg')); reg['africa']=g
rj=json.load(open('regions.json'))
for k in ['china','brazil','uganda']: reg[k]=np.array(rj[k])
glb=np.array(parse('svg/card3.svg')); glb[:,0]=(glb[:,0]-119.4/2)*1.333+80; glb[:,1]=(glb[:,1]-60)*1.333+80; glb[:,2]*=1.15
reg['global']=glb
out['research']={k:{'n':len(v),'b':enc(np.column_stack([(v[:,0]-80)*8,(v[:,1]-80)*8,v[:,2]*1000,v[:,3]*1000]))} for k,v in reg.items()}
print({k:len(v) for k,v in reg.items()})
# ---- card icons (svg, raw)
icons={}
for k,f,vb in [('world','card3',(119.4,120)),('africa','card2',(113.011,120)),('southAmerica','card5',(82.7122,120)),('europe','card4',(120,105.893))]:
    v=np.array(parse(f'svg/{f}.svg'))
    icons[k]={'w':vb[0],'h':vb[1],'d':[[round(a,1),round(b_,1),round(c,2),round(e,2)] for a,b_,c,e in v]}
out['icons']=icons
json.dump(out,open('data.json','w'),separators=(',',':'))
import os; print('data.json KB',os.path.getsize('data.json')//1024)
