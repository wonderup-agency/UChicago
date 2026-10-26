// --------------------------------------------------
// research-tabs
// --------------------------------------------------
// Region tabs for the Research section. Swaps the visible pane (.cc-active),
// counts the stats up and tells particle-field to morph the dotted graphic
// (window event "research:change" with { index }).
//
// Below 768px it becomes an accordion: each pane is moved right under its
// tab (no duplicated content, so Webflow props keep working), one item open
// at a time, tapping the open item closes it. Panes move back on resize.
// --------------------------------------------------
import { countUp, reducedMotion } from '../utils/motion.js'
import '../styles/research-tabs.css'

const MOBILE = '(max-width: 767px)'

export default function (elements) {
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)')
  const mobile = window.matchMedia(MOBILE)

  elements.forEach((root, rootIndex) => {
    const tabList = root.querySelector('.research_tabs')
    const paneList = root.querySelector('.research_panes')
    const tabs = [...root.querySelectorAll('.research_tab')]
    const panes = [...root.querySelectorAll('.research_pane')]
    if (!tabList || !paneList || !tabs.length || !panes.length) return

    let current = Math.max(
      0,
      tabs.findIndex((t) => t.classList.contains('cc-active'))
    )
    let accordion = false

    panes.forEach((pane, i) => {
      if (!pane.id) pane.id = `research-pane-${rootIndex}-${i}`
    })

    const countPane = (pane) =>
      pane
        .querySelectorAll('.research_stat-value')
        .forEach((el) => countUp(el, 900))

    // Sync classes + ARIA for whichever mode is active. current = -1 → all closed.
    const paint = () => {
      tabs.forEach((t, j) => {
        const on = j === current
        t.classList.toggle('cc-active', on)
        if (accordion) {
          t.setAttribute('role', 'button')
          t.setAttribute('aria-expanded', String(on))
          t.setAttribute('aria-controls', panes[j].id)
          t.removeAttribute('aria-selected')
          t.setAttribute('tabindex', '0')
        } else {
          t.setAttribute('role', 'tab')
          t.setAttribute('aria-selected', String(on))
          t.removeAttribute('aria-expanded')
          t.setAttribute('tabindex', on ? '0' : '-1')
        }
      })
      panes.forEach((p, j) => p.classList.toggle('cc-active', j === current))
    }

    const announce = (i) =>
      window.dispatchEvent(
        new window.CustomEvent('research:change', { detail: { index: i } })
      )

    const select = (i, { focus = false } = {}) => {
      if (!tabs[i]) return
      if (i === current) {
        // Accordion: tapping the open item closes it. Tabs: nothing to do.
        if (!accordion) return
        current = -1
        paint()
        return
      }
      current = i
      paint()
      if (focus) tabs[i].focus()
      countPane(panes[i])
      announce(i)
      if (accordion) {
        // Keep the opened header in view (the previous item may have collapsed above it).
        const top = tabs[i].getBoundingClientRect().top
        if (top < 80 || top > window.innerHeight * 0.6) {
          window.scrollTo({
            top: window.scrollY + top - 100,
            behavior: reducedMotion() ? 'auto' : 'smooth',
          })
        }
      }
    }

    const setMode = () => {
      const next = mobile.matches
      if (next === accordion) return
      accordion = next
      root.classList.toggle('is-accordion', accordion)
      if (accordion) {
        tabList.removeAttribute('role')
        panes.forEach((p, i) => {
          tabs[i].after(p)
          p.setAttribute('role', 'region')
          p.setAttribute('aria-labelledby', tabs[i].id || '')
        })
      } else {
        tabList.setAttribute('role', 'tablist')
        panes.forEach((p) => {
          paneList.appendChild(p)
          p.setAttribute('role', 'tabpanel')
          p.removeAttribute('aria-labelledby')
        })
        if (current < 0) {
          current = 0
          announce(0)
        }
      }
      paint()
    }

    tabs.forEach((tab, i) => {
      if (!tab.id) tab.id = `research-tab-${rootIndex}-${i}`
      tab.addEventListener('click', (e) => {
        e.preventDefault()
        select(i)
      })
      tab.addEventListener('mouseenter', () => {
        if (canHover.matches && !accordion) select(i)
      })
      tab.addEventListener('keydown', (e) => {
        const map = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
        if (e.key in map) {
          e.preventDefault()
          const from = current < 0 ? i : current
          const next = (from + map[e.key] + tabs.length) % tabs.length
          if (accordion) tabs[next].focus()
          else select(next, { focus: true })
        } else if (e.key === 'Home') {
          e.preventDefault()
          if (accordion) tabs[0].focus()
          else select(0, { focus: true })
        } else if (e.key === 'End') {
          e.preventDefault()
          if (accordion) tabs[tabs.length - 1].focus()
          else select(tabs.length - 1, { focus: true })
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          select(i)
        }
      })
    })

    setMode()
    mobile.addEventListener('change', setMode)

    // First reveal: count the visible pane up once it enters the viewport.
    if (reducedMotion()) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          if (current >= 0) countPane(panes[current])
          io.disconnect()
        })
      },
      { threshold: 0.3 }
    )
    io.observe(panes[Math.max(0, current)])
  })
}
