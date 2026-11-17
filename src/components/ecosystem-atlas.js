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
//                                       [data-atlas-meta|score|rank], [data-atlas-pillars]
//                                       = last six years of the selected measure)
//   [data-atlas-measure]                Measure Details band ([data-measure-field])
//   [data-atlas-open="trend|definitions|scope|methodology"]  open the drawer
//   [data-atlas-drawer]                 drawer (tabs [data-drawer-tab], panels
//                                       [data-drawer-panel], [data-atlas-trend])
//   [data-def="<key>"]                  one CMS Measures card per measure
// Numbers come from dist/data/atlas.json, built from the lab's platform
// export by scripts/atlas-build.js (21 measures, countries + cities, series
// per year with n). Definitions come from the Measures CMS cards (keyed by
// measure code, e.g. F01) with the lab texts in the JSON as fallback.
// Deep link: ?m=CODE&e=entity&v=flat|globe&b=block&c=core|all&l=city|country
//            &i=industry-rank&f=variant&tab=drawer-tab
// --------------------------------------------------
import {
  geoPath,
  geoGraticule10,
  geoDistance,
  geoNaturalEarth1,
  geoNaturalEarth1Raw,
  geoOrthographicRaw,
  geoProjectionMutator,
  geoClipAntimeridian,
  geoClipCircle,
} from 'd3-geo'
import { feature, merge, mesh } from 'topojson-client'
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
  // Bold arrows (3px at 24px), as in the Figma buttons ("Show on map", "Read more",
  // block anchors, drawer rail)
  'arrow-right':
    '<path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="butt" stroke-linejoin="miter"/>',
  'arrow-left':
    '<path d="M20 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="butt" stroke-linejoin="miter"/>',
  'arrow-up-right':
    '<path d="M6 18 17.5 6.5M8 6h10v10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="butt" stroke-linejoin="miter"/>',
  'arrow-down':
    '<path d="M12 4v15m-6-6 6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="butt" stroke-linejoin="miter"/>',
  chevron:
    '<path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
}
const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
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

// Mid-morph the blended projection folds: the far side of the sphere maps
// back over the near side. Along the equator x = (1-a)·k·λ + a·sin λ
// (NaturalEarth1 ↔ Orthographic, k = 0.8707), so the horizontal scale is
// dx/dλ = (1-a)·k + a·cos λ, which hits 0 at the fold. Clipping right at the
// fold squeezes whatever sits there into thin slivers, so we clip where the
// scale has only dropped to a fraction r of its centre value (r shrinks to 0
// as the globe forms, landing exactly on the 90° horizon at alpha 1).
// Returns radians, or null when there is no fold (plain antimeridian cut).
function foldAngle(alpha) {
  if (alpha >= 0.999) return Math.PI / 2
  const k = 0.8707
  const centre = (1 - alpha) * k + alpha
  const r = 0.5 * Math.sqrt(1 - alpha)
  const c = (r * centre - (1 - alpha) * k) / alpha
  if (c <= -1) return null
  return Math.max(Math.PI / 2, Math.acos(c))
}
// d3's clip circle alone (wider than a hemisphere) lets shapes that cross
// the antimeridian wrap across the whole map as long straight lines. Cutting
// at the antimeridian as well (as the flat map does) keeps every ring closed
// on the visible side. At alpha 1 the antimeridian sits behind the globe.
function morphClip(angle) {
  if (angle === null) return geoClipAntimeridian
  if (angle <= Math.PI / 2 + 1e-6) return geoClipCircle(angle)
  const circle = geoClipCircle(angle)
  return (sink) => circle(geoClipAntimeridian(sink))
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

  // ── Entities ─────────────────────────────────────────────────────
  // One list holds both countries and cities (city: 1); values reference
  // them by index. Countries without a map position stay rankings-only.
  const ENTS = DATA.entities.map((e) => ({
    ...e,
    kind: e.city ? 'city' : 'country',
  }))
  const measures = DATA.measures
  const measureBy = new Map(measures.map((m) => [m.key, m]))
  const OPTIONS = {
    coverage: [
      ['core', 'Core ecosystems'],
      ['all', 'All (every published country / top-100 cities)'],
    ],
    level: [
      ['city', 'By city / metro'],
      ['country', 'By country'],
    ],
    industry: [
      ['0', '1st biggest'],
      ['1', '2nd biggest'],
      ['2', '3rd biggest'],
    ],
  }
  const RANK_WORD = ['Leading', '2nd', '3rd']

  // ── State (+ deep link) ──────────────────────────────────────────
  const qs = new window.URLSearchParams(window.location.search)
  const opt = (k, v) =>
    OPTIONS[k].some(([id]) => id === v) ? v : OPTIONS[k][0][0]
  const wantM = (qs.get('m') || '').toUpperCase()
  const state = {
    block: DATA.blocks.some((b) => b.id === qs.get('b')) ? qs.get('b') : 'all',
    measure: measureBy.has(wantM) ? wantM : measures[0].key,
    coverage: opt('coverage', qs.get('c')),
    industry: opt('industry', qs.get('i')),
    flow: /^\d$/.test(qs.get('f') || '') ? qs.get('f') : '0',
    level: opt('level', qs.get('l')),
    entity: qs.get('e') || null,
    view: qs.get('v') === 'flat' ? 'flat' : 'globe',
    hot: null,
  }
  const measure = () => measureBy.get(state.measure)
  // Country-only measures lock the level selector to countries
  const level = () => (measure().cityLevel ? state.level : 'country')
  const variantIdx = () => {
    const vs = measure().variants
    return vs ? clamp(+state.flow || 0, 0, vs.length - 1) : 0
  }

  function writeUrl() {
    const p = new window.URLSearchParams(window.location.search)
    const set = (k, v, def) => (v && v !== def ? p.set(k, v) : p.delete(k))
    set('m', state.measure, measures[0].key)
    set('b', state.block, 'all')
    set('c', state.coverage, 'core')
    set('i', state.industry, '0')
    set('f', state.flow, '0')
    set('l', state.level, 'city')
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
  // Each entity's value is its latest published year (years differ by
  // entity). Industry rank re-points F15 at the 2nd/3rd industry; a variant
  // re-points a measure published as a set of numbers (stock/new/exits...).
  // Ranks follow the measure's direction; colors use the rank percentile in
  // five steps so one outlier does not wash the rest of the map out.
  function table() {
    const base = measure()
    const lvl = level()
    const vi = variantIdx()
    const ir = base.industryRanks ? +state.industry : 0
    const v = base.variants?.[vi]
    const m = {
      ...base,
      unit: v?.unit || base.unit,
      direction: v?.direction || base.direction,
      variant: v?.label || '',
    }
    const rows = []
    for (const [ei, core, ni, series] of DATA.values[base.key]) {
      const ent = ENTS[ei]
      if ((lvl === 'city') !== (ent.kind === 'city')) continue
      if (state.coverage === 'core' && !core) continue
      let pts = series.map(([year, value, n, x = {}]) => ({
        year,
        value,
        n,
        x,
        top: x.inds?.[0]?.[0] || x.top || '',
      }))
      if (ir > 0)
        pts = pts
          .filter((p) => p.x.inds?.[ir])
          .map((p) => ({ ...p, value: p.x.inds[ir][1], top: p.x.inds[ir][0] }))
      if (vi > 0)
        pts = pts
          .filter((p) => p.x.vals?.[vi] != null)
          .map((p) => ({
            ...p,
            value: p.x.vals[vi],
            n: p.x.cnts?.[vi] ?? p.n,
          }))
      pts = pts.filter((p) => Number.isFinite(p.value))
      if (!pts.length) continue
      const last = pts[pts.length - 1]
      rows.push({
        ent,
        value: last.value,
        year: last.year,
        n: last.n,
        top: last.top,
        last,
        series: pts,
        note: DATA.notes[ni] || '',
      })
    }
    rows.sort((a, b) =>
      m.direction === 'lower' ? a.value - b.value : b.value - a.value
    )
    const count = rows.length
    rows.forEach((r, i) => {
      r.rank = i + 1
      r.t = count > 1 ? (count - 1 - i) / (count - 1) : 1
      r.bin = Math.min(4, Math.floor(r.t * 5))
    })
    const vals = rows.map((r) => r.value)
    return {
      m,
      rows,
      lo: Math.min(...vals),
      hi: Math.max(...vals),
      level: lvl,
      industryRank: ir,
      many: count > 30,
    }
  }

  // ── Controls ─────────────────────────────────────────────────────
  // Native <select>s stay as the source of truth; enhanceSelect draws the
  // custom dropdown on top and is refreshed after every option rewrite.
  const dropdowns = new Map()
  const fill = (el, items, value) => {
    if (!el) return
    el.innerHTML = items
      .map(
        ([v, l, off]) =>
          `<option value="${esc(v)}"${off ? ' disabled' : ''}>${esc(l)}</option>`
      )
      .join('')
    el.value = value
    dropdowns.get(el)?.refresh()
  }
  const lock = (el, locked, title) => {
    if (!el) return
    el.disabled = locked
    el.title = title
    dropdowns.get(el)?.refresh()
  }
  function fillControls() {
    fill(
      select('block'),
      [
        ['all', `All measures (${measures.length})`],
        ...DATA.blocks.map((b) => [
          b.id,
          `${b.name} (${measures.filter((m) => m.block === b.id).length})`,
        ]),
      ],
      state.block
    )
    // Measures in lab order, grouped by theme inside the chosen block
    const list = measures
      .filter((m) => state.block === 'all' || m.block === state.block)
      .sort(
        (a, b) =>
          (state.block === 'all' ? a.block.localeCompare(b.block) : 0) ||
          a.themeRank - b.themeRank
      )
    if (!list.some((m) => m.key === state.measure)) state.measure = list[0].key
    fill(
      select('measure'),
      list.map((m) => [m.key, m.name]),
      state.measure
    )
    const m = measure()
    fill(select('coverage'), OPTIONS.coverage, state.coverage)
    // Level stays open even for country-only measures: the city option is
    // listed but disabled with the reason, so the control never looks broken
    fill(
      select('level'),
      OPTIONS.level.map(([v, l]) =>
        v === 'city' && !m.cityLevel
          ? [v, `${l} (not available, country data only)`, true]
          : [v, l]
      ),
      level()
    )
    lock(
      select('level'),
      false,
      m.cityLevel ? '' : 'This measure is computed at country level only'
    )
    fill(
      select('industry'),
      OPTIONS.industry,
      m.industryRanks ? state.industry : '0'
    )
    lock(
      select('industry'),
      !m.industryRanks,
      m.industryRanks
        ? 'Switch between the 1st, 2nd and 3rd biggest industry by deal count'
        : 'Only the leading-industry measure ranks industries'
    )
    fill(
      select('flow'),
      m.variants
        ? m.variants.map((v, i) => [String(i), v.label])
        : [['0', 'Not applicable']],
      String(variantIdx())
    )
    lock(
      select('flow'),
      !m.variants,
      m.variants
        ? `This measure is published as ${m.variants.length} numbers`
        : 'Only measures published as a set of numbers have this'
    )
  }
  root.querySelectorAll('[data-atlas-filter]').forEach((el) =>
    el.addEventListener('change', () => {
      const k = el.dataset.atlasFilter
      state[k] = el.value
      if (k === 'measure' || k === 'block') {
        state.flow = '0'
        state.industry = '0'
      }
      update()
    })
  )

  // Filter button collapses the whole panel (filters + results) into just
  // the round button, like closing a popup, and expands it back. The panel
  // shrinks with a clip-path into the button, then the freed space closes.
  const toggle = root.querySelector('[data-atlas-filters-toggle]')
  let syncPanelSpace = () => {}
  const panel = root.querySelector('.atlas_panel')
  if (toggle && panel) {
    if (!panel.id) panel.id = 'atlas-panel'
    toggle.setAttribute('aria-controls', panel.id)
    toggle.setAttribute('aria-label', 'Hide filters and results')
    const insetTo = (btnRect, boxRect) =>
      `inset(${btnRect.top - boxRect.top}px ${boxRect.right - btnRect.right}px ` +
      `${boxRect.bottom - btnRect.bottom}px ${btnRect.left - boxRect.left}px round 100px)`
    const full = 'inset(0px 0px 0px 0px round 24px)'
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'
    let busy = false
    // The open panel overlaps the bottom of the map (negative top margin).
    // Collapsed to the round button it still sits over the map, so it keeps
    // a bottom margin that holds the page below at the map's bottom edge.
    const keepSpace = () => {
      const overlap = -parseFloat(window.getComputedStyle(panel).marginTop) || 0
      return Math.max(0, overlap - panel.getBoundingClientRect().height)
    }
    syncPanelSpace = () => {
      if (panel.classList.contains('is-collapsed'))
        panel.style.marginBottom = `${keepSpace()}px`
    }
    const setOpen = (open) => {
      panel.classList.toggle('is-collapsed', !open)
      toggle.setAttribute('aria-expanded', String(open))
      toggle.setAttribute(
        'aria-label',
        open ? 'Hide filters and results' : 'Show filters and results'
      )
    }
    toggle.addEventListener('click', () => {
      if (busy) return
      const open = toggle.getAttribute('aria-expanded') !== 'true'
      if (reduced || !panel.animate) return setOpen(open)
      busy = true
      if (!open) {
        const box = panel.getBoundingClientRect()
        const clip = insetTo(toggle.getBoundingClientRect(), box)
        panel
          .animate([{ clipPath: full }, { clipPath: clip }], {
            duration: 380,
            easing: ease,
          })
          .finished.then(() => {
            setOpen(false)
            const gap = box.height - panel.getBoundingClientRect().height
            const keep = keepSpace()
            panel.style.marginBottom = `${keep}px`
            return panel.animate(
              [{ marginBottom: `${gap}px` }, { marginBottom: `${keep}px` }],
              { duration: 320, easing: ease }
            ).finished
          })
          .finally(() => (busy = false))
      } else {
        const before =
          panel.getBoundingClientRect().height +
          (parseFloat(panel.style.marginBottom) || 0)
        setOpen(true)
        panel.style.marginBottom = ''
        const box = panel.getBoundingClientRect()
        const clip = insetTo(toggle.getBoundingClientRect(), box)
        const gap = box.height - before
        Promise.all([
          panel.animate([{ clipPath: clip }, { clipPath: full }], {
            duration: 420,
            easing: ease,
          }).finished,
          panel.animate(
            [{ marginBottom: `${-gap}px` }, { marginBottom: '0px' }],
            { duration: 420, easing: ease }
          ).finished,
        ]).finally(() => (busy = false))
      }
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
  // Land is drawn in three layers so clipped edges never show as lines:
  // one merged silhouette (base fill), per-country paths only for colored
  // countries (no stroke), and a borders mesh on top (lines, not outlines).
  const geoms = WORLD.objects.countries.geometries.filter((g) => g.id !== '010')
  const landAll = merge(WORLD, geoms)
  const borders = mesh(
    WORLD,
    { type: 'GeometryCollection', geometries: geoms },
    (a, b) => a !== b
  )
  const proj = blendProjection().precision(0.3)
  const path = geoPath(proj)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'atlas_svg')
  svg.innerHTML =
    '<g data-layer="map"><g data-layer="base"><path class="atlas_sphere-fill"/><path class="atlas_grat"/></g>' +
    '<path class="atlas_land"/><g data-layer="land"></g><path class="atlas_borders"/><path class="atlas_sphere"/></g>' +
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
  const landBase = svg.querySelector('.atlas_land')
  const bordersPath = svg.querySelector('.atlas_borders')
  const landPaths = world.map((f) => {
    const p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute('class', 'atlas_country')
    layer('land').appendChild(p)
    return { f, p }
  })
  const grat = geoGraticule10()
  const sphere = { type: 'Sphere' }

  let geom = { alpha: 1, rotate: GLOBE_HOME, scale: 1, translate: [0, 0] }
  let size = { w: 0, h: 0 }
  const isSmall = () => size.w < 768

  // The whole globe fits the stage: it sits on the bottom of the stage and
  // grows as large as it can without touching the header text/controls if
  // they overlap the top of the stage. The filters panel floats over it.
  // Obstacles are measured in resize(), in stage coordinates.
  let obstacles = []
  let bottomInset = 0
  function measureFit(stageRect) {
    const gap = 16
    obstacles = ['.atlas_intro', '.atlas_controls']
      .map((sel) => root.querySelector(sel))
      .filter(Boolean)
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width && b.bottom > stageRect.top)
      .map((b) => ({
        l: b.left - stageRect.left - gap,
        r: b.right - stageRect.left + gap,
        t: b.top - stageRect.top - gap,
        b: b.bottom - stageRect.top + gap,
      }))
    // The filters panel floats over the lower part of the globe (collapse it
    // to the round button to reveal the rest), so only a small gap is kept.
    bottomInset = gap
  }
  function globeFit() {
    const { w, h } = size
    const cx = w / 2
    const floor = h - bottomInset
    const fits = (r) => {
      const cy = floor - r
      if (cy - r < 4) return false
      return obstacles.every((o) => {
        const dx = Math.max(o.l - cx, 0, cx - o.r)
        const dy = Math.max(o.t - cy, 0, cy - o.b)
        return dx * dx + dy * dy >= r * r
      })
    }
    let lo = 40
    let hi = Math.min(w / 2 - 8, floor / 2)
    if (!fits(lo)) return { r: lo, cy: floor - lo }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
    return { r: lo, cy: floor - lo }
  }

  function targetGeom(view) {
    const { w, h } = size
    const ent =
      state.entity && current.rows.find((r) => r.ent.id === state.entity)?.ent
    if (view === 'globe') {
      const rotate = ent
        ? [-ent.lng, -clamp(ent.lat, -40, 55) * 0.7]
        : geom.alpha > 0.5
          ? geom.rotate
          : GLOBE_HOME
      const { r, cy } = globeFit()
      return { alpha: 1, rotate, scale: r, translate: [w / 2, cy] }
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
  let clipAngle = Math.PI / 2
  function apply(g) {
    geom = g
    clipAngle = foldAngle(g.alpha)
    proj
      .alpha(g.alpha)
      .rotate(g.rotate)
      .scale(g.scale)
      .translate(g.translate)
      .preclip(morphClip(clipAngle))
    // Sphere fill/outline (the globe rim) fade in as the map curves
    const globeness = clamp((g.alpha - 0.25) / 0.6, 0, 1)
    sphereFill.setAttribute('d', path(sphere) || '')
    sphereFill.style.opacity = globeness
    sphereLine.setAttribute('d', path(sphere) || '')
    sphereLine.style.opacity = globeness
    gratPath.setAttribute('d', path(grat) || '')
    gratPath.style.opacity = globeness
    landBase.setAttribute('d', path(landAll) || '')
    landPaths.forEach(({ f, p }) => p.setAttribute('d', path(f) || ''))
    bordersPath.setAttribute('d', path(borders) || '')
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
    clipAngle === null ||
    geoDistance([ent.lng, ent.lat], [-geom.rotate[0], -geom.rotate[1]]) <
      clipAngle - 0.04
  function radius(r) {
    const k = isSmall() ? 0.75 : 1
    if (current.level === 'country') return 4 * k
    if (current.m.kind === 'count' && !current.many) {
      const mx = Math.max(...current.rows.map((x) => x.value)) || 1
      return Math.max(4, Math.sqrt(Math.max(0, r.value) / mx) * 24) * k
    }
    return (current.many ? 3 + r.t * 4 : 6 + r.t * 7) * k
  }
  // Units that start with % read as a suffix ("1.2% of GDP"); others follow
  // the number after a space ("14 months")
  const unit = (m) =>
    !m.unit ? '' : m.unit.startsWith('%') ? m.unit : ` ${m.unit}`
  function renderBeacons() {
    const g = layer('beacons')
    g.innerHTML = ''
    const countryMode = current.level === 'country'
    beacons = current.rows
      .filter((r) => r.ent.lat != null && r.ent.lng != null)
      .map((r) => {
        const b = document.createElementNS(SVG_NS, 'g')
        b.setAttribute('class', 'atlas_beacon')
        b.setAttribute('tabindex', '0')
        b.setAttribute('role', 'button')
        b.setAttribute(
          'aria-label',
          `${r.ent.name}, ${fmt(r.value)}${unit(current.m)} in ${r.year}, rank ${r.rank} of ${current.rows.length}`
        )
        b.dataset.id = r.ent.id
        const rad = radius(r)
        b.innerHTML = `<circle class="atlas_beacon-halo" r="${rad + (current.many ? 4 : 7)}"/><circle class="atlas_beacon-dot" r="${rad}"/>`
        b.style.setProperty('--beacon', BIN_VARS[r.bin])
        if (current.m.kind === 'count' && !countryMode && !current.many)
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
    // Countries: fill land by score; cities: tint the countries that host one
    const scored = new Map()
    const hosts = new Set()
    current.rows.forEach((r) => {
      if (!r.ent.iso) return
      if (countryMode) scored.set(r.ent.iso, r)
      else hosts.add(r.ent.iso)
    })
    landPaths.forEach(({ f, p }) => {
      const r = scored.get(String(f.id))
      p.style.fill = r ? BIN_VARS[r.bin] : ''
      p.style.stroke = p.style.fill
      p.classList.toggle('is-scored', !!r)
      p.classList.toggle('is-tracked', hosts.has(String(f.id)))
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
    const limit = current.many ? 12 : isSmall() ? 6 : 99
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
    tip.innerHTML = `<strong>${esc(x.r.ent.name)}</strong><span>${esc(fmt(x.r.value))}${esc(unit(current.m))} (${x.r.year}) · #${x.r.rank} of ${current.rows.length}</span>`
    tip.style.left = `${x.xy[0]}px`
    tip.style.top = `${x.xy[1] - x.rad - 8}px`
    tip.classList.add('is-visible')
  }

  // ── View toggle ──────────────────────────────────────────────────
  const viewBtns = [...root.querySelectorAll('[data-atlas-view]')]
  // Flat ↔ globe: one continuous projection morph (NaturalEarth1 ↔
  // Orthographic, the d3 "projection mutator" technique) with rotation,
  // scale and position interpolated on the same eased clock. foldAngle /
  // morphClip keep the far side hidden at every frame, so nothing folds,
  // jumps or leaves lines. The globe lands straight on its centered view.
  function setView(v, animate = true) {
    state.view = v
    viewBtns.forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.atlasView === v))
    )
    svg.classList.toggle('is-globe', v === 'globe')
    writeUrl()
    animateTo(targetGeom(v), animate ? 1300 : 0)
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
        `Color scale in five steps by rank: darker ranks higher. Range ${fmt(current.lo)} to ${fmt(current.hi)}${unit(current.m)}`
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
    const r =
      current.rows.find((x) => x.ent.id === state.entity) || current.rows[0]
    if (!r) return
    const ent = r.ent
    fill(
      entitySelect,
      [...current.rows]
        .sort((a, b) => a.ent.name.localeCompare(b.ent.name))
        .map((x) => [x.ent.id, x.ent.name]),
      ent.id
    )
    const set = (sel, t) => {
      const el = profile.querySelector(sel)
      if (el) el.textContent = t
    }
    set(
      '[data-atlas-meta]',
      [ent.kind === 'city' ? ent.country : '', ent.region]
        .filter(Boolean)
        .join(' · ')
    )
    // Extra context line: industry (F15/F08) or the full set of numbers for
    // measures published as several (a net is never read without its gross)
    let extra = profile.querySelector('[data-atlas-extra]')
    if (!extra) {
      extra = document.createElement('p')
      extra.className = 'atlas_meta'
      extra.dataset.atlasExtra = ''
      profile.querySelector('[data-atlas-meta]')?.after(extra)
    }
    const vs = current.m.variants
    const lastRaw = r.last.x
    extra.textContent = r.top
      ? `${RANK_WORD[current.industryRank] || 'Leading'} industry ${r.year}: ${r.top}`
      : vs && lastRaw.vals
        ? vs
            .map(
              (v, i) =>
                `${v.label.replace(/ \(.*\)/, '')}: ${fmt(lastRaw.vals[i])}`
            )
            .join(' · ')
        : ''
    extra.hidden = !extra.textContent
    // Score slot: latest value (label carries its year); rank of N
    const score = profile.querySelector('[data-atlas-score]')
    if (score) {
      score.textContent = fmt(r.value)
      const label = score.parentElement?.querySelector('.atlas_label')
      if (label) label.textContent = `Value ${r.year}`
      score.title = `${fmt(r.value)}${unit(current.m)} in ${r.year}${r.n != null ? ` (n = ${r.n})` : ''}`
    }
    const rankEl = profile.querySelector('[data-atlas-rank]')
    if (rankEl)
      rankEl.innerHTML = `${r.rank}<small>/${current.rows.length}</small>`
    // Year by year (last 6 published years), bars scaled to this entity's own
    // min-max so year-to-year differences stay visible
    const ul = profile.querySelector('[data-atlas-pillars]')
    if (ul) {
      const pts = r.series.slice(-6)
      const vals = r.series.map((p) => p.value)
      const lo = Math.min(...vals)
      const span = Math.max(...vals) - lo
      const pct = (v) => (span === 0 ? 60 : 6 + 94 * ((v - lo) / span))
      const prev = barWidths(ul)
      ul.setAttribute('aria-label', `${ent.name}, ${current.m.name} by year`)
      ul.innerHTML = pts
        .map(
          (p) =>
            `<li class="atlas_pillar"><span class="atlas_pillar-name">${p.year}${p.top && current.m.industryRanks ? ` · ${esc(p.top)}` : ''}</span><span class="atlas_pillar-bar" aria-hidden="true"><span data-key="${p.year}" data-to="${pct(p.value).toFixed(1)}%"></span></span><span class="atlas_pillar-value">${esc(fmt(p.value))}</span></li>`
        )
        .join('')
      animateBars(ul, prev)
    }
  }

  // Clicking selects (never toggles off): a double click or a second click
  // on the same row/beacon keeps it, instead of falling back to the leader
  function selectEntity(id) {
    if (state.entity === id) return
    state.entity = id
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
    // CMS card first (editable copy), JSON from the lab as fallback. Unit,
    // direction and range follow the current selection (variants change them).
    set('block', d.block || block?.name || '')
    set('unit', `Unit: ${unitLabel(m.unit)}`)
    set(
      'direction',
      m.direction === 'lower' ? 'Lower is better' : 'Higher is better'
    )
    set('name', `${d.name || m.name}${m.variant ? ` · ${m.variant}` : ''}`)
    set('definition', d.definition || m.definition || 'Definition coming soon.')
    const how = d.how || m.construction
    set('how', how ? `How it's built: ${how}` : '')
    set('notes', d.notes || m.caveat || '')
    const range = current.rows.length
      ? `${fmt(current.lo)}–${fmt(current.hi)}${unit(m)}`
      : ''
    set(
      'source',
      [
        (d.source || m.source) && `Source: ${d.source || m.source}`,
        range && `Observed range: ${range}`,
      ]
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
  function showTab(tab, animate = true) {
    const prevTab = activeTab
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
    // Tab change: content slides in from the side it comes from
    const shown = panels.find((p) => !p.hidden)
    if (animate && !reduced && shown && prevTab !== activeTab) {
      const dir = TABS.indexOf(activeTab) > TABS.indexOf(prevTab) ? 1 : -1
      shown.animate(
        [
          { transform: `translateX(${dir * 24}px)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 420, easing: EASE_OUT }
      )
    }
  }
  // Drawer motion: overlay fades, the panel slides in from the right (from
  // the bottom on mobile) with a soft overshoot-free ease, the rail buttons
  // pop in staggered and the content rises a beat later. Closing reverses
  // it faster. Reduced motion: instant.
  const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
  const EASE_IN = 'cubic-bezier(0.7, 0, 0.84, 0)'
  let drawerAnims = []
  const isMobile = () => window.matchMedia('(max-width: 767px)').matches
  function drawerParts() {
    return {
      overlay: drawer.querySelector('.person-modal_overlay'),
      panel: drawer.querySelector('.atlas-drawer_panel'),
      btns: [...drawer.querySelectorAll('.person-modal_btn')],
      content: drawer.querySelector('[data-drawer-panel]:not([hidden])'),
      tabs: drawer.querySelector('.atlas-drawer_tabs'),
    }
  }
  function runDrawer(open) {
    drawerAnims.forEach((a) => a.cancel())
    drawerAnims = []
    if (reduced) return Promise.resolve()
    const { overlay, panel, btns, content, tabs } = drawerParts()
    const off = isMobile() ? 'translateY(48px)' : 'translateX(64px)'
    const d = open ? 1 : -1
    const opts = (duration, delay = 0) => ({
      duration,
      delay: open ? delay : 0,
      easing: open ? EASE_OUT : EASE_IN,
      fill: 'both',
      direction: d > 0 ? 'normal' : 'reverse',
    })
    if (overlay)
      drawerAnims.push(
        overlay.animate(
          [{ opacity: 0 }, { opacity: 0.6 }],
          opts(open ? 450 : 280)
        )
      )
    if (panel)
      drawerAnims.push(
        panel.animate(
          [
            { transform: off, opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          opts(open ? 650 : 300)
        )
      )
    btns.forEach((b, i) =>
      drawerAnims.push(
        b.animate(
          [
            { transform: 'scale(0.6)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          opts(open ? 450 : 220, 120 + i * 60)
        )
      )
    )
    ;[tabs, content].filter(Boolean).forEach((el, i) =>
      drawerAnims.push(
        el.animate(
          [
            { transform: 'translateY(12px)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          opts(open ? 550 : 200, 140 + i * 70)
        )
      )
    )
    return Promise.all(drawerAnims.map((a) => a.finished)).catch(() => {})
  }
  function openDrawer(tab) {
    if (!drawer) return
    lastFocus = document.activeElement
    showTab(tab, false)
    drawer.setAttribute('aria-hidden', 'false')
    drawer.classList.add('is-open')
    document.documentElement.classList.add('is-atlas-drawer-open')
    runDrawer(true).then(() => {
      if (drawer.classList.contains('is-open'))
        drawerAnims.forEach((a) => a.cancel())
    })
    requestAnimationFrame(() =>
      drawer
        .querySelector(`[data-drawer-tab="${activeTab}"]`)
        ?.focus({ preventScroll: true })
    )
  }
  let closing = false
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('is-open') || closing) return
    closing = true
    drawer.setAttribute('aria-hidden', 'true')
    runDrawer(false).then(() => {
      drawer.classList.remove('is-open')
      drawerAnims.forEach((a) => a.cancel())
      drawerAnims = []
      closing = false
      document.documentElement.classList.remove('is-atlas-drawer-open')
      lastFocus?.focus?.({ preventScroll: true })
    })
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
          `<a class="atlas-drawer_anchor" href="#${d.card.id}"><span>${esc(blockName)}</span>${icon('arrow-down', 16)}</a>`
        )
      }
      const unitEl = d.card.querySelector('[data-def-field="unit"]')
      if (unitEl && d.unit) unitEl.textContent = `Unit: ${d.unit}`
      const show = d.card.querySelector('[data-def-show]')
      if (show) {
        // Webflow text ends with a "↗" character: swap it for the icon
        const label = show.textContent.replace(/\s*[↗→]\s*$/, '').trim()
        show.innerHTML = `<span>${esc(label)}</span>${icon('arrow-up-right', 16)}`
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

  // Trend figure: one line per location in the current view (top 8 by rank
  // colored, the rest muted) + the full data table, locations x years
  function renderTrend() {
    const holder = drawer.querySelector('[data-atlas-trend]')
    const tableHolder = drawer.querySelector('[data-atlas-trend-table]')
    if (!holder) return
    const m = current.m
    const rows = current.rows
    const title = drawer.querySelector('[data-trend-title]')
    const metaEl = drawer.querySelector('[data-trend-meta]')
    const years = [
      ...new Set(rows.flatMap((r) => r.series.map((p) => p.year))),
    ].sort((a, b) => a - b)
    if (title)
      title.textContent = `${defs.get(m.key)?.name || m.name}${m.variant ? ` · ${m.variant}` : ''}`
    const what = current.level === 'city' ? 'cities / metros' : 'countries'
    if (metaEl)
      metaEl.textContent = rows.length
        ? `${unitLabel(m.unit)} · ${rows.length} ${what} · ${years[0]}-${years[years.length - 1]}`
        : 'No data for this selection'
    if (!rows.length) {
      holder.innerHTML = ''
      if (tableHolder) tableHolder.innerHTML = ''
      return
    }
    const top = rows.slice(0, TREND_COLORS.length)
    const W = Math.max(320, holder.clientWidth || 800)
    const H = 360
    const pad = { l: 52, r: 128, t: 16, b: 28 }
    const all = rows.flatMap((r) => r.series.map((p) => p.value))
    const lo0 = Math.min(0, ...all)
    const hi0 = Math.max(0, ...all)
    const step = niceStep(hi0 - lo0 || 1)
    const yMin = Math.floor(lo0 / step) * step
    const yMax = Math.ceil(hi0 / step) * step || step
    const xi = new Map(years.map((y, i) => [y, i]))
    const x = (yr) =>
      pad.l +
      (years.length > 1 ? xi.get(yr) / (years.length - 1) : 0.5) *
        (W - pad.l - pad.r)
    const y = (v) =>
      H - pad.b - ((v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b)
    // Gaps in a series break the line instead of bridging missing years
    const line = (pts) =>
      pts
        .map((p, i) => {
          const gap = i && xi.get(p.year) - xi.get(pts[i - 1].year) > 1
          return `${!i || gap ? 'M' : 'L'}${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`
        })
        .join('')
    const ticks = Array.from(
      { length: Math.round((yMax - yMin) / step) + 1 },
      (_, i) => yMin + step * i
    )
    const legend = top
      .map(
        (r, i) =>
          `<span class="atlas-trend_key"><i style="background:${TREND_COLORS[i]}"></i>${esc(r.ent.name)}</span>`
      )
      .join('')
    const ends = top
      .map((r, i) => ({ n: r.ent.name, i, y: y(r.value), x: x(r.year) }))
      .sort((a, b) => a.y - b.y)
    ends.forEach((e, k) => {
      if (k && e.y - ends[k - 1].y < 13) e.y = ends[k - 1].y + 13
    })
    const tickFmt = (t) => fmt(Math.round(t * 1000) / 1000)
    const yearEvery = Math.max(1, Math.ceil(years.length / 8))
    holder.innerHTML =
      `<div class="atlas-trend_legend">${legend}${rows.length > top.length ? `<span class="atlas-trend_key"><i class="is-muted"></i>${rows.length - top.length} more (listed in the table)</span>` : ''}</div>` +
      `<svg class="atlas-trend_svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${m.name}, ${years[0]} to ${years[years.length - 1]}, ${rows.length} ${what}. Values in the table below.`)}">` +
      ticks
        .map(
          (t) =>
            `<g class="atlas-trend_tick"><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${tickFmt(t)}</text></g>`
        )
        .join('') +
      years
        .map((yr, i) =>
          i % yearEvery === 0
            ? `<text class="atlas-trend_year" x="${x(yr)}" y="${H - 6}" text-anchor="middle">${yr}</text>`
            : ''
        )
        .join('') +
      rows
        .slice(top.length)
        .map(
          (r) =>
            `<path class="atlas-trend_line is-muted" d="${line(r.series)}"/>`
        )
        .join('') +
      top
        .map(
          (r, i) =>
            `<path class="atlas-trend_line" d="${line(r.series)}" stroke="${TREND_COLORS[i]}"/>`
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
        `<table><caption class="u-sr-only">${esc(m.name)} by location and year</caption><thead><tr><th scope="col">${current.level === 'city' ? 'City / metro' : 'Country'}</th>${years.map((yr) => `<th scope="col">${yr}</th>`).join('')}</tr></thead><tbody>` +
        rows
          .map((r) => {
            const byYear = new Map(r.series.map((p) => [p.year, p.value]))
            return `<tr><th scope="row">${esc(r.ent.name)}</th>${years.map((yr) => `<td>${byYear.has(yr) ? fmt(byYear.get(yr)) : ''}</td>`).join('')}</tr>`
          })
          .join('') +
        '</tbody></table>'
    }
  }

  // ── Update loop ──────────────────────────────────────────────────
  function update() {
    fillControls()
    current = table()
    if (state.entity && !current.rows.some((r) => r.ent.id === state.entity))
      state.entity = null
    renderBeacons()
    renderLegend()
    renderRanking()
    renderProfile()
    renderBand()
    if (drawer?.classList.contains('is-open') && activeTab === 'trend')
      renderTrend()
    writeUrl()
  }

  // Load animation, played once when the map scrolls into view: the map
  // settles in from a slight zoom, then beacons pop in by rank and the
  // labels fade in. Only opacity/transform on layers, so it stays cheap.
  function playIntro() {
    if (reduced || !svg.animate || !('IntersectionObserver' in window)) return
    svg.style.opacity = '0'
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        svg.style.opacity = ''
        const [cx, cy] = proj.translate()
        const mapG = layer('map')
        mapG.style.transformBox = 'view-box'
        mapG.style.transformOrigin = `${cx}px ${cy}px`
        mapG.animate(
          [
            { opacity: 0, transform: 'scale(0.9)' },
            { opacity: 1, transform: 'scale(1)' },
          ],
          { duration: 1200, easing: EASE_OUT }
        )
        const order = [...beacons].sort((a, b) => a.r.rank - b.r.rank)
        order.forEach((x, i) =>
          x.b.querySelectorAll('circle').forEach((c) => {
            c.style.transformBox = 'fill-box'
            c.style.transformOrigin = 'center'
            c.animate(
              [
                { opacity: 0, transform: 'scale(0)' },
                { opacity: 1, transform: 'scale(1)' },
              ],
              {
                duration: 520,
                delay: 450 + i * 45,
                easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                fill: 'backwards',
              }
            )
          })
        )
        layer('labels').animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 500,
          delay: 650 + order.length * 45,
          easing: 'ease-out',
          fill: 'backwards',
        })
      },
      { threshold: 0.2 }
    )
    io.observe(stage)
  }

  function resize() {
    const r = stage.getBoundingClientRect()
    if (!r.width || !r.height) return
    size = { w: r.width, h: r.height }
    measureFit(r)
    syncPanelSpace()
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
  playIntro()
  if (qs.get('tab')) openDrawer(qs.get('tab'))

  return {
    resize,
  }
}
