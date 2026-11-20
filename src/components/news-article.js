// --------------------------------------------------
// news-article
// --------------------------------------------------
// News item template page (/news/<slug>). Webflow renders everything from
// the CMS; this only tidies what bindings can't:
//   [data-date-format="month"]  date → "Month YYYY"
//   [data-article-cta]          link buttons; hidden when label or URL is
//                               empty, external URLs open in a new tab
//   [data-article-optional]     hidden when its text is empty (tag, lead)
//   [data-article-byline]       hidden when the Authors list is empty
// --------------------------------------------------
import { formatDates } from '../utils/date.js'
import '../styles/news-article.css'

const text = (el) => (el ? el.textContent.trim() : '')

export default function (elements) {
  elements.forEach((root) => {
    formatDates(root)

    root.querySelectorAll('[data-article-cta]').forEach((host) => {
      const link = host.matches('a') ? host : host.querySelector('a')
      const href = link ? link.getAttribute('href') || '' : ''
      const label = text(host.querySelector('.btn-text') || host)
      if (!link || !label || !href || href === '#') {
        host.hidden = true
        return
      }
      if (/^https?:\/\//.test(href) && !href.includes(window.location.host)) {
        link.target = '_blank'
        link.rel = 'noopener'
      }
    })

    root.querySelectorAll('[data-article-optional]').forEach((el) => {
      if (!text(el) || el.classList.contains('w-dyn-bind-empty')) {
        // Hide the tag wrapper (eyebrow-component), not just the text.
        const wrap = el.closest('.eyebrow-component') || el
        wrap.hidden = true
      }
    })

    const byline = root.querySelector('[data-article-byline]')
    if (byline && !byline.querySelector('.w-dyn-item')) byline.hidden = true
  })
}
