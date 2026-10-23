// --------------------------------------------------
// research-tabs
// --------------------------------------------------
// Region tabs for the Research section. Swaps the visible pane (.cc-active),
// counts the stats up and tells particle-field to morph the dotted graphic
// (window event "research:change" with { index }).
// --------------------------------------------------
import { countUp, reducedMotion } from '../utils/motion.js'
import '../styles/research-tabs.css'

export default function (elements) {
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)')

  elements.forEach((root) => {
    const tabs = [...root.querySelectorAll('.research_tab')]
    const panes = [...root.querySelectorAll('.research_pane')]
    if (!tabs.length || !panes.length) return

    let current = Math.max(
      0,
      tabs.findIndex((t) => t.classList.contains('cc-active'))
    )

    const countPane = (pane) =>
      pane
        .querySelectorAll('.research_stat-value')
        .forEach((el) => countUp(el, 900))

    const select = (i, { focus = false } = {}) => {
      if (i === current || !tabs[i]) return
      current = i
      tabs.forEach((t, j) => {
        const on = j === i
        t.classList.toggle('cc-active', on)
        t.setAttribute('aria-selected', String(on))
        t.setAttribute('tabindex', on ? '0' : '-1')
      })
      panes.forEach((p, j) => p.classList.toggle('cc-active', j === i))
      if (focus) tabs[i].focus()
      countPane(panes[i])
      window.dispatchEvent(
        new window.CustomEvent('research:change', { detail: { index: i } })
      )
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault()
        select(i)
      })
      tab.addEventListener('mouseenter', () => {
        if (canHover.matches) select(i)
      })
      tab.addEventListener('keydown', (e) => {
        const map = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
        if (e.key in map) {
          e.preventDefault()
          select((current + map[e.key] + tabs.length) % tabs.length, {
            focus: true,
          })
        } else if (e.key === 'Home') {
          e.preventDefault()
          select(0, { focus: true })
        } else if (e.key === 'End') {
          e.preventDefault()
          select(tabs.length - 1, { focus: true })
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          select(i)
        }
      })
    })

    // First reveal: count the visible pane up once it enters the viewport.
    if (reducedMotion()) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          countPane(panes[current])
          io.disconnect()
        })
      },
      { threshold: 0.5 }
    )
    io.observe(panes[current])
  })
}
