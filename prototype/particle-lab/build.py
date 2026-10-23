# Inyecta datos + JS en el template y genera particle-lab.html (abrir con un server local)
import os
H=os.path.dirname(os.path.abspath(__file__))
r=lambda p: open(os.path.join(H,p)).read()
s=r('src/template.html').replace('__DATA__',r('data/data.json')).replace('__MAP__',r('data/map.json')).replace('__JS__',r('src/app.js'))
open(os.path.join(H,'particle-lab.html'),'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">'+s+'</body></html>')
print('particle-lab.html OK')
