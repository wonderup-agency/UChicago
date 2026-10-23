// --------------------------------------------------
// dot-icon (selector: [data-dot-icon])
// --------------------------------------------------
// Country report cards. The dotted region icon is a Webflow image asset
// (SVG of circles); this inlines it so every dot can rise into place when the
// card enters the viewport and drift away from the cursor on hover.
// Hovering a card also moves the active state (filled go circle) to it.
// --------------------------------------------------
import { reducedMotion } from '../utils/motion.js'
import '../styles/dot-icon.css'

const svgCache = new Map()
function fetchSvg(url) {
  if (!svgCache.has(url)) {
    svgCache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(r.status)
        return r.text()
      })
    )
  }
  return svgCache.get(url)
}

function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

async function inlineIcon(img) {
  const text = await fetchSvg(img.currentSrc || img.src)
  const doc = new window.DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) throw new Error('not an svg')
  svg.querySelectorAll('script').forEach((s) => s.remove())
  svg.setAttribute('class', img.className)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet')
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  const node = document.importNode(svg, true)
  img.replaceWith(node)
  return node
}

export default function (elements) {
  const reduced = reducedMotion()
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)')

  const setActive = (card) =>
    elements.forEach((c) => {
      const go = c.querySelector('.report-card_go')
      if (go) go.classList.toggle('cc-active', c === card)
    })

  elements.forEach(async (card, ci) => {
    card.addEventListener('mouseenter', () => setActive(card))
    card.addEventListener('focusin', () => setActive(card))

    const img = card.querySelector('img.report-card_icon')
    if (!img || reduced) return
    let svg
    try {
      svg = await inlineIcon(img)
    } catch {
      return // keep the plain image
    }

    const vb = svg.viewBox.baseVal
    const w = vb && vb.width ? vb.width : 120
    const h = vb && vb.height ? vb.height : 120
    const R = rng(ci * 997 + 13)
    const dots = [...svg.querySelectorAll('circle')].map((n) => ({
      n,
      x: +n.getAttribute('cx'),
      y: +n.getAttribute('cy'),
      r1: R(),
      r2: R(),
    }))

    const hide = () =>
      dots.forEach((d) => {
        d.n.style.transition = 'none'
        d.n.style.opacity = '0'
        d.n.style.transform = `translate(${(d.r1 - 0.5) * 24}px, ${h - d.y + 50 + d.r2 * 90}px)`
      })
    const show = () =>
      dots.forEach((d) => {
        const delay = ci * 0.12 + d.r1 * 0.55 + (1 - d.y / h) * 0.35
        d.n.style.transition = `transform 1.6s cubic-bezier(.16,1,.3,1) ${delay}s, opacity .9s ease ${delay}s`
        d.n.style.opacity = ''
        d.n.style.transform = ''
      })

    hide()
    let shown = false
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.35 && !shown) {
          shown = true
          requestAnimationFrame(() => requestAnimationFrame(show))
        } else if (!entry.isIntersecting && shown) {
          shown = false
          hide()
        }
      },
      { threshold: [0, 0.35] }
    ).observe(card)

    // Cursor repel: dots near the pointer slide away a few px.
    card.addEventListener('mousemove', (e) => {
      if (!shown || !canHover.matches) return
      const r = svg.getBoundingClientRect()
      const scale = Math.min(r.width / w, r.height / h) || 1
      const mx = (e.clientX - r.left) / scale
      const my = (e.clientY - r.top - (r.height - h * scale) / 2) / scale
      dots.forEach((d) => {
        const dx = d.x - mx
        const dy = d.y - my
        const dist = Math.hypot(dx, dy) || 1
        const f = Math.max(0, 1 - dist / 46)
        const g = f * f * (3 - 2 * f)
        d.n.style.transition = 'transform 1.1s cubic-bezier(.22,.61,.36,1)'
        d.n.style.transform = g
          ? `translate(${(dx / dist) * g * 4}px, ${(dy / dist) * g * 4}px) scale(${1 + g * 0.18})`
          : ''
      })
    })
    card.addEventListener('mouseleave', () => {
      if (shown) dots.forEach((d) => (d.n.style.transform = ''))
    })
  })
}
