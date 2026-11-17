// --------------------------------------------------
// ecosystem-atlas
// --------------------------------------------------
// Ecosystem Atlas page (/ecosystem-atlas). One root per page:
//   [data-component="ecosystem-atlas"]  header + stage + filters + ranking + profile
//   [data-atlas-stage]                  the map (SVG drawn here, d3-geo)
//   [data-atlas-filter="block|measure|coverage|industry|flow|level"]  native selects
//   [data-atlas-view="flat|globe"]      view toggle buttons
//   [data-atlas-ranking]                <ol> filled with one row per entity
//   [data-atlas-profile]                profile card ([data-atlas-entity] select,
//                                       [data-atlas-meta|score|rank], [data-atlas-pillars])
//   [data-atlas-measure]                Measure Details band ([data-measure-field])
//   [data-atlas-open="trend|definitions|scope|methodology"]  open the drawer
//   [data-atlas-drawer]                 drawer (tabs [data-drawer-tab], panels
//                                       [data-drawer-panel], [data-atlas-trend])
//   [data-def="<key>"]                  one CMS Measures card per measure
// Numbers come from dist/data/atlas.json (MOCK until the lab export arrives);
// definitions and notes come from the Measures CMS cards.
// Deep link: ?m=measure&e=entity&v=flat|globe&b=block&c=coverage&tab=drawer-tab
// --------------------------------------------------
import {
  geoPath,
  geoGraticule10,
  geoDistance,
  geoNaturalEarth1,
  geoNaturalEarth1Raw,
  geoOrthographicRaw,
  geoProjectionMutator,
} from 'd3-geo'
import { feature } from 'topojson-client'
import { loadJson, reducedMotion } from '../utils/motion.js'
import { enhanceSelect } from '../utils/dropdown.js'
import '../styles/ecosystem-atlas.css'

const SVG_NS = 'http://www.w3.org/2000/svg'
const BIN_VARS = [
  'var(--_color---map--beacon-lighter)',
  'var(--_color---map--beacon-light)',
  'var(--_color---map--beacon-regular)',
  'var(--_color---map--beacon-dark)',
  'var(--_color---map--beacon-darker)',
]
// Categorical palette for the trend chart (Figma "Trend figure" frame)
const TREND_COLORS = [
  '#4a89e8',
  '#e0714f',
  '#4fb38a',
  '#e3a73b',
  '#d982a8',
  '#3d8a2e',
  '#4b3fa8',
  '#c9473f',
]
const TABS = ['scope', 'methodology', 'trend', 'definitions']
// Default globe view (Figma 38300): North America left, Europe right
const GLOBE_HOME = [55, -38]
const ICONS = {
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  globe:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  filter:
    '<path d="M4 7h16M7 12h10M10 17h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  close:
    '<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  'arrow-right':
    '<path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  'arrow-left':
    '<path d="M19 12H5m5-5-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  chevron:
    '<path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
}
const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1)
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  )

function fmt(v) {
  if (v == null || !Number.isFinite(v)) return '–'
  const a = Math.abs(v)
  if (a >= 1000) return Math.round(v).toLocaleString('en-US')
  if (Number.isInteger(v)) return String(v)
  if (a < 1) return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  if (a < 10) return v.toFixed(2).replace(/0$/, '')
  return v.toFixed(1)
}
const pad2 = (n) => String(n).padStart(2, '0')
const unitLabel = (u) => (u === 'n' ? 'count' : u)
// 0, 1, 2, 2.5, 5 x 10^k step for axis ticks
function niceStep(max, count = 4) {
  const raw = max / count
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

// Projection that blends NaturalEarth1 (flat, alpha 0) and Orthographic (globe, alpha 1)
function blendProjection() {
  let alpha = 0
  const mutate = geoProjectionMutator((t) => (x, y) => {
    const a = geoNaturalEarth1Raw(x, y)
    const b = geoOrthographicRaw(x, y)
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
  })
  const p = mutate(alpha)
  p.alpha = (v) => (v === undefined ? alpha : (mutate((alpha = v)), p))
  return p
}

// Copy text from the Measures CMS cards, keyed by data-def
function readDefs() {
  const out = new Map()
  document.querySelectorAll('[data-def]').forEach((card) => {
    const key = card.getAttribute('data-def')
    if (!key) return
    const f = (name) => {
      const el = card.querySelector(`[data-def-field="${name}"]`)
      return el && !el.classList.contains('w-dyn-bind-empty')
        ? el.textContent.trim()
        : ''
    }
    out.set(key, {
      card,
      name: f('name'),
      block: f('block'),
      unit: f('unit'),
      direction: f('direction'),
      definition: f('definition'),
      how: f('how'),
      notes: f('notes'),
      source: f('source'),
      range: f('range'),
    })
  })
  return out
}

export default async function (elements) {
  const root = elements[0]
  let DATA, WORLD
  try {
    ;[DATA, WORLD] = await Promise.all([
      loadJson('atlas.json'),
      loadJson('atlas-world.json'),
    ])
  } catch (error) {
    console.error('[ecosystem-atlas] data failed to load', error)
    return
  }
  const reduced = reducedMotion()
  const stage = root.querySelector('[data-atlas-stage]')
  const band = document.querySelector('[data-atlas-measure]')
  const drawer = document.querySelector('[data-atlas-drawer]')
  const defs = readDefs()
  const select = (k) => root.querySelector(`[data-atlas-filter="${k}"]`)
  const YEAR = DATA.meta.years[DATA.meta.years.length - 1]
  const BASE_YEAR = DATA.meta.years[0]

  // ── Entities ─────────────────────────────────────────────────────
  const ecos = DATA.ecosystems.map((e) => ({ ...e, kind: 'city' }))
  const byCountry = new Map()
  ecos.forEach((e) => {
    if (!byCountry.has(e.iso)) byCountry.set(e.iso, [])
    byCountry.get(e.iso).push(e)
  })
  const countries = [...byCountry.entries()].map(([iso, ms]) => ({
    id: `c${iso}`,
    name: ms[0].country,
    country: ms[0].country,
    region: ms[0].region,
    iso,
    lat: mean(ms.map((m) => m.lat)),
    lng: mean(ms.map((m) => m.lng)),
    kind: 'country',
    members: ms,
  }))
  const measures = DATA.measures
  const measureBy = new Map(measures.map((m) => [m.key, m]))

  // ── State (+ deep link) ──────────────────────────────────────────
  const qs = new window.URLSearchParams(window.location.search)
  const opt = (k, v) =>
    DATA.options[k].some(([id]) => id === v) ? v : DATA.options[k][0][0]
  const state = {
    block: DATA.blocks.some((b) => b.id === qs.get('b')) ? qs.get('b') : 'all',
    measure: measureBy.has(qs.get('m')) ? qs.get('m') : measures[0].key,
    coverage: opt('coverage', qs.get('c')),
    industry: opt('industry', qs.get('i')),
    flow: opt('flow', qs.get('f')),
    level: opt('level', qs.get('l')),
    entity: qs.get('e') || null,
    view: qs.get('v') === 'flat' ? 'flat' : 'globe',
    hot: null,
  }
  const measure = () => measureBy.get(state.measure)
  // Country-only measures lock coverage to countries
  const coverage = () =>
    measure().level === 'country' ? 'countries' : state.coverage
  const entities = () => (coverage() === 'countries' ? countries : ecos)

  function writeUrl() {
    const p = new window.URLSearchParams(window.location.search)
    const set = (k, v, def) => (v && v !== def ? p.set(k, v) : p.delete(k))
    set('m', state.measure, measures[0].key)
    set('b', state.block, 'all')
    set('c', state.coverage, DATA.options.coverage[0][0])
    set('i', state.industry, 'all')
    set('f', state.flow, 'all')
    set('l', state.level, 'all')
    set('e', state.entity, null)
    set('v', state.view, 'globe')
    const q = p.toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`
    )
  }

  // ── Values ───────────────────────────────────────────────────────
  const factor = (id) => {
    const f = DATA.factors[id]
    return f
      ? f.industry[state.industry] * f.flow[state.flow] * f.level[state.level]
      : 1
  }
  const round = (v, m) =>
    m.unit === 'n' ? Math.round(v) : Math.round(v * 1000) / 1000
  function valueOf(m, ent, year = YEAR) {
    if (ent.kind === 'city') {
      const raw = DATA.values[m.key]?.[ent.id]?.[year]
      return raw == null ? null : round(raw * factor(ent.id), m)
    }
    const vs = ent.members
      .map((e) => valueOf(m, e, year))
      .filter((v) => v != null)
    if (!vs.length) return null
    return round(
      m.kind === 'count' ? vs.reduce((s, v) => s + v, 0) : mean(vs),
      m
    )
  }
  function table() {
    const m = measure()
    const rows = entities()
      .map((ent) => ({
        ent,
        value: valueOf(m, ent),
        start: valueOf(m, ent, BASE_YEAR),
      }))
      .filter((r) => r.value != null)
    rows.sort((a, b) =>
      m.direction === 'lower' ? a.value - b.value : b.value - a.value
    )
    const vals = rows.map((r) => r.value)
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    rows.forEach((r, i) => {
      r.rank = i + 1
      const t = hi === lo ? 1 : (r.value - lo) / (hi - lo)
      r.t = m.direction === 'lower' ? 1 - t : t
      r.bin = Math.min(4, Math.floor(r.t * 5))
    })
    return { m, rows, lo, hi }
  }
  // Composite "vitality" score for the profile = mean of pillar scores
  const pillarScores = (ent) =>
    ent.kind === 'city'
      ? DATA.pillarScores[ent.id]
      : DATA.pillars.map((_, i) =>
          Math.round(mean(ent.members.map((e) => DATA.pillarScores[e.id][i])))
        )
  const vitality = (ent) => Math.round(mean(pillarScores(ent)) * 10) / 10

  // ── Controls ─────────────────────────────────────────────────────
  // Native <select>s stay as the source of truth; enhanceSelect draws the
  // custom dropdown on top and is refreshed after every option rewrite.
  const dropdowns = new Map()
  const fill = (el, items, value) => {
    if (!el) return
    el.innerHTML = items
      .map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`)
      .join('')
    el.value = value
    dropdowns.get(el)?.refresh()
  }
  function fillControls() {
    fill(
      select('block'),
      [['all', 'All measures'], ...DATA.blocks.map((b) => [b.id, b.name])],
      state.block
    )
    const list = measures.filter(
      (m) => state.block === 'all' || m.block === state.block
    )
    if (!list.some((m) => m.key === state.measure)) state.measure = list[0].key
    fill(
      select('measure'),
      list.map((m) => [m.key, m.name]),
      state.measure
    )
    fill(select('coverage'), DATA.options.coverage, coverage())
    const cov = select('coverage')
    if (cov) {
      const locked = measure().level === 'country'
      cov.disabled = locked
      cov.title = locked
        ? 'This measure is available at country level only'
        : ''
      dropdowns.get(cov)?.refresh()
    }
    ;['industry', 'flow', 'level'].forEach((k) =>
      fill(select(k), DATA.options[k], state[k])
    )
  }
  root.querySelectorAll('[data-atlas-filter]').forEach((el) =>
    el.addEventListener('change', () => {
      const k = el.dataset.atlasFilter
      state[k] = el.value
      if (k === 'coverage' || k === 'measure' || k === 'block') {
        const ids = new Set(entities().map((e) => e.id))
        if (state.entity && !ids.has(state.entity)) state.entity = null
      }
      update()
    })
  )

  const toggle = root.querySelector('[data-atlas-filters-toggle]')
  const extra =
    toggle && document.getElementById(toggle.getAttribute('aria-controls'))
  if (toggle && extra) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true'
      toggle.setAttribute('aria-expanded', String(open))
      extra.hidden = !open
    })
  }
  document.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.querySelector('svg'))
      el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon))
  })

  // ── Map ──────────────────────────────────────────────────────────
  const world = feature(WORLD, WORLD.objects.countries).features.filter(
    (f) => f.id !== '010'
  )
  const trackedIso = new Set(ecos.map((e) => e.iso))
  const proj = blendProjection().precision(0.3)
  const path = geoPath(proj)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'atlas_svg')
  svg.innerHTML =
    '<g data-layer="base"><path class="atlas_sphere-fill"/><path class="atlas_grat"/></g>' +
    '<g data-layer="land"></g><path class="atlas_sphere"/>' +
    '<g data-layer="beacons"></g><g data-layer="labels" aria-hidden="true"></g>'
  stage.appendChild(svg)
  const tip = document.createElement('div')
  tip.className = 'atlas_tip'
  tip.setAttribute('aria-hidden', 'true')
  stage.appendChild(tip)
  const layer = (n) => svg.querySelector(`[data-layer="${n}"]`)
  const sphereFill = svg.querySelector('.atlas_sphere-fill')
  const sphereLine = svg.querySelector('.atlas_sphere')
  const gratPath = svg.querySelector('.atlas_grat')
  const landPaths = world.map((f) => {
    const p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute(
      'class',
      `atlas_country${trackedIso.has(String(f.id)) ? ' is-tracked' : ''}`
    )
    layer('land').appendChild(p)
    return { f, p }
  })
  const grat = geoGraticule10()
  const sphere = { type: 'Sphere' }

  let geom = { alpha: 1, rotate: GLOBE_HOME, scale: 1, translate: [0, 0] }
  let size = { w: 0, h: 0 }
  const isSmall = () => size.w < 768

  function targetGeom(view) {
    const { w, h } = size
    const ent = state.entity && entities().find((e) => e.id === state.entity)
    if (view === 'globe') {
      const rotate = ent
        ? [-ent.lng, -clamp(ent.lat, -40, 55) * 0.7]
        : geom.alpha > 0.5
          ? geom.rotate
          : GLOBE_HOME
      // Desktop: large globe whose top sits just under the header and whose
      // lower half is covered by the panel (Figma 38300)
      const r = isSmall() ? Math.min(w, h) * 0.46 : Math.min(h * 0.8, w * 0.34)
      return {
        alpha: 1,
        rotate,
        scale: r,
        translate: [w / 2, isSmall() ? h / 2 : h * 0.07 + r],
      }
    }
    const p = geoNaturalEarth1().rotate([-10, 0])
    const pad = isSmall() ? 8 : 40
    p.fitExtent(
      [
        [pad, isSmall() ? pad : h * 0.16],
        [w - pad, h - pad],
      ],
      { type: 'FeatureCollection', features: world }
    )
    return {
      alpha: 0,
      rotate: [-10, 0],
      scale: p.scale(),
      translate: p.translate(),
    }
  }
  function apply(g) {
    geom = g
    proj
      .alpha(g.alpha)
      .rotate(g.rotate)
      .scale(g.scale)
      .translate(g.translate)
      .clipAngle(
        g.alpha <= 0.001 ? null : g.alpha >= 0.999 ? 90 : 180 - g.alpha * 90
      )
    // Sphere and graticule only read well once the shape is nearly round,
    // so they fade in over the last part of the morph.
    const globeness = clamp((g.alpha - 0.7) / 0.3, 0, 1)
    sphereFill.setAttribute('d', path(sphere) || '')
    sphereFill.style.opacity = globeness
    sphereLine.setAttribute('d', path(sphere) || '')
    sphereLine.style.opacity = globeness
    gratPath.setAttribute('d', path(grat) || '')
    gratPath.style.opacity = globeness
    landPaths.forEach(({ f, p }) => p.setAttribute('d', path(f) || ''))
    positionBeacons()
  }
  let anim = 0
  let moving = false
  let animToken = 0
  function animateTo(g, dur = 900, then) {
    cancelAnimationFrame(anim)
    const token = ++animToken
    const from = {
      ...geom,
      rotate: [...geom.rotate],
      translate: [...geom.translate],
    }
    // shortest way round
    let dr = g.rotate[0] - from.rotate[0]
    dr = ((((dr + 180) % 360) + 360) % 360) - 180
    if (reduced || !dur) {
      apply(g)
      if (then) return then()
      placeLabels()
      return
    }
    moving = true
    clearLabels()
    const t0 = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur)
      const e = ease(t)
      apply({
        alpha: lerp(from.alpha, g.alpha, e),
        rotate: [from.rotate[0] + dr * e, lerp(from.rotate[1], g.rotate[1], e)],
        scale: lerp(from.scale, g.scale, e),
        translate: [
          lerp(from.translate[0], g.translate[0], e),
          lerp(from.translate[1], g.translate[1], e),
        ],
      })
      if (t < 1) anim = requestAnimationFrame(step)
      else if (then && token === animToken) then()
      else {
        moving = false
        placeLabels()
      }
    }
    anim = requestAnimationFrame(step)
  }

  // Drag to rotate the globe
  let drag = null
  svg.addEventListener('pointerdown', (e) => {
    if (state.view !== 'globe' || e.target.closest('.atlas_beacon')) return
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId }
    svg.setPointerCapture(e.pointerId)
    svg.classList.add('is-dragging')
    cancelAnimationFrame(anim)
    moving = true
    clearLabels()
  })
  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return
    const k = (75 / geom.scale) * 1.2
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    drag.x = e.clientX
    drag.y = e.clientY
    apply({
      ...geom,
      rotate: [
        geom.rotate[0] + dx * k,
        clamp(geom.rotate[1] - dy * k, -70, 70),
      ],
    })
  })
  const endDrag = () => {
    if (!drag) return
    drag = null
    moving = false
    svg.classList.remove('is-dragging')
    placeLabels()
  }
  svg.addEventListener('pointerup', endDrag)
  svg.addEventListener('pointercancel', endDrag)

  // ── Beacons ──────────────────────────────────────────────────────
  let current = table()
  let beacons = []
  const visible = (ent) =>
    geom.alpha < 0.5 ||
    geoDistance([ent.lng, ent.lat], [-geom.rotate[0], -geom.rotate[1]]) <
      Math.PI / 2 - 0.04
  function radius(r) {
    const k = isSmall() ? 0.75 : 1
    if (current.m.kind === 'count') {
      const mx = Math.max(...current.rows.map((x) => x.value)) || 1
      return Math.max(4, Math.sqrt(Math.max(0, r.value) / mx) * 24) * k
    }
    return (6 + r.t * 7) * k
  }
  const unit = (m) =>
    m.unit === 'n'
      ? ''
      : m.unit.startsWith('%') && m.unit.length === 1
        ? '%'
        : ` ${m.unit}`
  function renderBeacons() {
    const g = layer('beacons')
    g.innerHTML = ''
    const countryMode = coverage() === 'countries'
    beacons = current.rows.map((r) => {
      const b = document.createElementNS(SVG_NS, 'g')
      b.setAttribute('class', 'atlas_beacon')
      b.setAttribute('tabindex', '0')
      b.setAttribute('role', 'button')
      b.setAttribute(
        'aria-label',
        `${r.ent.name}, ${fmt(r.value)}${unit(current.m)}, rank ${r.rank} of ${current.rows.length}`
      )
      b.dataset.id = r.ent.id
      const rad = countryMode ? 4 : radius(r)
      b.innerHTML = `<circle class="atlas_beacon-halo" r="${rad + 7}"/><circle class="atlas_beacon-dot" r="${rad}"/>`
      b.style.setProperty('--beacon', BIN_VARS[r.bin])
      if (current.m.kind === 'count' && !countryMode)
        b.classList.add('is-bubble')
      b.addEventListener('mouseenter', () => setHot(r.ent.id))
      b.addEventListener('mouseleave', () => setHot(null))
      b.addEventListener('focus', () => setHot(r.ent.id))
      b.addEventListener('blur', () => setHot(null))
      b.addEventListener('click', () => selectEntity(r.ent.id))
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          selectEntity(r.ent.id)
        }
      })
      g.appendChild(b)
      return { b, r, rad }
    })
    // Countries: fill land by score; cities: tint countries that host one
    const by = new Map(current.rows.map((r) => [r.ent.iso, r]))
    landPaths.forEach(({ f, p }) => {
      const r = countryMode ? by.get(String(f.id)) : null
      p.style.fill = r ? BIN_VARS[r.bin] : ''
      p.classList.toggle('is-scored', !!r)
    })
    paintSelection()
    positionBeacons()
    placeLabels()
  }
  function positionBeacons() {
    const { w, h } = size
    beacons.forEach((x) => {
      const p = proj([x.r.ent.lng, x.r.ent.lat])
      const ok =
        p &&
        visible(x.r.ent) &&
        p[0] > -30 &&
        p[0] < w + 30 &&
        p[1] > -30 &&
        p[1] < h + 30
      x.xy = ok ? p : null
      x.b.style.display = ok ? '' : 'none'
      if (ok)
        x.b.setAttribute(
          'transform',
          `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`
        )
    })
  }
  const clearLabels = () => (layer('labels').innerHTML = '')
  const ctx = document.createElement('canvas').getContext('2d')
  const textW = (s) => {
    ctx.font = '400 14px Inter, system-ui, sans-serif'
    return ctx.measureText(s).width
  }
  function placeLabels() {
    if (moving) return
    clearLabels()
    const { w, h } = size
    const placed = []
    const hit = (a, c) =>
      a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y
    const dots = beacons
      .filter((x) => x.xy)
      .map((x) => ({
        x: x.xy[0] - x.rad,
        y: x.xy[1] - x.rad,
        w: x.rad * 2,
        h: x.rad * 2,
      }))
    const limit = isSmall() ? 6 : 99
    const ordered = [...beacons].sort((a, b) =>
      a.r.ent.id === state.entity
        ? -1
        : b.r.ent.id === state.entity
          ? 1
          : a.r.rank - b.r.rank
    )
    let html = ''
    ordered.forEach((x) => {
      if (!x.xy || (x.r.rank > limit && x.r.ent.id !== state.entity)) return
      const name = x.r.ent.name
      const val = fmt(x.r.value)
      const lw = Math.max(textW(name), textW(val)) + 4
      const lh = 38
      const [cx, cy] = x.xy
      const rad = x.rad
      const cands = [
        ['end', cx - rad - 8 - lw, cy - lh / 2],
        ['start', cx + rad + 8, cy - lh / 2],
        ['middle', cx - lw / 2, cy - rad - 6 - lh],
        ['middle', cx - lw / 2, cy + rad + 6],
      ]
      for (const [anchor, lx, ly] of cands) {
        const bx = { x: lx, y: ly, w: lw, h: lh }
        if (lx < 4 || ly < 4 || lx + lw > w - 4 || ly + lh > h - 4) continue
        if (placed.some((p) => hit(bx, p)) || dots.some((p) => hit(bx, p)))
          continue
        placed.push(bx)
        const ax =
          anchor === 'end' ? lx + lw : anchor === 'middle' ? lx + lw / 2 : lx
        const cls = `atlas_label-g${x.r.ent.id === state.hot ? ' is-hot' : ''}${x.r.bin >= 3 ? ' is-strong' : ''}`
        html +=
          `<g class="${cls}" data-id="${esc(x.r.ent.id)}">` +
          `<text class="atlas_label-name" x="${ax}" y="${ly + 15}" text-anchor="${anchor}">${esc(name)}</text>` +
          `<text class="atlas_label-value" x="${ax}" y="${ly + 33}" text-anchor="${anchor}">${esc(val)}</text></g>`
        break
      }
    })
    layer('labels').innerHTML = html
  }
  // The profile always shows someone: the selected entity or the leader
  const profileId = () => state.entity || current.rows[0]?.ent.id
  function paintSelection() {
    const sel = profileId()
    beacons.forEach(({ b, r }) => {
      b.classList.toggle('is-selected', r.ent.id === sel)
      b.classList.toggle('is-hot', r.ent.id === state.hot)
    })
  }
  function setHot(id) {
    state.hot = id
    paintSelection()
    layer('labels')
      .querySelectorAll('[data-id]')
      .forEach((g) => g.classList.toggle('is-hot', g.dataset.id === id))
    rankingList
      ?.querySelectorAll('[data-id]')
      .forEach((li) => li.classList.toggle('is-hot', li.dataset.id === id))
    const x = beacons.find((b) => b.r.ent.id === id)
    if (!id || !x || !x.xy) {
      tip.classList.remove('is-visible')
      return
    }
    tip.innerHTML = `<strong>${esc(x.r.ent.name)}</strong><span>${esc(fmt(x.r.value))}${esc(unit(current.m))} · #${pad2(x.r.rank)}</span>`
    tip.style.left = `${x.xy[0]}px`
    tip.style.top = `${x.xy[1] - x.rad - 8}px`
    tip.classList.add('is-visible')
  }

  // ── View toggle ──────────────────────────────────────────────────
  const viewBtns = [...root.querySelectorAll('[data-atlas-view]')]
  function setView(v, animate = true) {
    state.view = v
    viewBtns.forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.atlasView === v))
    )
    svg.classList.toggle('is-globe', v === 'globe')
    const target = targetGeom(v)
    if (!animate) {
      apply(target)
      placeLabels()
    } else if (v === 'globe' && geom.alpha < 0.999) {
      // 1) morph flat → globe facing the same longitude, equator centered
      //    (no rotation while the shape changes, so nothing folds over)
      // 2) then spin the globe to its target view
      const lng = geom.rotate[0]
      animateTo(
        {
          alpha: 1,
          rotate: [lng, 0],
          scale: target.scale,
          translate: target.translate,
        },
        800,
        () => animateTo(target, 900)
      )
    } else if (v === 'flat' && geom.alpha > 0.001) {
      // 1) spin the globe back to the flat map's center
      // 2) then unfold it into the flat map
      animateTo({ ...geom, alpha: 1, rotate: target.rotate }, 700, () =>
        animateTo(target, 800)
      )
    } else animateTo(target, 900)
    writeUrl()
  }
  viewBtns.forEach((b) =>
    b.addEventListener('click', () => setView(b.dataset.atlasView))
  )

  // ── Legend ───────────────────────────────────────────────────────
  function renderLegend() {
    const lo = root.querySelector('[data-legend-low]')
    const hi = root.querySelector('[data-legend-high]')
    const lower = current.m.direction === 'lower'
    if (lo) lo.textContent = lower ? 'High' : 'Low'
    if (hi) hi.textContent = lower ? 'Low' : 'High'
    const legend = root.querySelector('[data-atlas-legend]')
    if (legend)
      legend.setAttribute(
        'aria-label',
        `Color scale: darker is better. Range ${fmt(current.lo)} to ${fmt(current.hi)}${unit(current.m)}`
      )
  }

  // ── Ranking ──────────────────────────────────────────────────────
  const rankingList = root.querySelector('[data-atlas-ranking]')
  // Bars grow from their previous width (or 0) to the new one, staggered
  function animateBars(container, prev) {
    const bars = [...container.querySelectorAll('[data-to]')]
    bars.forEach((b) => {
      b.style.transitionDuration = '0s'
      b.style.width = prev.get(b.dataset.key) || '0%'
    })
    void container.offsetWidth
    bars.forEach((b, i) => {
      b.style.transitionDuration = ''
      b.style.transitionDelay = reduced ? '0ms' : `${Math.min(i, 12) * 30}ms`
      b.style.width = b.dataset.to
    })
  }
  const barWidths = (container) =>
    new Map(
      [...container.querySelectorAll('[data-to]')].map((b) => [
        b.dataset.key,
        b.style.width,
      ])
    )
  function renderRanking() {
    if (!rankingList) return
    const prev = barWidths(rankingList)
    rankingList.innerHTML = current.rows
      .map(
        (r) =>
          `<li class="atlas_row-item" data-id="${esc(r.ent.id)}"><button type="button" class="atlas_row" aria-pressed="${r.ent.id === state.entity}">` +
          `<span class="atlas_row-index">${pad2(r.rank)}</span>` +
          `<span class="atlas_row-name">${esc(r.ent.name)}</span>` +
          `<span class="atlas_row-bar" aria-hidden="true"><span data-key="${esc(r.ent.id)}" data-to="${Math.max(4, r.t * 100).toFixed(1)}%" style="background:${BIN_VARS[Math.max(2, r.bin)]}"></span></span>` +
          `<span class="atlas_row-value">${esc(fmt(r.value))}</span>${icon('chevron', 16)}</button></li>`
      )
      .join('')
    rankingList.querySelectorAll('[data-id]').forEach((li) => {
      const id = li.dataset.id
      li.addEventListener('mouseenter', () => setHot(id))
      li.addEventListener('mouseleave', () => setHot(null))
      li.querySelector('button').addEventListener('click', () =>
        selectEntity(id)
      )
    })
    animateBars(rankingList, prev)
  }

  // ── Profile ──────────────────────────────────────────────────────
  const profile = root.querySelector('[data-atlas-profile]')
  const entitySelect = profile?.querySelector('[data-atlas-entity]')
  entitySelect?.addEventListener('change', () =>
    selectEntity(entitySelect.value)
  )
  function renderProfile() {
    if (!profile) return
    const list = entities()
    const ent =
      list.find((e) => e.id === state.entity) ||
      list.find((e) => e.id === current.rows[0]?.ent.id)
    if (!ent) return
    fill(
      entitySelect,
      [...list]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => [e.id, e.name]),
      ent.id
    )
    const set = (sel, t) => {
      const el = profile.querySelector(sel)
      if (el) el.textContent = t
    }
    set(
      '[data-atlas-meta]',
      ent.kind === 'city'
        ? `${ent.country} · ${ent.region}`
        : `${ent.region} · ${ent.members.length} ecosystem${ent.members.length > 1 ? 's' : ''}`
    )
    const scores = list
      .map((e) => ({ id: e.id, v: vitality(e) }))
      .sort((a, b) => b.v - a.v)
    set('[data-atlas-score]', fmt(vitality(ent)))
    const rankEl = profile.querySelector('[data-atlas-rank]')
    if (rankEl)
      rankEl.innerHTML = `${scores.findIndex((s) => s.id === ent.id) + 1}<small>/${list.length}</small>`
    const ul = profile.querySelector('[data-atlas-pillars]')
    if (ul) {
      const own = pillarScores(ent)
      const prev = barWidths(ul)
      ul.innerHTML = DATA.pillars
        .map((name, i) => {
          const rank =
            list.map((e) => pillarScores(e)[i]).filter((v) => v > own[i])
              .length + 1
          return `<li class="atlas_pillar"><span class="atlas_pillar-name">${esc(name)}</span><span class="atlas_pillar-bar" aria-hidden="true"><span data-key="${i}" data-to="${own[i]}%"></span></span><span class="atlas_pillar-value">${own[i]} · #${pad2(rank)}</span></li>`
        })
        .join('')
      animateBars(ul, prev)
    }
  }

  function selectEntity(id) {
    state.entity = state.entity === id ? null : id
    paintSelection()
    rankingList
      ?.querySelectorAll('[data-id]')
      .forEach((li) =>
        li
          .querySelector('button')
          .setAttribute('aria-pressed', String(li.dataset.id === state.entity))
      )
    renderProfile()
    if (state.view === 'globe' && state.entity)
      animateTo(targetGeom('globe'), 900)
    else placeLabels()
    writeUrl()
  }

  // ── Measure Details band ─────────────────────────────────────────
  function renderBand() {
    if (!band) return
    const m = current.m
    const d = defs.get(m.key) || {}
    const block = DATA.blocks.find((b) => b.id === m.block)
    const set = (field, t) => {
      const el = band.querySelector(`[data-measure-field="${field}"]`)
      if (el) {
        el.textContent = t
        el.hidden = !t
      }
    }
    set('block', d.block || block?.name || '')
    set('unit', `Unit: ${d.unit || unitLabel(m.unit)}`)
    set(
      'direction',
      d.direction ||
        (m.direction === 'lower' ? 'Lower is better' : 'Higher is better')
    )
    set('name', d.name || m.name)
    set('definition', d.definition || 'Definition coming soon.')
    set('how', d.how ? `How it's built: ${d.how}` : '')
    set('notes', d.notes || '')
    const range = d.range || `${fmt(current.lo)}–${fmt(current.hi)}${unit(m)}`
    set(
      'source',
      [d.source && `Source: ${d.source}`, `Observed range: ${range}`]
        .filter(Boolean)
        .join(' · ')
    )
  }

  // ── Drawer ───────────────────────────────────────────────────────
  let lastFocus = null
  const tabBtns = drawer
    ? [...drawer.querySelectorAll('[data-drawer-tab]')]
    : []
  const panels = drawer
    ? [...drawer.querySelectorAll('[data-drawer-panel]')]
    : []
  let activeTab = 'scope'
  function showTab(tab) {
    activeTab = TABS.includes(tab) ? tab : 'scope'
    tabBtns.forEach((b) => {
      const on = b.dataset.drawerTab === activeTab
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
    })
    panels.forEach((p) => (p.hidden = p.dataset.drawerPanel !== activeTab))
    if (activeTab === 'trend') renderTrend()
    const panel = drawer.querySelector('.atlas-drawer_panel')
    if (panel) panel.scrollTop = 0
  }
  function openDrawer(tab) {
    if (!drawer) return
    lastFocus = document.activeElement
    showTab(tab)
    drawer.setAttribute('aria-hidden', 'false')
    drawer.classList.add('is-open')
    document.documentElement.classList.add('is-atlas-drawer-open')
    requestAnimationFrame(() =>
      drawer.querySelector(`[data-drawer-tab="${activeTab}"]`)?.focus()
    )
  }
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('is-open')) return
    drawer.classList.remove('is-open')
    drawer.setAttribute('aria-hidden', 'true')
    document.documentElement.classList.remove('is-atlas-drawer-open')
    lastFocus?.focus?.()
  }
  if (drawer) {
    document.body.appendChild(drawer)
    document.querySelectorAll('[data-atlas-open]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.preventDefault()
        openDrawer(el.getAttribute('data-atlas-open'))
      })
    )
    tabBtns.forEach((b) =>
      b.addEventListener('click', () => showTab(b.dataset.drawerTab))
    )
    drawer
      .querySelector('[role="tablist"]')
      ?.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        const i = TABS.indexOf(activeTab) + (e.key === 'ArrowRight' ? 1 : -1)
        showTab(TABS[(i + TABS.length) % TABS.length])
        drawer.querySelector(`[data-drawer-tab="${activeTab}"]`)?.focus()
      })
    drawer
      .querySelectorAll('[data-drawer-close]')
      .forEach((b) => b.addEventListener('click', closeDrawer))
    drawer
      .querySelector('[data-drawer-next]')
      ?.addEventListener('click', () =>
        showTab(TABS[(TABS.indexOf(activeTab) + 1) % TABS.length])
      )
    drawer
      .querySelector('[data-drawer-prev]')
      ?.addEventListener('click', () =>
        showTab(TABS[(TABS.indexOf(activeTab) + TABS.length - 1) % TABS.length])
      )
    document.addEventListener('keydown', (e) => {
      if (!drawer.classList.contains('is-open')) return
      if (e.key === 'Escape') closeDrawer()
      if (e.key === 'Tab') {
        const f = [
          ...drawer.querySelectorAll(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ),
        ].filter((el) => el.offsetParent !== null)
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    })
    setupDefinitions()
  }

  // Definitions & formulas: anchors per block, Show on map, Read more
  function setupDefinitions() {
    const anchors = drawer.querySelector('[data-defs-anchors]')
    const seen = new Set()
    defs.forEach((d, key) => {
      const m = measureBy.get(key)
      const blockName =
        d.block || DATA.blocks.find((b) => b.id === m?.block)?.name
      if (blockName && !seen.has(blockName)) {
        seen.add(blockName)
        d.card.id = `defs-${blockName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        anchors?.insertAdjacentHTML(
          'beforeend',
          `<a class="atlas-drawer_anchor" href="#${d.card.id}">${esc(blockName)} ↓</a>`
        )
      }
      const unitEl = d.card.querySelector('[data-def-field="unit"]')
      if (unitEl && d.unit) unitEl.textContent = `Unit: ${d.unit}`
      const show = d.card.querySelector('[data-def-show]')
      if (show) {
        show.disabled = !m
        show.title = m ? '' : 'No map data for this measure yet'
        show.addEventListener('click', () => {
          if (!m) return
          state.block = 'all'
          state.measure = key
          state.entity = null
          closeDrawer()
          update()
          root.scrollIntoView({
            behavior: reduced ? 'auto' : 'smooth',
            block: 'start',
          })
        })
      }
      const more = d.card.querySelector('[data-def-data]')
      if (more && (d.notes || d.source || d.range)) {
        more.classList.remove('u-d-none')
        more.hidden = true
        more.innerHTML = [
          d.notes,
          d.source && `Source: ${d.source}`,
          d.range && `Observed range: ${d.range}`,
        ]
          .filter(Boolean)
          .map((t) => `<p class="atlas-def_note">${esc(t)}</p>`)
          .join('')
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'atlas-def_more'
        btn.setAttribute('aria-expanded', 'false')
        btn.innerHTML = `<span>Read more</span>${icon('arrow-right', 16)}`
        btn.addEventListener('click', () => {
          const open = more.hidden
          more.hidden = !open
          btn.setAttribute('aria-expanded', String(open))
          btn.querySelector('span').textContent = open
            ? 'Show less'
            : 'Read more'
        })
        more.after(btn)
      }
    })
    anchors?.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]')
      if (!a) return
      e.preventDefault()
      drawer.querySelector(a.getAttribute('href'))?.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }

  // Trend figure: country lines 2010-2025 + data table
  function renderTrend() {
    const holder = drawer.querySelector('[data-atlas-trend]')
    const tableHolder = drawer.querySelector('[data-atlas-trend-table]')
    if (!holder) return
    const m = current.m
    const tr = DATA.trend[m.key]
    const title = drawer.querySelector('[data-trend-title]')
    const metaEl = drawer.querySelector('[data-trend-meta]')
    const names = Object.keys(tr.series)
    if (title) title.textContent = defs.get(m.key)?.name || m.name
    if (metaEl)
      metaEl.textContent = `${unitLabel(m.unit)} · ${names.length} countries · ${tr.years[0]}-${tr.years[tr.years.length - 1]}`
    const last = (n) => tr.series[n][tr.series[n].length - 1]
    const sorted = [...names].sort((a, b) =>
      m.direction === 'lower' ? last(a) - last(b) : last(b) - last(a)
    )
    const top = sorted.slice(0, TREND_COLORS.length)
    const W = Math.max(320, holder.clientWidth || 800)
    const H = 360
    const pad = { l: 44, r: 116, t: 16, b: 28 }
    const all = names.flatMap((n) => tr.series[n])
    const step = niceStep(Math.max(...all))
    const yMax = Math.ceil(Math.max(...all) / step) * step
    const x = (i) => pad.l + (i / (tr.years.length - 1)) * (W - pad.l - pad.r)
    const y = (v) => H - pad.b - (v / yMax) * (H - pad.t - pad.b)
    const line = (vals) =>
      vals
        .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .join('')
    const ticks = Array.from(
      { length: Math.round(yMax / step) + 1 },
      (_, i) => step * i
    )
    const legend = top
      .map(
        (n, i) =>
          `<span class="atlas-trend_key"><i style="background:${TREND_COLORS[i]}"></i>${esc(n)}</span>`
      )
      .join('')
    // End labels, nudged apart vertically
    const ends = top
      .map((n, i) => ({ n, i, y: y(last(n)) }))
      .sort((a, b) => a.y - b.y)
    ends.forEach((e, k) => {
      if (k && e.y - ends[k - 1].y < 13) e.y = ends[k - 1].y + 13
    })
    holder.innerHTML =
      `<div class="atlas-trend_legend">${legend}<span class="atlas-trend_key"><i class="is-muted"></i>${names.length - top.length} more (listed in the table)</span></div>` +
      `<svg class="atlas-trend_svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${m.name}, ${tr.years[0]} to ${tr.years[tr.years.length - 1]}, ${names.length} countries. Values in the table below.`)}">` +
      ticks
        .map(
          (t) =>
            `<g class="atlas-trend_tick"><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(Math.round(t * 100) / 100)}</text></g>`
        )
        .join('') +
      tr.years
        .map((yr, i) =>
          i % 2 === 0
            ? `<text class="atlas-trend_year" x="${x(i)}" y="${H - 6}" text-anchor="middle">${yr}</text>`
            : ''
        )
        .join('') +
      sorted
        .slice(top.length)
        .map(
          (n) =>
            `<path class="atlas-trend_line is-muted" d="${line(tr.series[n])}"/>`
        )
        .join('') +
      top
        .map(
          (n, i) =>
            `<path class="atlas-trend_line" d="${line(tr.series[n])}" stroke="${TREND_COLORS[i]}"/>`
        )
        .join('') +
      ends
        .map(
          (e) =>
            `<text class="atlas-trend_end" x="${W - pad.r + 8}" y="${e.y + 4}">${esc(e.n)}</text>`
        )
        .join('') +
      '</svg>'
    if (tableHolder) {
      tableHolder.className = 'atlas-trend_table'
      tableHolder.innerHTML =
        `<table><caption class="u-sr-only">${esc(m.name)} by country and year</caption><thead><tr><th scope="col">Year</th>${sorted.map((n) => `<th scope="col">${esc(n)}</th>`).join('')}</tr></thead><tbody>` +
        tr.years
          .map(
            (yr, i) =>
              `<tr><th scope="row">${yr}</th>${sorted.map((n) => `<td>${fmt(tr.series[n][i])}</td>`).join('')}</tr>`
          )
          .join('') +
        '</tbody></table>'
    }
  }

  // ── Update loop ──────────────────────────────────────────────────
  function update() {
    fillControls()
    current = table()
    renderBeacons()
    renderLegend()
    renderRanking()
    renderProfile()
    renderBand()
    if (drawer?.classList.contains('is-open') && activeTab === 'trend')
      renderTrend()
    writeUrl()
  }

  function resize() {
    const r = stage.getBoundingClientRect()
    if (!r.width || !r.height) return
    size = { w: r.width, h: r.height }
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`)
    apply(targetGeom(state.view))
    renderBeacons()
  }

  fillControls()
  root
    .querySelectorAll('[data-atlas-filter], [data-atlas-entity]')
    .forEach((el) => dropdowns.set(el, enhanceSelect(el)))
  viewBtns.forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.atlasView === state.view))
  )
  svg.classList.toggle('is-globe', state.view === 'globe')
  resize()
  update()
  root.classList.add('is-ready')
  if (qs.get('tab')) openDrawer(qs.get('tab'))

  return {
    resize,
  }
}
