// --------------------------------------------------
// research-tabs
// --------------------------------------------------
// Region tabs for the Research section. Swaps the visible pane (.cc-active),
// counts the stats up and tells particle-field to morph the dotted graphic
// (window event "research:change" with { index }).
//
// Tabs change on click (not hover) and autoplay every AUTOPLAY_MS on desktop.
// The progress line under the active tab is a CSS animation; its animationend
// is the clock, so pausing (hover, focus, offscreen, hidden tab) is just
// animation-play-state. A click restarts the countdown on the chosen tab.
//
// Below 768px it becomes an accordion: each pane is moved right under its
// tab (no duplicated content, so Webflow props keep working), one item open
// at a time, tapping the open item closes it. Panes move back on resize.
// --------------------------------------------------
import { countUp, reducedMotion } from '../utils/motion.js'
import '../styles/research-tabs.css'

const MOBILE = '(max-width: 767px)'
const AUTOPLAY_MS = 6000

export default function (elements) {
  const mobile = window.matchMedia(MOBILE)
  const autoplay = !reducedMotion()

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

    // ── Autoplay (tabs mode only) ────────────────────────────────────
    if (autoplay) {
      root.style.setProperty('--research-autoplay', `${AUTOPLAY_MS}ms`)
      const pauses = new Set()
      const setPaused = (reason, on) => {
        if (on) pauses.add(reason)
        else pauses.delete(reason)
        root.classList.toggle('is-paused', pauses.size > 0)
      }
      const syncPlaying = () => root.classList.toggle('is-autoplay', !accordion)
      syncPlaying()
      mobile.addEventListener('change', syncPlaying)

      tabList.addEventListener('animationend', (e) => {
        if (e.animationName !== 'research-progress' || accordion) return
        select((current + 1) % tabs.length)
      })
      root.addEventListener('mouseenter', () => setPaused('hover', true))
      root.addEventListener('mouseleave', () => setPaused('hover', false))
      root.addEventListener('focusin', () => setPaused('focus', true))
      root.addEventListener('focusout', (e) => {
        if (!root.contains(e.relatedTarget)) setPaused('focus', false)
      })
      new IntersectionObserver(([entry]) =>
        setPaused('offscreen', !entry.isIntersecting)
      ).observe(root)
    }

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
