// --------------------------------------------------
// ecosystem-map
// --------------------------------------------------
// Draws the world map of tracked ecosystems into [data-map-canvas] from
// dist/data/ecosystem-map.json, toggles between metric A / B
// ([data-map-metric]) and shows a tooltip ([data-map-tip]) on hover/focus.
// --------------------------------------------------
import { loadJson, reducedMotion, easeOutCubic } from '../utils/motion.js'
import '../styles/ecosystem-map.css'

const SVG_NS = 'http://www.w3.org/2000/svg'
// Label side per city so names never collide: a(bove) b(elow) l(eft) r(ight)
const LABEL_SIDE = {
  'San Francisco Bay': 'l',
  Toronto: 'a',
  Boston: 'r',
  'New York': 'b',
  London: 'l',
  Paris: 'b',
  Berlin: 'r',
  Stockholm: 'a',
  'Tel Aviv': 'b',
  Nairobi: 'r',
  Beijing: 'a',
  Shenzhen: 'b',
  Singapore: 'r',
  Jakarta: 'b',
  'São Paulo': 'r',
}
// Mobile zoom regions (map units, 4:3 to match the mobile canvas)
const REGIONS = [
  { key: 'americas', label: 'Americas', box: [110, 200, 460, 345] },
  { key: 'emea', label: 'Europe & Africa', box: [500, 130, 440, 330] },
  { key: 'asia', label: 'Asia', box: [860, 200, 400, 300] },
  { key: 'world', label: 'World', box: null },
]
const MOBILE = '(max-width: 767px)'

// Score tiers → brand color tokens and dot radius (map units)
const tier = (v) =>
  v >= 90
    ? ['var(--_color---secondary--deep-blue)', 10]
    : v >= 80
      ? ['var(--_color---secondary--bright-blue)', 8]
      : v >= 70
        ? ['var(--_color---secondary--teal)', 7]
        : ['var(--_color---secondary--bright-teal)', 5.5]

function placeLabel(g, c, r) {
  const n = g.querySelector('.map_city-name')
  const v = g.querySelector('.map_city-value')
  const side = g.dataset.side
  const gap = 6
  const set = (el, x, y, anchor) => {
    el.setAttribute('x', x)
    el.setAttribute('y', y)
    el.style.textAnchor = anchor
  }
  if (side === 'a') {
    set(n, c.x, c.y - r - gap - 16, 'middle')
    set(v, c.x, c.y - r - gap, 'middle')
  } else if (side === 'b') {
    set(n, c.x, c.y + r + gap + 12, 'middle')
    set(v, c.x, c.y + r + gap + 28, 'middle')
  } else if (side === 'l') {
    set(n, c.x - r - gap, c.y - 2, 'end')
    set(v, c.x - r - gap, c.y + 14, 'end')
  } else {
    set(n, c.x + r + gap, c.y - 2, 'start')
    set(v, c.x + r + gap, c.y + 14, 'start')
  }
}

export default async function (elements) {
  let MAP
  try {
    MAP = await loadJson('ecosystem-map.json')
  } catch (error) {
    console.error('[ecosystem-map] data failed to load', error)
    return
  }
  const reduced = reducedMotion()

  elements.forEach((card) => {
    const holder = card.querySelector('[data-map-canvas]')
    const tip = card.querySelector('[data-map-tip]')
    const toggles = [...card.querySelectorAll('[data-map-metric]')]
    if (!holder) return

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${MAP.W} ${MAP.H}`)
    svg.setAttribute('class', 'map_svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML =
      `<path class="map_grat" d="${MAP.grat}"/>` +
      MAP.countries
        .map(
          (c) =>
            `<path class="map_country${c.h ? ' is-tracked' : ''}" d="${c.d}"/>`
        )
        .join('')

    const cities = MAP.cities.map((c) => {
      const g = document.createElementNS(SVG_NS, 'g')
      g.setAttribute('class', 'map_city')
      g.setAttribute('tabindex', '0')
      g.setAttribute('role', 'button')
      g.dataset.side = LABEL_SIDE[c.n] || 'a'
      const [col, r] = tier(c.a)
      g.innerHTML =
        `<circle class="map_city-ring" cx="${c.x}" cy="${c.y}" r="${r}"/>` +
        `<circle class="map_city-dot" cx="${c.x}" cy="${c.y}" r="${r}"/>` +
        `<text class="map_city-name"></text><text class="map_city-value">${c.a}</text>`
      g.querySelector('.map_city-name').textContent = c.n
      g.style.setProperty('--city-color', col)
      placeLabel(g, c, r)
      svg.appendChild(g)
      return { g, c }
    })
    holder.appendChild(svg)

    // ── Mobile: region chips that zoom the viewBox ───────────────────
    const full = [0, 0, MAP.W, MAP.H]
    let view = full.slice()
    let anim = 0
    const setView = (b) => {
      view = b
      svg.setAttribute('viewBox', b.map((n) => n.toFixed(1)).join(' '))
    }
    const zoomTo = (target) => {
      cancelAnimationFrame(anim)
      const from = view.slice()
      if (reduced) return setView(target)
      const t0 = performance.now()
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 700)
        const e = 1 - Math.pow(1 - p, 4)
        setView(from.map((v, i) => v + (target[i] - v) * e))
        if (p < 1) anim = requestAnimationFrame(step)
      }
      anim = requestAnimationFrame(step)
    }
    const mobile = window.matchMedia(MOBILE)
    let chips = null
    const selectRegion = (key) => {
      const r = REGIONS.find((x) => x.key === key) || REGIONS[0]
      svg.classList.toggle('is-world', !r.box)
      if (chips)
        chips.querySelectorAll('.map_region').forEach((b) => {
          const on = b.dataset.region === r.key
          b.classList.toggle('is-active', on)
          b.setAttribute('aria-pressed', String(on))
        })
      zoomTo(r.box || full)
    }
    const setMode = () => {
      if (mobile.matches && !chips) {
        chips = document.createElement('div')
        chips.className = 'map_regions'
        chips.setAttribute('role', 'group')
        chips.setAttribute('aria-label', 'Zoom to region')
        REGIONS.forEach((r) => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'map_region'
          b.dataset.region = r.key
          b.textContent = r.label
          b.addEventListener('click', () => selectRegion(r.key))
          chips.appendChild(b)
        })
        holder.before(chips)
        selectRegion(REGIONS[0].key)
      } else if (!mobile.matches && chips) {
        chips.remove()
        chips = null
        svg.classList.remove('is-world')
        cancelAnimationFrame(anim)
        setView(full)
      }
    }
    setMode()
    mobile.addEventListener('change', setMode)

    let metric = 'a'
    const metricLabel = (m) => {
      const t = toggles.find((x) => x.dataset.mapMetric === m)
      return t ? t.textContent.trim() : ''
    }
    const label = (c) => `${c.n}: ${metricLabel(metric)} ${c[metric]}`
    cities.forEach(({ g, c }) => g.setAttribute('aria-label', label(c)))

    const setMetric = (m) => {
      if (m === metric) return
      metric = m
      toggles.forEach((t) => {
        const on = t.dataset.mapMetric === m
        t.classList.toggle('cc-active', on)
        t.setAttribute('aria-pressed', String(on))
      })
      cities.forEach(({ g, c }, i) =>
        setTimeout(
          () => {
            const v = c[m]
            const [col, r] = tier(v)
            g.style.setProperty('--city-color', col)
            g.querySelectorAll('circle').forEach((el) =>
              el.setAttribute('r', r)
            )
            placeLabel(g, c, r)
            g.setAttribute('aria-label', label(c))
            const tv = g.querySelector('.map_city-value')
            const from = parseFloat(tv.textContent) || 0
            if (reduced) {
              tv.textContent = String(v)
              return
            }
            const t0 = performance.now()
            const step = (now) => {
              const p = Math.min(1, (now - t0) / 600)
              tv.textContent = (from + (v - from) * easeOutCubic(p))
                .toFixed(1)
                .replace(/\.0$/, '')
              if (p < 1) requestAnimationFrame(step)
            }
            requestAnimationFrame(step)
          },
          reduced ? 0 : i * 35
        )
      )
    }
    toggles.forEach((t) => {
      const go = (e) => {
        e.preventDefault()
        setMetric(t.dataset.mapMetric)
      }
      t.addEventListener('click', go)
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') go(e)
      })
    })

    cities.forEach(({ g, c }) => {
      const show = () => {
        if (!tip) return
        const rc = card.getBoundingClientRect()
        const rd = g.querySelector('.map_city-dot').getBoundingClientRect()
        tip.innerHTML = ''
        const name = document.createElement('strong')
        name.textContent = c.n
        tip.append(name, `${metricLabel(metric)} · ${c[metric]}`)
        tip.style.left = `${rd.left + rd.width / 2 - rc.left}px`
        tip.style.top = `${rd.top - rc.top}px`
        tip.classList.add('is-visible')
        g.classList.add('is-on')
      }
      const hide = () => {
        if (tip) tip.classList.remove('is-visible')
        g.classList.remove('is-on')
      }
      g.addEventListener('mouseenter', show)
      g.addEventListener('mouseleave', hide)
      g.addEventListener('focus', show)
      g.addEventListener('blur', hide)
    })
    svg.addEventListener('click', (e) => {
      if (!e.target.closest('.map_city') && tip) {
        tip.classList.remove('is-visible')
        cities.forEach(({ g }) => g.classList.remove('is-on'))
      }
    })
  })
}
