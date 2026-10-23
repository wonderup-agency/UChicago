// --------------------------------------------------
// particle-field
// --------------------------------------------------
// One fixed WebGL canvas behind the whole page. Particles morph between
// states anchored to DOM elements with data-particles-state:
//   hero      → looping shapes (ring → world → africa → south america → europe)
//   flow      → river band (data-flow, data-dir="1|-1")
//   research  → dotted region graphic (driven by research-tabs)
//   dust      → faint field behind card sections
//   team      → river bend inside the Team card
//   off       → hidden
// Reduced motion: static shapes, no loop. No WebGL / software GPU: no canvas.
// --------------------------------------------------
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderer,
} from 'three'
import { loadJson, reducedMotion } from '../utils/motion.js'
import '../styles/particle-field.css'

const HERO_KEYS = ['ring', 'world', 'africa', 'southAmerica', 'europe']
const RES_KEYS = ['africa', 'china', 'brazil', 'uganda', 'global']
const P = {
  hold: 4,
  morph: 2.2,
  delay: 0.35,
  breath: 10,
  drift: 7,
  swirl: 0.3,
  mouseRadius: 230,
  mouseForce: 16,
  mouseChaos: 0.35,
  color: '#7ea0f0',
  scrollDrag: 1,
  river: 16,
  riverBoost: 2.5,
}
const KIND = { hero: 0, research: 1, band: 2, dust: 2, team: 2, off: 2 }
const MOT = { hero: 1, research: 1, band: 0.9, dust: 1, team: 0.7, off: 1 }
const BAND_C = [
  -91.1, -88.9, -85.1, -80.2, -74.6, -68.2, -60.1, -50.3, -38.9, -26.4, -13.6,
  -0.9, 11.0, 21.8, 32.0, 41.6, 50.5, 58.2, 64.2, 68.0, 69.6, 68.9, 65.9, 60.7,
  53.9, 46.3, 38.7, 31.8, 25.0, 17.4, 8.1, -2.5, -12.7, -21.2, -27.4, -31.4,
  -34.2,
]
const BAND_W = [
  91.9, 90.0, 88.0, 85.8, 83.2, 80.8, 78.5, 76.4, 74.4, 72.5, 70.8, 69.3, 68.2,
  67.6, 67.3, 67.1, 67.1, 67.6, 68.7, 70.6, 72.8, 74.9, 76.9, 79.3, 82.2, 85.5,
  89.1, 92.4, 94.8, 96.7, 98.5, 100.6, 102.6, 104.9, 107.4, 110.2, 112.9,
]

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
}`

const VERTEX = `
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
void unpack(vec4 v, out vec2 p, out float r, out float o){ p=v.xy; r=floor(v.z)/100.0; o=fract(v.z); }
void blendPair(vec4 A, vec4 B, float blend, out vec2 p, out float r, out float o, out float e){
  vec2 pa,pb; float ra,rb,oa,ob; unpack(A,pa,ra,oa); unpack(B,pb,rb,ob);
  float t = ease(clamp((blend - aRand.z*uDelay)/(1.0-uDelay),0.0,1.0));
  vec2 d = pb-pa;
  p = mix(pa,pb,t) + vec2(-d.y,d.x)*sin(3.14159*t)*(aRand.w-0.5)*0.35;
  r = mix(ra,rb,t); o = mix(oa,ob,t); e = mix(A.w,B.w,t);
}
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
    m = mix(0.1, 1.0, smoothstep(0.25, 0.8, e));
    vec2 q = p - uHeroC; float rr = length(q)/500.0;
    float a = uSwirl*(sin(uTime*0.11 + aRand.y*6.2831)*0.05 + snoise(vec3(p*0.003, uTime*0.05))*0.04)*(0.3+rr)*m;
    p = rot(q, a) + uHeroC;
  } else if (kind < 1.5) {
    blendPair(aResA, aResB, uResBlend, p, r, o, e);
    m = 0.12;
  } else {
    unpack(seg, p, r, o); m = 1.0;
    if (abs(anc.w) > 0.5 && abs(anc.w) < 1.5) {
      vec2 b0 = bandAt(p.x);
      float across = (p.y - b0.x) / b0.y;
      float v = uRiver * (0.55 + 0.9*aRand.x) * (1.15 - 0.35*abs(across));
      float xn = mod(p.x + sign(anc.w)*uRiverT*v + 740.0, 1480.0) - 740.0;
      vec2 b1 = bandAt(xn);
      p = vec2(xn, b1.x + across*b1.y);
      o *= smoothstep(740.0, 700.0, abs(xn));
      m = 0.6;
    } else if (anc.w > 1.5) {
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
  float fall = exp(-q*q*2.5);
  float str = uMouseF * mix(1.0, 0.6+0.8*aRand.x, uChaos);
  px += (md + vec2(-md.y,md.x)*(aRand.w-0.5)*0.8*uChaos) * fall * str;
  vec2 clip = px/uRes*2.0 - 1.0; clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  float size = 2.0*r*s*uPoint;
  float drawn = max(size, 1.3);
  gl_PointSize = drawn*uPR;
  vSize = drawn*uPR;
  vAlpha = o * min(1.0, (size*size)/(1.69));
}`

const FRAGMENT = `
precision mediump float;
uniform vec3 uColor; varying float vAlpha, vSize;
void main(){
  float d = length(gl_PointCoord-0.5);
  float a = clamp((0.5-d)*vSize + 0.5, 0.0, 1.0);
  if (a <= 0.0 || vAlpha < 0.004) discard;
  gl_FragColor = vec4(uColor, a*vAlpha);
}`

// ── helpers ──────────────────────────────────────────────────────────
function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function decode(entry, stride) {
  const bin = window.atob(entry.b)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  const a = new Int16Array(u.buffer)
  const out = []
  for (let i = 0; i < entry.n; i++) {
    const o = i * stride
    out.push({
      x: a[o] / 8,
      y: a[o + 1] / 8,
      r: a[o + 2] / 1000,
      op: a[o + 3] / 1000,
      e: stride > 4 ? a[o + 4] / 1000 : 1,
    })
  }
  return out
}

function hasUsableWebGL() {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl')
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ''
    return !/swiftshader|llvmpipe|software/i.test(String(name))
  } catch {
    return false
  }
}

// Builds every particle state buffer from the Figma dot data.
function buildStates(D) {
  const R = rng(42)
  const hero = HERO_KEYS.map((k) => ({
    c: D.hero[k].c,
    dots: decode(D.hero[k], 5),
  }))
  const N = Math.max(...hero.map((h) => h.dots.length))
  const band = decode(D.band, 4)
  const team = decode(D.team, 4)
  const res = RES_KEYS.map((k) => decode(D.research[k], 4))

  const pack = (r, op) =>
    Math.floor(Math.max(0.2, r) * 100) + Math.min(Math.max(op, 0), 0.999)
  const extend = (list, n) => {
    const out = list.slice()
    while (out.length < n) {
      const s = list[(R() * list.length) | 0]
      out.push({
        ...s,
        x: s.x + (R() - 0.5) * 6,
        y: s.y + (R() - 0.5) * 6,
        op: 0,
      })
    }
    return out
  }
  const toBuf = (items) => {
    const b = new Float32Array(N * 4)
    items.forEach((d, i) => {
      b[i * 4] = d.x
      b[i * 4 + 1] = d.y
      b[i * 4 + 2] = pack(d.r, d.op)
      b[i * 4 + 3] = d.e
    })
    return b
  }
  const ang = (d, c) => Math.atan2(d.y - c[1], d.x - c[0])
  const assignByKey = (key, items, itemKey) => {
    const pi = [...Array(N).keys()].sort((a, b) => key[a] - key[b])
    const it = items.slice().sort((a, b) => itemKey(a) - itemKey(b))
    const out = new Array(N)
    pi.forEach((p, j) => (out[p] = it[j]))
    return out
  }

  const heroItems = hero.map((h) =>
    extend(h.dots, N).sort((a, b) => ang(a, h.c) - ang(b, h.c))
  )
  const heroBufs = heroItems.map(toBuf)

  const ringX = heroItems[0].map((d) => d.x)
  const bandItems = assignByKey(ringX, extend(band, N), (d) => d.x)
  const bandBuf = toBuf(bandItems)

  const visBand = [...Array(N).keys()]
    .filter((i) => bandItems[i].op > 0)
    .sort((a, b) => bandItems[a].x - bandItems[b].x)
  const M = Math.max(...res.map((r) => r.length))
  const subset = []
  for (let j = 0; j < M; j++)
    subset.push(visBand[Math.floor(((j + 0.5) * visBand.length) / M)])
  const resHidden = [...Array(N)].map(() => ({
    x: (R() - 0.5) * 1400,
    y: (R() - 0.5) * 800,
    r: 1,
    op: 0,
    e: 1,
  }))
  const africaExt = extend(res[0], M).sort((a, b) => a.x - b.x)
  const africaAt = new Map()
  subset.forEach((p, j) => africaAt.set(p, africaExt[j]))
  const subByAng = subset
    .slice()
    .sort((a, b) => ang(africaAt.get(a), [0, 0]) - ang(africaAt.get(b), [0, 0]))
  const resBufs = res.map((dots, k) => {
    const items = resHidden.slice()
    if (k === 0) subset.forEach((p) => (items[p] = africaAt.get(p)))
    else {
      const ext = extend(dots, M).sort(
        (a, b) => ang(a, [0, 0]) - ang(b, [0, 0])
      )
      subByAng.forEach((p, j) => (items[p] = ext[j]))
    }
    return toBuf(items)
  })

  const dustItems = assignByKey(
    bandItems.map((d) => d.x),
    [...Array(N)].map(() => {
      const v = R() < 0.32
      return {
        x: (R() - 0.5) * 1500,
        y: (R() - 0.5) * 950,
        r: 0.35 + R() * R() * 1.2,
        op: v ? 0.25 + R() * 0.35 : 0,
        e: 1,
      }
    }),
    (d) => d.x
  )
  const dustBuf = toBuf(dustItems)
  const offBuf = toBuf(dustItems.map((d) => ({ ...d, op: 0 })))

  const byDustX = [...Array(N).keys()].sort(
    (a, b) => dustItems[a].x - dustItems[b].x
  )
  const teamSorted = team.slice().sort((a, b) => a.x - b.x)
  const teamItems = [...Array(N)].map(() => ({
    x: (R() - 0.5) * 1360,
    y: (R() - 0.5) * 532,
    r: 1,
    op: 0,
    e: 1,
  }))
  teamSorted.forEach((d, j) => {
    teamItems[byDustX[Math.floor(((j + 0.5) * N) / teamSorted.length)]] = d
  })
  const teamBuf = toBuf(teamItems)

  const rand = new Float32Array(N * 4)
  for (let i = 0; i < rand.length; i++) rand[i] = R()

  return {
    N,
    heroCenters: hero.map((h) => h.c),
    heroBufs,
    resBufs,
    seg: { band: bandBuf, dust: dustBuf, team: teamBuf, off: offBuf },
    rand,
  }
}

// DOM anchors in document order. Consecutive research graphics (one per tab
// pane) collapse into one key that always points at the visible pane.
function collectKeys() {
  const keys = []
  document.querySelectorAll('[data-particles-state]').forEach((el) => {
    let type = el.dataset.particlesState
    if (type === 'flow') type = 'band'
    if (!(type in KIND)) return
    const last = keys[keys.length - 1]
    if (type === 'research' && last && last.type === 'research') {
      last.els.push(el)
      return
    }
    keys.push({ type, els: [el], dir: +(el.dataset.dir || 1) })
  })
  keys.forEach((k) => {
    k.el = () => k.els.find((e) => e.offsetParent !== null) || k.els[0]
  })
  return keys
}

export default async function (elements) {
  const host = elements[0]
  if (!host || !hasUsableWebGL()) return

  let D
  try {
    D = await loadJson('particles.json')
  } catch (error) {
    console.error('[particle-field] data failed to load', error)
    return
  }

  const reduced = reducedMotion()
  const isMobile = () => window.innerWidth < 768
  const S = buildStates(D)
  const N = S.N

  const canvas = document.createElement('canvas')
  canvas.className = 'particle-field_canvas'
  canvas.setAttribute('aria-hidden', 'true')
  host.appendChild(canvas)

  let renderer
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    })
  } catch {
    canvas.remove()
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  const camera = new Camera()

  const U = {
    uTime: { value: 0 },
    uDelay: { value: P.delay },
    uHeroBlend: { value: 1 },
    uHeroC: { value: new Vector2() },
    uResBlend: { value: 1 },
    uSeg: { value: 0 },
    uFromKind: { value: 0 },
    uToKind: { value: 0 },
    uFromAnc: { value: new Vector4(0, 0, 1, 0) },
    uToAnc: { value: new Vector4(0, 0, 1, 0) },
    uMot: { value: new Vector2(1, 1) },
    uSwirl: { value: P.swirl },
    uBreath: { value: P.breath },
    uDrift: { value: P.drift },
    uMouse: { value: new Vector2() },
    uMouseSlow: { value: new Vector2() },
    uMouseR: { value: P.mouseRadius },
    uMouseF: { value: 0 },
    uChaos: { value: P.mouseChaos },
    uRes: { value: new Vector2(1, 1) },
    uPR: { value: 1 },
    uPoint: { value: 1 },
    uVel: { value: 0 },
    uColor: { value: new Color(P.color) },
    uRiver: { value: P.river },
    uRiverT: { value: 0 },
    uBandC: { value: BAND_C },
    uBandW: { value: BAND_W },
  }
  const material = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: U,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  })

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3))
  geo.setAttribute('aRand', new BufferAttribute(S.rand, 4))
  const attr = (b) => new BufferAttribute(b, 4)
  const heroAttr = S.heroBufs.map(attr)
  const resAttr = S.resBufs.map(attr)
  const segAttr = Object.fromEntries(
    Object.entries(S.seg).map(([k, b]) => [k, attr(b)])
  )
  geo.setAttribute('aHeroA', heroAttr[0])
  geo.setAttribute('aHeroB', heroAttr[0])
  geo.setAttribute('aResA', resAttr[0])
  geo.setAttribute('aResB', resAttr[0])
  geo.setAttribute('aSegA', segAttr.dust)
  geo.setAttribute('aSegB', segAttr.dust)
  const points = new Points(geo, material)
  points.frustumCulled = false
  scene.add(points)

  // ── timeline anchored to the DOM ─────────────────────────────────
  const keys = collectKeys()
  if (!keys.length) return
  const anchor = (k) => {
    const r = k.el().getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    switch (k.type) {
      case 'hero': {
        const s = isMobile()
          ? Math.min(r.width / 860, r.height / 1100)
          : r.width / 1440
        return [r.left + r.width / 2, r.top + r.height / 2 - r.top * 0.28, s, 0]
      }
      case 'band':
        return [vw / 2, r.top + r.height / 2, vw / 1440, k.dir]
      case 'research':
        return [r.left + r.width / 2, r.top + r.height / 2, r.width / 160, 0]
      case 'team':
        return [r.left + r.width / 2, r.top + r.height / 2, r.width / 1360, 2]
      default:
        return [vw / 2, vh / 2, Math.max(vw / 1440, vh / 900), 0]
    }
  }
  const focusY = (k) => {
    if (k.type === 'hero') return 0
    const r = k.el().getBoundingClientRect()
    return window.scrollY + r.top + r.height / 2 - window.innerHeight / 2
  }
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10)
  const scrollIndex = () => {
    const f = keys.map(focusY)
    const y = window.scrollY
    if (y <= f[0]) return 0
    for (let i = 0; i < f.length - 1; i++) {
      if (y < f[i + 1]) {
        const raw = (y - f[i]) / Math.max(1, f[i + 1] - f[i])
        const h = 0.22
        return i + smoother(Math.min(1, Math.max(0, (raw - h) / (1 - 2 * h))))
      }
    }
    return f.length - 1
  }
  const spring = { value: 0, velocity: 0 }
  const springTo = (s, target, dt, time) => {
    const w = 5 / time
    const a = Math.exp(-w * dt)
    const o = s.value - target
    const v = (s.velocity + w * o) * dt
    s.value = target + (o + v) * a
    s.velocity = (s.velocity - w * v) * a
  }
  let boundA = -1
  let boundB = -1
  const bindSeg = (i, slot) => {
    const t = keys[i].type
    if (KIND[t] === 2) geo.setAttribute(slot, segAttr[t])
  }

  // ── hero loop + research morph ───────────────────────────────────
  const loop = { from: 0, to: 0, blend: 1, phase: 'hold', t: 0 }
  const heroGo = (i) => {
    loop.from = loop.to
    loop.to = i
    loop.blend = 0
    loop.phase = 'morph'
    loop.t = 0
    geo.setAttribute('aHeroA', heroAttr[loop.from])
    geo.setAttribute('aHeroB', heroAttr[loop.to])
  }
  const resLoop = { from: 0, to: 0, blend: 1 }
  const resGo = (i) => {
    if (i === resLoop.to || !resAttr[i]) return
    resLoop.from = resLoop.to
    resLoop.to = i
    resLoop.blend = 0
    geo.setAttribute('aResA', resAttr[resLoop.from])
    geo.setAttribute('aResB', resAttr[resLoop.to])
  }
  window.addEventListener('research:change', (e) => resGo(e.detail.index))

  // ── input ────────────────────────────────────────────────────────
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, s: 0, ts: 0 }
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return
    mouse.tx = e.clientX
    mouse.ty = e.clientY
    if (mouse.s < 0.01) {
      mouse.x = mouse.sx = mouse.tx
      mouse.y = mouse.sy = mouse.ty
    }
    mouse.ts = 1
  })
  document.documentElement.addEventListener(
    'pointerleave',
    () => (mouse.ts = 0)
  )

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    U.uRes.value.set(window.innerWidth, window.innerHeight)
    U.uPR.value = renderer.getPixelRatio()
  }
  window.addEventListener('resize', resize)
  resize()

  // ── frame ────────────────────────────────────────────────────────
  let lastY = window.scrollY
  let vel = 0
  const river = { t: 0, boost: 1 }
  let last = performance.now()
  let time = 0
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!reduced) time += dt

    springTo(spring, scrollIndex(), dt, reduced ? 0.01 : 0.45)
    const idx = Math.max(0, Math.min(keys.length - 1, spring.value))
    let a = Math.floor(idx)
    let b = Math.min(keys.length - 1, a + 1)
    let seg = idx - a
    if (a === keys.length - 1) {
      b = a
      seg = 0
    }
    if (a !== boundA) {
      bindSeg(a, 'aSegA')
      boundA = a
    }
    if (b !== boundB) {
      bindSeg(b, 'aSegB')
      boundB = b
    }
    const ka = keys[a]
    const kb = keys[b]
    U.uFromKind.value = KIND[ka.type]
    U.uToKind.value = KIND[kb.type]
    U.uFromAnc.value.set(...anchor(ka))
    U.uToAnc.value.set(...anchor(kb))
    U.uMot.value.set(MOT[ka.type], MOT[kb.type])
    U.uSeg.value = seg

    if (loop.phase === 'morph') {
      loop.t += dt
      loop.blend = reduced ? 1 : Math.min(1, loop.t / P.morph)
      if (loop.blend >= 1) {
        loop.phase = 'hold'
        loop.t = 0
      }
    } else if (!reduced && idx < 0.04) {
      loop.t += dt
      if (loop.t >= P.hold) heroGo((loop.to + 1) % HERO_KEYS.length)
    }
    U.uHeroBlend.value = loop.blend
    const ca = S.heroCenters[loop.from]
    const cb = S.heroCenters[loop.to]
    const e = smoother(loop.blend)
    U.uHeroC.value.set(ca[0] + (cb[0] - ca[0]) * e, ca[1] + (cb[1] - ca[1]) * e)
    if (resLoop.blend < 1)
      resLoop.blend = reduced ? 1 : Math.min(1, resLoop.blend + dt / 1.4)
    U.uResBlend.value = resLoop.blend

    const v = (window.scrollY - lastY) / Math.max(dt, 1e-3)
    lastY = window.scrollY
    vel += (v - vel) * (1 - Math.exp(-dt * 6))
    U.uVel.value = reduced ? 0 : vel * P.scrollDrag
    const target = 1 + Math.min(Math.abs(vel) / 450, 1) * P.riverBoost
    river.boost +=
      (target - river.boost) *
      (1 - Math.exp(-dt * (target > river.boost ? 2.5 : 0.8)))
    if (!reduced) river.t += dt * river.boost
    U.uRiverT.value = river.t

    const k = 1 - Math.exp(-dt * 3.2)
    const ks = 1 - Math.exp(-dt * 0.9)
    mouse.x += (mouse.tx - mouse.x) * k
    mouse.y += (mouse.ty - mouse.y) * k
    mouse.sx += (mouse.tx - mouse.sx) * ks
    mouse.sy += (mouse.ty - mouse.sy) * ks
    mouse.s += (mouse.ts - mouse.s) * (1 - Math.exp(-dt * 1.4))
    U.uMouse.value.set(mouse.x, mouse.y)
    U.uMouseSlow.value.set(mouse.sx, mouse.sy)
    U.uMouseF.value = reduced ? 0 : P.mouseForce * mouse.s

    U.uTime.value = time
    renderer.render(scene, camera)
  }

  const start = () => {
    last = performance.now()
    renderer.setAnimationLoop(frame)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) renderer.setAnimationLoop(null)
    else start()
  })
  start()
  host.classList.add('is-ready')
}
