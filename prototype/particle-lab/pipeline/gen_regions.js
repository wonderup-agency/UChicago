const d3=require('d3-geo');const topo=require('topojson-client');
const w=require('world-atlas/countries-50m.json');
const C=topo.feature(w,w.objects.countries).features;
const pick=n=>C.find(f=>f.properties.name===n);
function rnd(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const out={};
for (const [key,name,target] of [['china','China',250],['brazil','Brazil',250],['uganda','Uganda',220]]){
  const f=pick(name);
  // largest polygon only for China (drop Taiwan/Hainan noise is fine to keep)
  const p=d3.geoMercator().fitExtent([[6,6],[154,154]],f);
  let sp=12, pts=[];
  for(let it=0;it<30;it++){
    pts=[]; const r=rnd(3);
    for(let row=0,y=4;y<158;row++,y+=sp*0.866){
      for(let x=4+(row%2)*sp/2;x<158;x+=sp){
        const jx=x+(r()-.5)*sp*0.35, jy=y+(r()-.5)*sp*0.35;
        const ll=p.invert([jx,jy]); if(ll&&d3.geoContains(f,ll)) pts.push([jx,jy]);
      }
    }
    if(Math.abs(pts.length-target)<15) break;
    sp*=Math.sqrt(pts.length/target);
  }
  const r=rnd(9);
  out[key]=pts.map(([x,y])=>[+x.toFixed(2),+y.toFixed(2),+(1.7+r()*2.2*r()+r()*0.6).toFixed(2),+(0.68+r()*0.32).toFixed(3)]);
  console.error(key,pts.length,sp.toFixed(2));
}
require('fs').writeFileSync('regions.json',JSON.stringify(out));
