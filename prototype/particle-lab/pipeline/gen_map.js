const d3=require('d3-geo');const topo=require('topojson-client');
const w=require('world-atlas/countries-110m.json');
const feats=topo.feature(w,w.objects.countries).features.filter(f=>f.properties.name!=='Antarctica');
const fc={type:'FeatureCollection',features:feats};
const W=1360,H=720;
const p=d3.geoNaturalEarth1().rotate([-10,0]).fitExtent([[30,40],[W-30,H-20]],fc);
const path=d3.geoPath(p);
const r=s=>s.replace(/(\d+\.\d)\d+/g,'$1');
const hi=new Set(['United States of America','Canada','Brazil','China','United Kingdom','Sweden','Germany','France','Israel','Kenya','Singapore','Indonesia']);
const countries=feats.map(f=>({n:f.properties.name,d:r(path(f)),h:hi.has(f.properties.name)?1:0}));
// Active Unicorns scores from Figma; Startup Activity = example values
const cities=[
 ['San Francisco Bay',-122.27,37.8,95,91],['Toronto',-79.38,43.65,63.4,70.2],['Boston',-71.06,42.36,70.3,74.8],['New York',-74.0,40.71,81.3,84.6],
 ['London',-0.13,51.51,73,79.5],['Paris',2.35,48.86,62.3,68.1],['Berlin',13.4,52.52,64.9,72.4],['Stockholm',18.07,59.33,67.9,66.3],
 ['Tel Aviv',34.78,32.08,88.4,83.9],['Nairobi',36.82,-1.29,63.4,71.7],['Beijing',116.4,39.9,94.4,86.2],['Shenzhen',114.06,22.54,87.8,90.1],
 ['Singapore',103.82,1.35,72.6,77.4],['Jakarta',106.85,-6.21,67.5,73.0],['São Paulo',-46.63,-23.55,68.3,75.6],['Bangalore',77.59,12.97,71.2,80.8]
].map(([n,lon,lat,a,b])=>{const [x,y]=p([lon,lat]);return {n,x:+x.toFixed(1),y:+y.toFixed(1),a,b};});
const grat=r(path(d3.geoGraticule().step([30,30])()));
require('fs').writeFileSync('map.json',JSON.stringify({W,H,countries,cities,grat}));
console.log(JSON.stringify(require('fs').statSync('map.json').size));
