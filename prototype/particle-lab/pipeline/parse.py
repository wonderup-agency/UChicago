import re,json,sys
out={}
for name in ['ring','world','africa','sam','europe']:
    s=open(name+'.svg').read()
    dots=[]
    for m in re.finditer(r'<path id="dots-(\d+)" d="([^"]+)" fill="#7EA0F0"(?: fill-opacity="([\d.]+)")?',s):
        k,d,op=m.groups(); op=float(op or 1)
        for sub in d.split('M')[1:]:
            nums=list(map(float,re.findall(r'-?\d*\.?\d+(?:e-?\d+)?',sub)))
            xs=nums[0::2]; ys=nums[1::2]
            x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
            dots.append(((x0+x1)/2,(y0+y1)/2,(x1-x0)/2,op))
    W=1413 if name=='world' else 1440
    xs=[d[0] for d in dots]; ys=[d[1] for d in dots]; rs=[d[2] for d in dots]
    rs_sorted=sorted(rs)
    print(name,len(dots),'x',round(min(xs)),round(max(xs)),'y',round(min(ys)),round(max(ys)),'r min/med/max',round(rs_sorted[0],2),round(rs_sorted[len(rs)//2],2),round(rs_sorted[-1],2))
    out[name]={'W':W,'dots':dots}
json.dump(out,open('dots_raw.json','w'))
