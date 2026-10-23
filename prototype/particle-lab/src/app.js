import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/dist/lil-gui.esm.min.js';

const D = window.PDATA;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => innerWidth < 768;
const HERO_KEYS = ['ring', 'world', 'africa', 'southAmerica', 'europe'];
const HERO_NAMES = ['Anillo', 'Mundo', 'África', 'Sudamérica', 'Europa'];
const RES_KEYS = ['africa', 'china', 'brazil', 'uganda', 'global'];

const P = {
  loop: !reduced, hold: 4, morph: 2.2, delay: 0.35,
  breath: 10, drift: 7, swirl: 0.3,
  mouseRadius: 230, mouseForce: 16, mouseChaos: 0.35,
  pointScale: 1, color: '#7ea0f0', scrollDrag: 1, river: 16, riverBoost: 2.5,
};

/* ---------------- decode Figma dots ---------------- */
function dec(entry, stride) {
  const bin = atob(entry.b), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const a = new Int16Array(u.buffer), out = [];
  for (let i = 0; i < entry.n; i++) {
    const o = i * stride;
    out.push({ x: a[o] / 8, y: a[o + 1] / 8, r: a[o + 2] / 1000, op: a[o + 3] / 1000, e: stride > 4 ? a[o + 4] / 1000 : 1 });
  }
  return out;
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(42);

const hero = HERO_KEYS.map(k => ({ c: D.hero[k].c, dots: dec(D.hero[k], 5) }));
const N = Math.max(...hero.map(h => h.dots.length));
const band = dec(D.band, 4), team = dec(D.team, 4);
const res = RES_KEYS.map(k => dec(D.research[k], 4));

const pack = (r, op) => Math.floor(Math.max(0.2, r) * 100) + Math.min(Math.max(op, 0), 0.999);
function extend(list, n) {
  const out = list.slice();
  while (out.length < n) { const s = list[(R() * list.length) | 0]; out.push({ ...s, x: s.x + (R() - .5) * 6, y: s.y + (R() - .5) * 6, op: 0 }); }
  return out;
}
function toBuf(items) { // items indexed by particle
  const b = new Float32Array(N * 4);
  items.forEach((d, i) => { b[i * 4] = d.x; b[i * 4 + 1] = d.y; b[i * 4 + 2] = pack(d.r, d.op); b[i * 4 + 3] = d.e; });
  return b;
}
const ang = (d, c) => Math.atan2(d.y - c[1], d.x - c[0]);
// assign `items` (length N) to particles ordered by `key`
function assignByKey(key, items, itemKey) {
  const pi = [...Array(N).keys()].sort((a, b) => key[a] - key[b]);
  const it = items.slice().sort((a, b) => itemKey(a) - itemKey(b));
  const out = new Array(N); pi.forEach((p, j) => out[p] = it[j]); return out;
}

/* hero shapes: particle i = angle rank around each shape's hole */
const heroItems = hero.map(h => extend(h.dots, N).sort((a, b) => ang(a, h.c) - ang(b, h.c)));
const heroBufs = heroItems.map(toBuf);

/* band: ordered by the ring's x so the halo "unrolls" into the band */
const ringX = heroItems[0].map(d => d.x);
const bandItems = assignByKey(ringX, extend(band, N), d => d.x);
const bandBuf = toBuf(bandItems);

/* research: a subset of band particles gathers into the dotted graphic */
const visBand = [...Array(N).keys()].filter(i => bandItems[i].op > 0).sort((a, b) => bandItems[a].x - bandItems[b].x);
const M = Math.max(...res.map(r => r.length));
const subset = []; for (let j = 0; j < M; j++) subset.push(visBand[Math.floor((j + 0.5) * visBand.length / M)]);
const inSub = new Set(subset);
const hiddenAround = () => ({ x: (R() - .5) * 1400, y: (R() - .5) * 800, r: 1, op: 0, e: 1 });
const resHidden = [...Array(N)].map(hiddenAround);
const africaExt = extend(res[0], M).sort((a, b) => a.x - b.x);
const africaAt = new Map(); subset.forEach((p, j) => africaAt.set(p, africaExt[j]));
const subByAng = subset.slice().sort((a, b) => ang(africaAt.get(a), [0, 0]) - ang(africaAt.get(b), [0, 0]));
const resBufs = res.map((dots, k) => {
  const items = resHidden.slice();
  if (k === 0) subset.forEach(p => items[p] = africaAt.get(p));
  else { const ext = extend(dots, M).sort((a, b) => ang(a, [0, 0]) - ang(b, [0, 0])); subByAng.forEach((p, j) => items[p] = ext[j]); }
  return toBuf(items);
});

/* dust: faint field behind the card sections */
const dustItems = assignByKey(bandItems.map(d => d.x), [...Array(N)].map(() => {
  const v = R() < 0.32;
  return { x: (R() - .5) * 1500, y: (R() - .5) * 950, r: 0.35 + R() * R() * 1.2, op: v ? 0.25 + R() * 0.35 : 0, e: 1 };
}), d => d.x);
const dustBuf = toBuf(dustItems);
const offBuf = toBuf(dustItems.map(d => ({ ...d, op: 0 })));

/* team: the card's cloud, chosen from dust by x */
const byDustX = [...Array(N).keys()].sort((a, b) => dustItems[a].x - dustItems[b].x);
const teamSorted = team.slice().sort((a, b) => a.x - b.x);
const teamItems = [...Array(N)].map(() => ({ x: (R() - .5) * 1360, y: (R() - .5) * 532, r: 1, op: 0, e: 1 }));
teamSorted.forEach((d, j) => { teamItems[byDustX[Math.floor((j + 0.5) * N / teamSorted.length)]] = d; });
const teamBuf = toBuf(teamItems);

/* ---------------- renderer ---------------- */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0xffffff, 1);
const scene = new THREE.Scene(), camera = new THREE.Camera();

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const U = {
  uTime: { value: 0 }, uDelay: { value: P.delay },
  uHeroBlend: { value: 1 }, uHeroC: { value: new THREE.Vector2() },
  uResBlend: { value: 1 },
  uSeg: { value: 0 }, uFromKind: { value: 0 }, uToKind: { value: 0 },
  uFromAnc: { value: new THREE.Vector4(0, 0, 1, 0) }, uToAnc: { value: new THREE.Vector4(0, 0, 1, 0) },
  uMot: { value: new THREE.Vector2(1, 1) },
  uSwirl: { value: P.swirl }, uBreath: { value: P.breath }, uDrift: { value: P.drift },
  uMouse: { value: new THREE.Vector2() }, uMouseSlow: { value: new THREE.Vector2() },
  uMouseR: { value: P.mouseRadius }, uMouseF: { value: 0 }, uChaos: { value: P.mouseChaos },
  uRes: { value: new THREE.Vector2(1, 1) }, uPR: { value: 1 }, uPoint: { value: P.pointScale }, uVel: { value: 0 },
  uColor: { value: new THREE.Color(P.color) },
  uRiver: { value: P.river }, uRiverT: { value: 0 },
  uBandC: { value: [-91.1, -88.9, -85.1, -80.2, -74.6, -68.2, -60.1, -50.3, -38.9, -26.4, -13.6, -0.9, 11.0, 21.8, 32.0, 41.6, 50.5, 58.2, 64.2, 68.0, 69.6, 68.9, 65.9, 60.7, 53.9, 46.3, 38.7, 31.8, 25.0, 17.4, 8.1, -2.5, -12.7, -21.2, -27.4, -31.4, -34.2] }, uBandW: { value: [91.9, 90.0, 88.0, 85.8, 83.2, 80.8, 78.5, 76.4, 74.4, 72.5, 70.8, 69.3, 68.2, 67.6, 67.3, 67.1, 67.1, 67.6, 68.7, 70.6, 72.8, 74.9, 76.9, 79.3, 82.2, 85.5, 89.1, 92.4, 94.8, 96.7, 98.5, 100.6, 102.6, 104.9, 107.4, 110.2, 112.9] },
};

const material = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false, uniforms: U,
  vertexShader: `
  attribute vec4 aHeroA, aHeroB, aResA, aResB, aSegA, aSegB, aRand;
  uniform float uTime, uDelay, uHeroBlend, uResBlend, uSeg, uFromKind, uToKind, uSwirl, uBreath, uDrift;
  uniform float uMouseR, uMouseF, uChaos, uPR, uPoint, uVel, uRiver, uRiverT;
  uniform float uBandC[37]; uniform float uBandW[37];
  uniform vec4 uFromAnc, uToAnc; uniform vec2 uMot, uHeroC, uRes, uMouse, uMouseSlow;
  varying float vAlpha, vSize;
  ${NOISE}
  float ease(float t){ return t*t*t*(t*(t*6.0-15.0)+10.0); }
  vec2 rot(vec2 v, float a){ float c=cos(a), s=sin(a); return vec2(c*v.x-s*v.y, s*v.x+c*v.y); }
  vec2 curl(vec3 p){ float e=0.12;
    float a=snoise(p+vec3(0.0,e,0.0))-snoise(p-vec3(0.0,e,0.0));
    float b=snoise(p+vec3(e,0.0,0.0))-snoise(p-vec3(e,0.0,0.0));
    return vec2(a,-b)/(2.0*e); }
  // one state = screen position, radius (design px), opacity, motion factor
  void unpack(vec4 v, out vec2 p, out float r, out float o){ p=v.xy; r=floor(v.z)/100.0; o=fract(v.z); }
  void blendPair(vec4 A, vec4 B, float blend, out vec2 p, out float r, out float o, out float e){
    vec2 pa,pb; float ra,rb,oa,ob; unpack(A,pa,ra,oa); unpack(B,pb,rb,ob);
    float t = ease(clamp((blend - aRand.z*uDelay)/(1.0-uDelay),0.0,1.0));
    vec2 d = pb-pa;
    p = mix(pa,pb,t) + vec2(-d.y,d.x)*sin(3.14159*t)*(aRand.w-0.5)*0.35;
    r = mix(ra,rb,t); o = mix(oa,ob,t); e = mix(A.w,B.w,t);
  }
  // band cauce: centerline + width, 40px bins across [-740, 740]
  vec2 bandAt(float x){
    float f = clamp((x + 740.0)/40.0 - 0.5, 0.0, 35.999);
    float i = floor(f), t = f - i;
    float c0 = 0.0, c1 = 0.0, w0 = 1.0, w1 = 1.0;
    for (int k = 0; k < 37; k++) {
      if (float(k) == i) { c0 = uBandC[k]; w0 = uBandW[k]; }
      if (float(k) == i + 1.0) { c1 = uBandC[k]; w1 = uBandW[k]; }
    }
    return vec2(mix(c0, c1, t), mix(w0, w1, t));
  }
  void state(float kind, vec4 seg, vec4 anc, out vec2 px, out float r, out float o, out float m){
    vec2 p; float e;
    if (kind < 0.5) {
      blendPair(aHeroA, aHeroB, uHeroBlend, p, r, o, e);
      m = mix(0.1, 1.0, smoothstep(0.25, 0.8, e));        // calm near the hole edge
      vec2 q = p - uHeroC; float rr = length(q)/500.0;
      float a = uSwirl*(sin(uTime*0.11 + aRand.y*6.2831)*0.05 + snoise(vec3(p*0.003, uTime*0.05))*0.04)*(0.3+rr)*m;
      p = rot(q, a) + uHeroC;
    } else if (kind < 1.5) {
      blendPair(aResA, aResB, uResBlend, p, r, o, e);
      m = 0.12;
    } else {
      unpack(seg, p, r, o); m = 1.0;
      if (abs(anc.w) > 0.5 && abs(anc.w) < 1.5) {
        // slow river along the band: keep each dot's place across the stream
        vec2 b0 = bandAt(p.x);
        float across = (p.y - b0.x) / b0.y;
        float v = uRiver * (0.55 + 0.9*aRand.x) * (1.15 - 0.35*abs(across));
        float xn = mod(p.x + sign(anc.w)*uRiverT*v + 740.0, 1480.0) - 740.0;
        vec2 b1 = bandAt(xn);
        p = vec2(xn, b1.x + across*b1.y);
        o *= smoothstep(740.0, 700.0, abs(xn));
        m = 0.6;
      } else if (anc.w > 1.5) {
        // river bend: flow along the arch from bottom-left, over the top, down the right
        vec2 C = vec2(350.0, 266.0);
        vec2 q = p - C; float rr = max(length(q), 40.0);
        float th = atan(q.y, q.x); if (th < 1.0) th += 6.28318;
        float v = uRiver * 0.9 * (0.55 + 0.9*aRand.x) / rr;
        float tn = 2.95 + mod(th - 2.95 + uRiverT*v, 3.45);
        p = C + rr*vec2(cos(tn), sin(tn));
        o *= smoothstep(2.95, 3.3, tn) * smoothstep(6.40, 6.05, tn);
        o *= smoothstep(680.0, 630.0, abs(p.x)) * smoothstep(266.0, 236.0, abs(p.y));
        m = 0.5;
      }
    }
    px = anc.xy + p*anc.z;
  }
  void main(){
    vec2 fp, tp; float fr, tr, fo, to, fm, tm;
    state(uFromKind, aSegA, uFromAnc, fp, fr, fo, fm);
    state(uToKind, aSegB, uToAnc, tp, tr, to, tm);
    float xn = clamp(fp.x/uRes.x, 0.0, 1.0);
    float dl = mix(aRand.z, xn, 0.55)*0.45;
    float ts = ease(clamp((uSeg - dl)/0.55, 0.0, 1.0));
    vec2 d = tp - fp;
    vec2 px = mix(fp, tp, ts) + vec2(-d.y,d.x)*sin(3.14159*ts)*(aRand.w-0.5)*0.22;
    float r = mix(fr, tr, ts), o = mix(fo, to, ts);
    float s = mix(uFromAnc.z, uToAnc.z, ts);
    float amp = mix(fm*uMot.x, tm*uMot.y, ts) * s;

    px += curl(vec3(px*0.0018, uTime*0.09)) * uBreath * (0.55+0.45*aRand.y) * amp;
    px += curl(vec3(px*0.006+17.0, uTime*0.16)) * uBreath * 0.35 * aRand.w * amp;
    float sp = 0.25 + aRand.x*0.6;
    px += vec2(cos(uTime*sp + aRand.w*6.2831), sin(uTime*sp*1.31 + aRand.z*6.2831)) * uDrift * (0.3+aRand.y) * amp;
    px.y += clamp(uVel*0.035, -60.0, 60.0) * (0.15 + aRand.x);

    vec2 mp = mix(uMouse, uMouseSlow, aRand.z*uChaos);
    vec2 dm = px - mp; float dist = length(dm); vec2 md = dm/max(dist,0.001);
    float edge = 1.0 + uChaos*0.25*snoise(vec3(md*1.2, uTime*0.15));
    float rad = uMouseR * edge * mix(1.0, 0.75+aRand.y*0.5, uChaos);
    float q = dist/rad;
    float fall = exp(-q*q*2.5);                       // soft gaussian, no hard edge
    float str = uMouseF * mix(1.0, 0.6+0.8*aRand.x, uChaos);
    px += (md + vec2(-md.y,md.x)*(aRand.w-0.5)*0.8*uChaos) * fall * str;

    vec2 clip = px/uRes*2.0 - 1.0; clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    float size = 2.0*r*s*uPoint;
    float drawn = max(size, 1.3);
    gl_PointSize = drawn*uPR;
    vSize = drawn*uPR;
    vAlpha = o * min(1.0, (size*size)/(1.69));
  }`,
  fragmentShader: `
  precision mediump float;
  uniform vec3 uColor; varying float vAlpha, vSize;
  void main(){
    float d = length(gl_PointCoord-0.5);
    float a = clamp((0.5-d)*vSize + 0.5, 0.0, 1.0);
    if (a <= 0.0 || vAlpha < 0.004) discard;
    gl_FragColor = vec4(uColor, a*vAlpha);
  }`,
});

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
const rnd = new Float32Array(N * 4); for (let i = 0; i < rnd.length; i++) rnd[i] = R();
geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
const A = b => new THREE.BufferAttribute(b, 4);
const heroAttr = heroBufs.map(A), resAttr = resBufs.map(A);
const segAttr = { band: A(bandBuf), dust: A(dustBuf), team: A(teamBuf), off: A(offBuf) };
geo.setAttribute('aHeroA', heroAttr[0]); geo.setAttribute('aHeroB', heroAttr[0]);
geo.setAttribute('aResA', resAttr[0]); geo.setAttribute('aResB', resAttr[0]);
geo.setAttribute('aSegA', segAttr.dust); geo.setAttribute('aSegB', segAttr.dust);
const points = new THREE.Points(geo, material); points.frustumCulled = false; scene.add(points);
document.getElementById('hN').textContent = N.toLocaleString('en-US');

/* ---------------- timeline of states anchored to the DOM ---------------- */
const KIND = { hero: 0, research: 1, band: 2, dust: 2, team: 2, off: 2 };
const MOT = { hero: 1, research: 1, band: 0.9, dust: 1, team: 0.7, off: 1 };
const keys = [...document.querySelectorAll('[data-p]')].map(el => ({ el, type: el.dataset.p }));
function anchor(k) {
  const r = k.el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  switch (k.type) {
    case 'hero': {
      const s = isMobile() ? Math.min(r.width / 860, r.height / 1100) : r.width / 1440;
      return [r.left + r.width / 2, r.top + r.height / 2 - r.top * 0.28, s, 0];
    }
    case 'band': return [vw / 2, r.top + r.height / 2, vw / 1440, +(k.el.dataset.dir || 1)];
    case 'research': return [r.left + r.width / 2, r.top + r.height / 2, r.width / 160, 0];
    case 'team': return [r.left + r.width / 2, r.top + r.height / 2, r.width / 1360, 2];
    default: return [vw / 2, vh / 2, Math.max(vw / 1440, vh / 900), 0];
  }
}
function focusY(k) { // scroll position where this state is fully formed
  if (k.type === 'hero') return 0;
  const r = k.el.getBoundingClientRect();
  return scrollY + r.top + r.height / 2 - innerHeight / 2;
}
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
function scrollIndex() {
  const f = keys.map(focusY);
  const y = scrollY;
  if (y <= f[0]) return 0;
  for (let i = 0; i < f.length - 1; i++) {
    if (y < f[i + 1]) {
      const raw = (y - f[i]) / Math.max(1, f[i + 1] - f[i]), h = 0.22;
      return i + smoother(Math.min(1, Math.max(0, (raw - h) / (1 - 2 * h))));
    }
  }
  return f.length - 1;
}
const spring = { value: 0, velocity: 0 };
function springTo(s, target, dt, time) { const w = 5 / time, a = Math.exp(-w * dt), o = s.value - target, v = (s.velocity + w * o) * dt; s.value = target + (o + v) * a; s.velocity = (s.velocity - w * v) * a; }
let boundA = -1, boundB = -1;
function bindSeg(i, slot) {
  const t = keys[i].type;
  if (KIND[t] === 2) geo.setAttribute(slot, segAttr[t]);
}

/* ---------------- hero loop ---------------- */
const loop = { from: 0, to: 0, blend: 1, phase: 'hold', t: 0 };
function heroGo(i) {
  loop.from = loop.to; loop.to = i; loop.blend = 0; loop.phase = 'morph'; loop.t = 0;
  geo.setAttribute('aHeroA', heroAttr[loop.from]); geo.setAttribute('aHeroB', heroAttr[loop.to]);
  document.getElementById('hShape').textContent = HERO_NAMES[loop.from] + ' → ' + HERO_NAMES[i];
}
const resLoop = { from: 0, to: 0, blend: 1 };
function resGo(i) {
  if (i === resLoop.to) return;
  resLoop.from = resLoop.to; resLoop.to = i; resLoop.blend = 0;
  geo.setAttribute('aResA', resAttr[resLoop.from]); geo.setAttribute('aResB', resAttr[resLoop.to]);
}

/* ---------------- input ---------------- */
const mouse = { x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, s: 0, ts: 0 };
addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; mouse.tx = e.clientX; mouse.ty = e.clientY; if (mouse.s < 0.01) { mouse.x = mouse.sx = mouse.tx; mouse.y = mouse.sy = mouse.ty; } mouse.ts = 1; });
document.documentElement.addEventListener('pointerleave', () => { mouse.ts = 0; });
let lastY = scrollY, vel = 0;
const river = { t: 0, boost: 1 };
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  U.uRes.value.set(innerWidth, innerHeight); U.uPR.value = renderer.getPixelRatio();
}
addEventListener('resize', resize); resize();

/* ---------------- GUI ---------------- */
const gui = new GUI({ title: 'Partículas · test v2' });
gui.close();
gui.add(P, 'loop').name('loop del Hero');
gui.add({ go: 0 }, 'go', Object.fromEntries(HERO_NAMES.map((n, i) => [n, i]))).name('ir a forma').onChange(v => { P.loop = false; gui.controllers[0].updateDisplay(); heroGo(+v); });
gui.add(P, 'hold', 1, 10, 0.1).name('hold (s)');
gui.add(P, 'morph', 0.5, 5, 0.1).name('morph (s)');
gui.add(P, 'delay', 0, 0.7, 0.01).name('desfase partículas').onChange(v => U.uDelay.value = v);
const fm = gui.addFolder('Motion');
fm.add(P, 'breath', 0, 30, 0.5).name('respiración').onChange(v => U.uBreath.value = v);
fm.add(P, 'drift', 0, 25, 0.5).name('deriva individual').onChange(v => U.uDrift.value = v);
fm.add(P, 'swirl', 0, 1.5, 0.01).name('giro del halo').onChange(v => U.uSwirl.value = v);
fm.add(P, 'scrollDrag', 0, 3, 0.05).name('arrastre por scroll');
fm.add(P, 'river', 0, 60, 0.5).name('velocidad del río').onChange(v => U.uRiver.value = v);
fm.add(P, 'riverBoost', 0, 6, 0.1).name('aceleración al scrollear');
const fmo = gui.addFolder('Mouse');
fmo.add(P, 'mouseRadius', 0, 400, 5).name('radio').onChange(v => U.uMouseR.value = v);
fmo.add(P, 'mouseForce', 0, 120, 1).name('fuerza');
fmo.add(P, 'mouseChaos', 0, 1, 0.01).name('irregularidad').onChange(v => U.uChaos.value = v);
const fl = gui.addFolder('Look');
fl.add(P, 'pointScale', 0.5, 2.5, 0.05).name('escala de punto').onChange(v => U.uPoint.value = v);
fl.addColor(P, 'color').name('color').onChange(v => U.uColor.value.set(v));

/* ---------------- frame ---------------- */
const hState = document.getElementById('hState'), hFps = document.getElementById('hFps');
let last = performance.now(), time = 0, acc = 0, frames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!reduced) time += dt;

  // scroll timeline
  springTo(spring, scrollIndex(), dt, reduced ? 0.01 : 0.45);
  const idx = Math.max(0, Math.min(keys.length - 1, spring.value));
  let a = Math.floor(idx), b = Math.min(keys.length - 1, a + 1); let seg = idx - a;
  if (a === keys.length - 1) { b = a; seg = 0; }
  if (a !== boundA) { bindSeg(a, 'aSegA'); boundA = a; }
  if (b !== boundB) { bindSeg(b, 'aSegB'); boundB = b; }
  const ka = keys[a], kb = keys[b];
  U.uFromKind.value = KIND[ka.type]; U.uToKind.value = KIND[kb.type];
  U.uFromAnc.value.set(...anchor(ka)); U.uToAnc.value.set(...anchor(kb));
  U.uMot.value.set(MOT[ka.type], MOT[kb.type]);
  U.uSeg.value = seg;
  hState.textContent = seg < 0.02 ? ka.type : ka.type + ' → ' + kb.type;

  // hero loop runs only while the hero is the resting state
  if (loop.phase === 'morph') {
    loop.t += dt; loop.blend = reduced ? 1 : Math.min(1, loop.t / P.morph);
    if (loop.blend >= 1) { loop.phase = 'hold'; loop.t = 0; document.getElementById('hShape').textContent = HERO_NAMES[loop.to]; }
  } else if (P.loop && idx < 0.04 && !reduced) {
    loop.t += dt; if (loop.t >= P.hold) heroGo((loop.to + 1) % HERO_KEYS.length);
  }
  U.uHeroBlend.value = loop.blend;
  const ca = hero[loop.from].c, cb = hero[loop.to].c, e = smoother(loop.blend);
  U.uHeroC.value.set(ca[0] + (cb[0] - ca[0]) * e, ca[1] + (cb[1] - ca[1]) * e);
  if (resLoop.blend < 1) resLoop.blend = reduced ? 1 : Math.min(1, resLoop.blend + dt / 1.4);
  U.uResBlend.value = resLoop.blend;

  // scroll velocity (particles lag behind fast scrolls)
  const v = (scrollY - lastY) / Math.max(dt, 1e-3); lastY = scrollY;
  vel += (v - vel) * (1 - Math.exp(-dt * 6));
  U.uVel.value = reduced ? 0 : vel * P.scrollDrag;
  // river speeds up while scrolling, then eases back to its slow pace
  const target = 1 + Math.min(Math.abs(vel) / 450, 1) * P.riverBoost;
  river.boost += (target - river.boost) * (1 - Math.exp(-dt * (target > river.boost ? 2.5 : 0.8)));
  if (!reduced) river.t += dt * river.boost;
  U.uRiverT.value = river.t;

  // mouse
  const k = 1 - Math.exp(-dt * 3.2), ks = 1 - Math.exp(-dt * 0.9);
  mouse.x += (mouse.tx - mouse.x) * k; mouse.y += (mouse.ty - mouse.y) * k;
  mouse.sx += (mouse.tx - mouse.sx) * ks; mouse.sy += (mouse.ty - mouse.sy) * ks;
  mouse.s += (mouse.ts - mouse.s) * (1 - Math.exp(-dt * 1.4));
  U.uMouse.value.set(mouse.x, mouse.y); U.uMouseSlow.value.set(mouse.sx, mouse.sy);
  U.uMouseF.value = P.mouseForce * mouse.s * (reduced ? 0 : 1);

  U.uTime.value = time;
  renderer.render(scene, camera);
  acc += dt; frames++; if (acc > 0.5) { hFps.textContent = (frames / acc).toFixed(0); acc = 0; frames = 0; }
}
renderer.setAnimationLoop(frame);
window.__lab = { heroGo: i => { P.loop = false; heroGo(i); }, resGo, P };

/* =================== micro components =================== */

/* research tabs */
const REG = [
  { tab: 'Africa', k: 'Published paper', t: 'Startups in Africa', d: 'The largest survey of startup founders ever run on the continent — who they are, how they finance growth, and what holds them back.', q: '“Startups in Africa strongly prefer equity over debt — but equity is supplied mainly by foreign investors.”', s1: 4444, s1f: v => v.toLocaleString('en-US'), s1l: 'Founders surveyed across 51 countries', s2: 80, s2f: v => v + '%', s2l: 'of VC deals involve a foreign investor', eg: false },
  { tab: 'China', k: 'Published paper', t: 'Startups in China', d: 'Texto de ejemplo: el resumen de esta investigación lo define el equipo del lab.', q: '“Texto de ejemplo para la cita destacada de esta región.”', s1: 1200, s1f: v => v.toLocaleString('en-US'), s1l: 'Dato de ejemplo', s2: 64, s2f: v => v + '%', s2l: 'Dato de ejemplo', eg: true },
  { tab: 'Brazil', k: 'Working paper', t: 'Startups in Brazil', d: 'Texto de ejemplo: el resumen de esta investigación lo define el equipo del lab.', q: '“Texto de ejemplo para la cita destacada de esta región.”', s1: 950, s1f: v => v.toLocaleString('en-US'), s1l: 'Dato de ejemplo', s2: 58, s2f: v => v + '%', s2l: 'Dato de ejemplo', eg: true },
  { tab: 'Uganda', k: 'Field experiment', t: 'Founders in Uganda', d: 'Texto de ejemplo: el resumen de esta investigación lo define el equipo del lab.', q: '“Texto de ejemplo para la cita destacada de esta región.”', s1: 610, s1f: v => v.toLocaleString('en-US'), s1l: 'Dato de ejemplo', s2: 41, s2f: v => v + '%', s2l: 'Dato de ejemplo', eg: true },
  { tab: 'Global investors', k: 'Survey', t: 'Global private capital investors', d: 'A survey of VC, PE, and angel investors across 108 countries, run with the IFC.', q: '“Texto de ejemplo para la cita destacada de esta región.”', s1: 1848, s1f: v => v.toLocaleString('en-US'), s1l: 'Investors surveyed', s2: 108, s2f: v => String(v), s2l: 'Countries covered', eg: true },
];
const tabsEl = document.getElementById('tabs');
REG.forEach((r, i) => {
  const b = document.createElement('button');
  b.className = 'tab hov'; b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === 0);
  b.innerHTML = `<span>${r.tab}</span><i class="arr"></i>`;
  b.addEventListener('click', () => selectRegion(i));
  b.addEventListener('mouseenter', () => selectRegion(i));
  tabsEl.appendChild(b);
});
function countUp(el, to, fmt, dur = 1100) {
  if (reduced) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = n => { const p = Math.min(1, (n - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(Math.round(to * e)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
let regionIdx = 0;
function selectRegion(i) {
  if (i === regionIdx) return; regionIdx = i;
  [...tabsEl.children].forEach((b, j) => b.setAttribute('aria-selected', j === i));
  resGo(i);
  const r = REG[i], swaps = document.querySelectorAll('.research .swap');
  swaps.forEach(s => s.classList.add('out'));
  setTimeout(() => {
    document.getElementById('rk').textContent = r.k; document.getElementById('rt').textContent = r.t;
    document.getElementById('rd').textContent = r.d; document.getElementById('rq').textContent = r.q;
    document.getElementById('s1l').textContent = r.s1l; document.getElementById('s2l').textContent = r.s2l;
    document.getElementById('reg-eg').hidden = !r.eg;
    swaps.forEach(s => s.classList.remove('out'));
    countUp(document.getElementById('s1'), r.s1, r.s1f, 800); countUp(document.getElementById('s2'), r.s2, r.s2f, 800);
  }, 260);
}
document.getElementById('rd').textContent = REG[0].d; document.getElementById('rq').textContent = REG[0].q;
new IntersectionObserver((ents, ob) => ents.forEach(en => { if (en.isIntersecting) { const r = REG[regionIdx]; countUp(document.getElementById('s1'), r.s1, r.s1f); countUp(document.getElementById('s2'), r.s2, r.s2f); ob.disconnect(); } }), { threshold: 0.6 }).observe(document.querySelector('.stats'));

/* survey */
const SURVEY = [
  ['What type of investor are you?', ['Venture Capital', 'Private Equity / Growth', 'Angel']],
  ['Which stage do you mostly invest in?', ['Pre-seed / Seed', 'Series A–B', 'Growth / Late']],
  ['Where is most of your portfolio?', ['Emerging markets', 'Developed markets', 'Both']],
  ['How large is your typical ticket?', ['Under $1M', '$1M–$10M', 'Over $10M']],
  ['How do you source most deals?', ['Network', 'Inbound', 'Co-investors']],
];
let sStep = 0;
const sq = document.getElementById('sq'), sopts = document.getElementById('sopts');
function renderSurvey() {
  document.getElementById('sprog').textContent = `${Math.min(sStep + 1, 5)} / 5`;
  document.getElementById('sbar').style.transform = `scaleX(${(sStep + 1) / 5})`;
  if (sStep >= SURVEY.length) { sq.textContent = 'Done. See where you stand among 1,848 peers.'; sopts.innerHTML = '<button type="button" class="opt" aria-pressed="true">See my benchmark ↗</button>'; sopts.firstChild.onclick = () => { sStep = 0; swapSurvey(); }; return; }
  const [q, opts] = SURVEY[sStep]; sq.textContent = q; sopts.innerHTML = '';
  opts.forEach((o, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.textContent = o; b.setAttribute('aria-pressed', sStep === 0 && i === 0 ? 'true' : 'false');
    b.onclick = () => { [...sopts.children].forEach(c => c.setAttribute('aria-pressed', c === b)); setTimeout(() => { sStep++; swapSurvey(); }, 380); };
    sopts.appendChild(b); });
}
function swapSurvey() { sq.classList.add('fade'); sopts.classList.add('fade'); setTimeout(() => { renderSurvey(); sq.classList.remove('fade'); sopts.classList.remove('fade'); }, 300); }
renderSurvey();

/* map */
const MAP = window.MAPDATA;
const tier = v => v >= 90 ? ['#1f3fa8', 10] : v >= 80 ? ['#4a7bea', 8] : v >= 70 ? ['#1e8aa0', 7] : ['#7fd0e8', 5.5];
const svgNS = 'http://www.w3.org/2000/svg';
const msvg = document.createElementNS(svgNS, 'svg');
msvg.setAttribute('viewBox', `0 0 ${MAP.W} ${MAP.H}`); msvg.setAttribute('class', 'mapsvg'); msvg.setAttribute('role', 'img'); msvg.setAttribute('aria-label', 'World map of ecosystems');
msvg.innerHTML = `<path class="grat" d="${MAP.grat}"/>` + MAP.countries.map(c => `<path class="c${c.h ? ' h' : ''}" d="${c.d}"><title>${c.n}</title></path>`).join('');
const LABEL = { 'San Francisco Bay': 'l', 'Toronto': 'a', 'Boston': 'r', 'New York': 'b', 'London': 'l', 'Paris': 'b', 'Berlin': 'r', 'Stockholm': 'a', 'Tel Aviv': 'b', 'Nairobi': 'r', 'Beijing': 'a', 'Shenzhen': 'b', 'Singapore': 'r', 'Jakarta': 'b', 'São Paulo': 'r' };
function placeLabel(g, c, r) {
  const n = g.querySelector('.n'), v = g.querySelector('.v'), pl = g.dataset.pl, gap = 6;
  const set = (el, x, y, anchor) => { el.setAttribute('x', x); el.setAttribute('y', y); el.style.textAnchor = anchor; };
  n.textContent = c.n;
  if (pl === 'a') { set(n, c.x, c.y - r - gap - 16, 'middle'); set(v, c.x, c.y - r - gap, 'middle'); }
  else if (pl === 'b') { set(n, c.x, c.y + r + gap + 12, 'middle'); set(v, c.x, c.y + r + gap + 28, 'middle'); }
  else if (pl === 'l') { set(n, c.x - r - gap, c.y - 2, 'end'); set(v, c.x - r - gap, c.y + 14, 'end'); }
  else { set(n, c.x + r + gap, c.y - 2, 'start'); set(v, c.x + r + gap, c.y + 14, 'start'); }
}
const cityG = MAP.cities.map(c => {
  const g = document.createElementNS(svgNS, 'g'); g.setAttribute('class', 'city'); g.setAttribute('tabindex', '0');
  const [col, r] = tier(c.a);
  const pl = LABEL[c.n] || 'a';
  g.dataset.pl = pl;
  g.innerHTML = `<circle class="ring" cx="${c.x}" cy="${c.y}" r="${r}" stroke="${col}"/><circle class="dot" cx="${c.x}" cy="${c.y}" r="${r}" fill="${col}"/><text class="n"></text><text class="v" fill="${col}">${c.a}</text>`;
  placeLabel(g, c, r);
  msvg.appendChild(g); return { g, c };
});
document.getElementById('mapwrap').appendChild(msvg);
let metric = 'a';
const tip = document.getElementById('tip'), mapcard = document.getElementById('mapcard');
function setMetric(m) {
  metric = m;
  document.getElementById('mA').setAttribute('aria-pressed', m === 'a'); document.getElementById('mB').setAttribute('aria-pressed', m === 'b');
  document.getElementById('mEg').hidden = m === 'a';
  cityG.forEach(({ g, c }, i) => setTimeout(() => {
    const v = c[m], [col, r] = tier(v);
    const dot = g.querySelector('.dot'), ring = g.querySelector('.ring'), tv = g.querySelector('.v'), tn = g.querySelector('.n');
    dot.setAttribute('r', r); dot.setAttribute('fill', col); ring.setAttribute('r', r); ring.setAttribute('stroke', col);
    tv.setAttribute('fill', col); placeLabel(g, c, r);
    const from = parseFloat(tv.textContent), t0 = performance.now();
    const step = n => { const p = Math.min(1, (n - t0) / 600); tv.textContent = (from + (v - from) * (1 - Math.pow(1 - p, 3))).toFixed(1).replace(/\.0$/, ''); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, reduced ? 0 : i * 35));
}
document.getElementById('mA').onclick = () => setMetric('a'); document.getElementById('mB').onclick = () => setMetric('b');
cityG.forEach(({ g, c }) => {
  const show = () => {
    const rc = mapcard.getBoundingClientRect(), rd = g.querySelector('.dot').getBoundingClientRect();
    tip.innerHTML = `<b>${c.n}</b>${metric === 'a' ? 'Active Unicorns' : 'Startup Activity (ejemplo)'} · ${c[metric]}`;
    tip.style.left = (rd.left + rd.width / 2 - rc.left) + 'px'; tip.style.top = (rd.top - rc.top) + 'px'; tip.style.opacity = 1;
    g.classList.add('on');
  };
  const hide = () => { tip.style.opacity = 0; g.classList.remove('on'); };
  g.addEventListener('mouseenter', show); g.addEventListener('mouseleave', hide); g.addEventListener('focus', show); g.addEventListener('blur', hide);
});

/* country report cards with Figma dot icons */
const CARDS = [
  { k: 'world', t: 'The world', evi: 'EVI 74.1', d: 'We track 16 high-growth ecosystems across 13 countries, scored on ~30 sourced measures each. Average Ecosystem Vitality Index: 74.1 of 100. Every figure links back to the measures behind our country reports.' },
  { k: 'africa', t: 'Africa', evi: 'EVI 47.8', d: 'We track 1 ecosystem in Africa (Nairobi). Average Ecosystem Vitality Index: 47.8 of 100, with narratives & sentiment as the strongest pillar (63). Every figure links back to our country reports.' },
  { k: 'southAmerica', t: 'South America', evi: 'EVI 58.0', d: 'We track 1 ecosystem in South America (São Paulo). Average Ecosystem Vitality Index: 58.0 of 100, with startup activity as the strongest pillar (70). Every figure links back to our country reports.' },
  { k: 'europe', t: 'Europe', evi: 'EVI 76.0', d: 'We track ecosystems in Berlin, London, Paris, and Stockholm. Every figure links back to the sourced measures behind our country reports.', eg: true },
];
const ccards = document.getElementById('ccards');
CARDS.forEach((c, ci) => {
  const ic = D.icons[c.k];
  const el = document.createElement('article'); el.className = 'ccard hov' + (ci === 0 ? ' active' : ''); el.tabIndex = 0;
  const circles = ic.d.map(([x, y, r, o]) => `<g class="in"><circle cx="${x}" cy="${y}" r="${r}" fill="#7ea0f0" fill-opacity="${o}"/></g>`).join('');
  el.innerHTML = `<div class="ico"><svg width="${ic.w}" height="${ic.h}" viewBox="0 0 ${ic.w} ${ic.h}" aria-hidden="true">${circles}</svg></div><span class="go"><i class="arr"></i></span><h3>${c.t}</h3><div class="evi">${c.evi}${c.eg ? ' <span class="eg">(ejemplo)</span>' : ''}</div><p>${c.d}</p><a class="link" href="#reports"><span>Generate report</span><i class="arr"></i></a>`;
  ccards.appendChild(el);
  const svg = el.querySelector('svg'), dots = [...svg.querySelectorAll('circle')].map((n, i) => ({ n, x: +ic.d[i][0], y: +ic.d[i][1] }));
  el.addEventListener('mouseenter', () => { ccards.querySelectorAll('.ccard').forEach(x => x.classList.toggle('active', x === el)); });
  el.addEventListener('mousemove', e => {
    if (reduced) return;
    const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) * ic.w / r.width, my = (e.clientY - r.top) * ic.h / r.height;
    dots.forEach(d => { const dx = d.x - mx, dy = d.y - my, dist = Math.hypot(dx, dy), f = Math.max(0, 1 - dist / 46);
      const g = f * f * (3 - 2 * f); d.n.style.transform = g > 0 ? `translate(${dx / dist * g * 4}px, ${dy / dist * g * 4}px) scale(${1 + g * 0.18})` : ''; });
  });
  el.addEventListener('mouseleave', () => dots.forEach(d => d.n.style.transform = ''));
  // intro: every dot starts below the icon and rises into its place
  const groups = [...svg.querySelectorAll('g.in')].map((g, i) => ({ g, x: ic.d[i][0], y: ic.d[i][1], r1: R(), r2: R() }));
  const hideDots = () => groups.forEach(o => { o.g.style.transition = 'none'; o.g.style.opacity = 0;
    o.g.style.transform = `translate(${(o.r1 - .5) * 24}px, ${ic.h - o.y + 50 + o.r2 * 90}px)`; });
  const showDots = () => groups.forEach(o => {
    const delay = ci * 0.12 + o.r1 * 0.55 + (1 - o.y / ic.h) * 0.35;
    o.g.style.transition = `transform 1.6s cubic-bezier(.16,1,.3,1) ${delay}s, opacity .9s ease ${delay}s`;
    o.g.style.opacity = 1; o.g.style.transform = 'translate(0,0)'; });
  if (!reduced) {
    hideDots();
    let shown = false;
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && en.intersectionRatio > 0.35 && !shown) { shown = true; requestAnimationFrame(() => requestAnimationFrame(showDots)); }
      else if (!en.isIntersecting && shown) { shown = false; hideDots(); }
    }, { threshold: [0, 0.35] }).observe(el);
  }
  el.addEventListener('mouseenter', () => { if (reduced) return; dots.forEach(d => { d.n.style.transitionDelay = (d.x / ic.w * 0.18) + 's'; d.n.style.transform = 'scale(1.12)'; setTimeout(() => { d.n.style.transitionDelay = '0s'; d.n.style.transform = ''; }, 420 + d.x / ic.w * 260); }); });
});

/* news heading reveal on scroll */
const nh = document.getElementById('newsH');
nh.innerHTML = nh.textContent.split(' ').map(w => `<span class="w">${w}</span>`).join(' ');
const words = [...nh.querySelectorAll('.w')];
addEventListener('scroll', () => { const r = nh.getBoundingClientRect(), p = 1 - (r.top - innerHeight * 0.35) / (innerHeight * 0.45); words.forEach((w, i) => w.classList.toggle('lit', p > (i + 1) / (words.length + 1))); }, { passive: true });

/* footer */
document.getElementById('word').innerHTML = [...'Chicago Booth'].map(ch => `<span aria-hidden="true">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
document.getElementById('fform').addEventListener('submit', e => { e.preventDefault(); const b = document.getElementById('fbtn'); b.querySelector('span').textContent = 'Subscribed'; setTimeout(() => b.querySelector('span').textContent = 'Subscribe', 2400); });
