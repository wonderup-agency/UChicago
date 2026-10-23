// --------------------------------------------------
// news-reveal
// --------------------------------------------------
// News section: the title lights up word by word as it scrolls into view
// ([data-news-title]) and each article row ([data-news-row]) slides in.
// --------------------------------------------------
import { reducedMotion } from '../utils/motion.js'
import '../styles/news-reveal.css'

export default function (elements) {
  if (reducedMotion()) return

  elements.forEach((section) => {
    const title = section.querySelector('[data-news-title]')
    const rows = [...section.querySelectorAll('[data-news-row]')]

    if (title) {
      const text = title.textContent.trim()
      title.setAttribute('aria-label', text)
      title.textContent = ''
      const words = text.split(/\s+/).map((w, i) => {
        const span = document.createElement('span')
        span.className = 'news_word'
        span.setAttribute('aria-hidden', 'true')
        span.textContent = w
        if (i) title.append(' ')
        title.append(span)
        return span
      })
      let ticking = false
      const update = () => {
        ticking = false
        const r = title.getBoundingClientRect()
        const p =
          1 - (r.top - window.innerHeight * 0.35) / (window.innerHeight * 0.45)
        words.forEach((w, i) =>
          w.classList.toggle('is-lit', p > (i + 1) / (words.length + 1))
        )
      }
      window.addEventListener(
        'scroll',
        () => {
          if (!ticking) {
            ticking = true
            requestAnimationFrame(update)
          }
        },
        { passive: true }
      )
      update()
    }

    if (rows.length) {
      rows.forEach((row) => row.classList.add('is-hidden'))
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            const i = rows.indexOf(entry.target)
            entry.target.style.transitionDelay = `${i * 90}ms`
            entry.target.classList.remove('is-hidden')
            io.unobserve(entry.target)
          }),
        { threshold: 0.3 }
      )
      rows.forEach((row) => io.observe(row))
    }
  })
}
