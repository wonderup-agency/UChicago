import re,json
def subdots(d):
    res=[]
    for sub in re.split(r'(?=M)',d)[1:]:
        nums=list(map(float,re.findall(r'-?\d*\.?\d+(?:e-?\d+)?',sub)))
        xs=nums[0::2]; ys=nums[1::2]
        res.append(((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,(max(xs)-min(xs))/2))
    return res
def parse(fn, color='#7EA0F0'):
    s=open(fn).read(); dots=[]
    for m in re.finditer(r'<path([^>]*)>',s):
        a=m.group(1)
        if f'fill="{color}"' not in a: continue
        d=re.search(r' d="([^"]+)"',a).group(1)
        op=1.0
        for k in ['fill-opacity','opacity']:
            mm=re.search(rf' {k}="([\d.]+)"',a)
            if mm: op*=float(mm.group(1))
        for x,y,r in subdots(d): dots.append((x,y,r,op))
    return dots
if __name__=='__main__':
    import collections
    b=parse('band.svg')
    ys=[d[1] for d in b]; xs=[d[0] for d in b]
    print('band',len(b),min(xs),max(xs),min(ys),max(ys))
    h=collections.Counter(int(y//100)*100 for y in ys); print(sorted(h.items()))
    t=parse('team_full.svg'); print('team',len(t),min(d[0] for d in t),max(d[0] for d in t),min(d[1] for d in t),max(d[1] for d in t), sorted(set(round(d[2],1) for d in t))[:3], max(d[2] for d in t))
    g=parse('gafrica.svg'); print('gafrica',len(g))
    for i in range(1,8):
        c=parse(f'card{i}.svg'); print('card',i,len(c), max(d[2] for d in c))
