// --------------------------------------------------
// project-profile
// --------------------------------------------------
// One detail panel filled from CMS cards. Used on Research (projects) and
// News (articles); root[data-param] sets the URL param (default "project").
//   [data-component="project-profile"]  panel root (dialog, person-modal shell)
//   [data-project-card]                 card inside each Collection item
//   [data-project-open]                 link inside the card ("Read more")
//   [data-project-data]                 hidden sibling: slug, lead, CTA,
//                                       body + milestones rich text, team
//                                       ([data-team-member]) and regions
// News extras: [data-open-slug] (featured card) opens the panel too,
// [data-featured-link] gets ?article=<slug>, [data-featured-author] shows the
// first author, data-tag / data-status / data-date on the data block feed the
// tags ("Type · Month YYYY") and data-cta2-* a second (outline) button.
// Opens on card click or ?<param>=<slug>. Prev/next walk the visible cards
// (research-filter hides the others). Esc / overlay closes, focus is trapped.
// Shell motion and states come from people-profile.css (shared classes).
// --------------------------------------------------
import { reducedMotion } from '../utils/motion.js'
import { formatDates, monthYear } from '../utils/date.js'
import '../styles/people-profile.css'
import '../styles/project-profile.css'
import '../styles/list-row.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
const MAX_AVATARS = 3

const text = (el) => (el ? el.textContent.trim() : '')
// The Webflow Button component puts custom attributes on its root <div>;
// the real <a> is the .u-link-cover inside it.
const linkIn = (el) =>
  !el ? null : el.matches('a') ? el : el.querySelector('a')
const richHtml = (el) =>
  el && !el.classList.contains('w-dyn-bind-empty') && text(el)
    ? el.innerHTML
    : ''

// "A", "A and B", "A, B and C"
const joinNames = (names) =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

function readProjects() {
  return [...document.querySelectorAll('[data-project-card]')]
    .map((card) => {
      const item = card.closest('.w-dyn-item') || card.parentElement
      const data = item.querySelector('[data-project-data]')
      if (!data) return null
      const team = [...data.querySelectorAll('[data-team-member]')]
        .map((m) => {
          const img = m.querySelector('img')
          return {
            name: m.dataset.name || '',
            role: m.dataset.role || '',
            img: img ? img.currentSrc || img.src : '',
            order: parseFloat(m.dataset.order) || 0,
          }
        })
        .filter((m) => m.name)
        .sort((a, b) => a.order - b.order)
      const d = data.dataset
      const status =
        d.status || text(card.querySelector('[data-project-status]'))
      return {
        card,
        item,
        link: linkIn(card.querySelector('[data-project-open]')),
        slug: d.slug || '',
        name: text(
          card.querySelector('[data-project-name]') ||
            card.querySelector('.list-row_title')
        ),
        tag: d.tag || text(card.querySelector('[data-project-tag]')),
        status: [status, monthYear(d.date)].filter(Boolean).join(' · '),
        lead:
          data.dataset.lead ||
          text(card.querySelector('[data-project-summary]')),
        body: richHtml(data.querySelector('[data-project-body]')),
        milestones: richHtml(data.querySelector('[data-project-milestones]')),
        cta: {
          label: d.ctaLabel || '',
          url: d.ctaLink || d.external || '',
        },
        cta2: { label: d.cta2Label || '', url: d.cta2Link || '' },
        team,
      }
    })
    .filter((p) => p && p.slug)
}

// Points a Button component (host with the attribute) at a URL + label.
function buttonFor(host) {
  const link = linkIn(host)
  const texts = host ? [...host.querySelectorAll('.btn-text, .u-sr-only')] : []
  return {
    host,
    set({ label, url }) {
      const ok = Boolean(host && link && label && url)
      if (host) host.hidden = !ok
      if (!ok) return false
      link.href = url
      if (/^https?:\/\//.test(url)) {
        link.target = '_blank'
        link.rel = 'noopener'
      } else {
        link.removeAttribute('target')
        link.removeAttribute('rel')
      }
      texts.forEach((el) => (el.textContent = label))
      return true
    },
  }
}

export default function (elements) {
  const root = elements[0]
  const PARAM = (root && root.dataset.param) || 'project'
  const projects = readProjects()
  formatDates()
  if (!root || !projects.length) {
    console.warn('[project-profile] stopped: missing panel root or projects')
    return
  }

  // The panel must sit above every stacking context on the page.
  document.body.appendChild(root)

  const $ = (sel) => root.querySelector(sel)
  const panel = $('[data-profile-panel]')
  const nameEl = $('[data-panel-name]')
  const tagEl = $('[data-panel-tag]')
  const statusEl = $('[data-panel-status]')
  const tagWrap = $('[data-panel-tag-wrap]') || tagEl
  const statusWrap = $('[data-panel-status-wrap]') || statusEl
  const teamEl = $('[data-panel-team]')
  const avatarsEl = $('[data-panel-avatars]')
  const authorsEl = $('[data-panel-authors]')
  const leadEl = $('[data-panel-lead]')
  const bodyEl = $('[data-panel-body]')
  const milestonesWrap = $('[data-panel-milestones-wrap]')
  const milestonesEl = $('[data-panel-milestones]')
  const ctaWrap = $('[data-panel-cta-wrap]')
  // Visible label (.btn-text, twice for the hover roll) + screen-reader label
  const cta = buttonFor($('[data-panel-cta]'))
  const cta2 = buttonFor($('[data-panel-cta-2]'))

  root.querySelectorAll('button').forEach((b) => (b.type = 'button'))
  bodyEl?.classList.add('rich-text')

  let current = -1
  let lastFocus = null
  let pushed = false

  // ── fill ─────────────────────────────────────────────────────────
  const fill = (p) => {
    nameEl.textContent = p.name
    tagEl.textContent = p.tag
    tagWrap.hidden = !p.tag
    statusEl.textContent = p.status
    statusWrap.hidden = !p.status

    avatarsEl.replaceChildren()
    p.team.slice(0, MAX_AVATARS).forEach((m) => {
      const span = document.createElement('span')
      span.className = 'project-avatar'
      if (m.img) {
        const img = document.createElement('img')
        img.src = m.img
        img.alt = ''
        img.loading = 'lazy'
        span.appendChild(img)
      }
      avatarsEl.appendChild(span)
    })
    const extra = p.team.length - MAX_AVATARS
    if (extra > 0) {
      const more = document.createElement('span')
      more.className = 'project-avatar is-more'
      more.textContent = `+${extra}`
      avatarsEl.appendChild(more)
    }
    authorsEl.textContent = p.team.length
      ? `By ${joinNames(p.team.map((m) => m.name))}`
      : ''
    teamEl.hidden = !p.team.length

    leadEl.textContent = p.lead
    leadEl.hidden = !p.lead
    bodyEl.innerHTML = p.body
    bodyEl.hidden = !p.body
    milestonesEl.innerHTML = p.milestones
    milestonesWrap.hidden = !p.milestones

    const has1 = cta.set(p.cta)
    const has2 = cta2.host ? cta2.set(p.cta2) : false
    if (ctaWrap) ctaWrap.hidden = !has1 && !has2
    panel.scrollTop = 0
  }

  // ── url ──────────────────────────────────────────────────────────
  const urlFor = (slug) => {
    const url = new window.URL(window.location.href)
    if (slug) url.searchParams.set(PARAM, slug)
    else url.searchParams.delete(PARAM)
    return url
  }

  // Cards hidden by research-filter are skipped by prev/next.
  const visible = () => projects.filter((p) => !p.item.hidden)

  // ── open / close ─────────────────────────────────────────────────
  const show = (p, { push = true } = {}) => {
    const wasOpen = current !== -1
    current = projects.indexOf(p)
    fill(p)

    if (!wasOpen) {
      lastFocus = document.activeElement
      root.classList.add('is-open')
      root.setAttribute('aria-hidden', 'false')
      document.documentElement.classList.add('is-profile-open')
      // Next frame so the enter transition runs from the closed state.
      window.requestAnimationFrame(() => root.classList.add('is-visible'))
      panel.focus({ preventScroll: true })
    }

    const url = urlFor(p.slug)
    if (push && !wasOpen) {
      window.history.pushState({ project: p.slug }, '', url)
      pushed = true
    } else {
      window.history.replaceState({ project: p.slug }, '', url)
    }
  }

  const step = (dir) => {
    const list = visible()
    if (!list.length) return
    const at = list.indexOf(projects[current])
    const n = list.length
    show(list[(((at === -1 ? 0 : at + dir) % n) + n) % n])
  }

  const hide = ({ fromHistory = false } = {}) => {
    if (current === -1) return
    current = -1
    root.classList.remove('is-visible')
    root.setAttribute('aria-hidden', 'true')
    document.documentElement.classList.remove('is-profile-open')
    const done = () => root.classList.remove('is-open')
    if (reducedMotion()) done()
    else window.setTimeout(done, 350)

    if (!fromHistory) {
      if (pushed) window.history.back()
      else window.history.replaceState(null, '', urlFor(''))
    }
    pushed = false
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true })
  }

  // ── wiring ───────────────────────────────────────────────────────
  projects.forEach((p) => {
    if (p.link) {
      p.link.href = urlFor(p.slug).toString()
      p.link.setAttribute('aria-haspopup', 'dialog')
      p.link.removeAttribute('target')
      const sr = p.link.querySelector('.u-sr-only')
      if (sr) sr.textContent = `Read more about ${p.name}`
    }
    // The whole card opens the panel; the link stays the keyboard target.
    p.card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
      if (e.target.closest('a') && e.target.closest('a') !== p.link) return
      e.preventDefault()
      show(p)
    })
  })

  // News featured card: same panel, opened from its own slug.
  document.querySelectorAll('[data-open-slug]').forEach((el) => {
    const p = projects.find((x) => x.slug === el.dataset.openSlug)
    if (!p) return
    const link = linkIn(el.querySelector('[data-featured-link]'))
    if (link) {
      link.href = urlFor(p.slug).toString()
      link.setAttribute('aria-haspopup', 'dialog')
      const sr = link.querySelector('.u-sr-only')
      if (sr) sr.textContent = `Read the article: ${p.name}`
    }
    const author = el.querySelector('[data-featured-author]')
    const first = p.team[0]
    if (author) {
      author.hidden = !first
      if (first) {
        const set = (sel, v) => {
          const t = author.querySelector(sel)
          if (t) t.textContent = v
        }
        set('[data-featured-author-name]', first.name)
        set('[data-featured-author-role]', first.role)
        const imgHost = author.querySelector('[data-featured-author-img]')
        if (imgHost && first.img) {
          const img = document.createElement('img')
          img.src = first.img
          img.alt = ''
          img.loading = 'lazy'
          imgHost.replaceChildren(img)
        }
      }
    }
    el.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
      const a = e.target.closest('a')
      if (a && a !== link) return
      e.preventDefault()
      show(p)
    })
  })

  root
    .querySelectorAll('[data-profile-close]')
    .forEach((el) => el.addEventListener('click', () => hide()))
  $('[data-profile-next]')?.addEventListener('click', () => step(1))
  $('[data-profile-prev]')?.addEventListener('click', () => step(-1))

  root.addEventListener('keydown', (e) => {
    if (current === -1) return
    if (e.key === 'Escape') {
      e.preventDefault()
      hide()
      return
    }
    if (e.key === 'Tab') {
      const items = [...root.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null && !el.hidden
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  })

  window.addEventListener('popstate', () => {
    const slug = new window.URL(window.location.href).searchParams.get(PARAM)
    const p = projects.find((x) => x.slug === slug)
    if (!p) hide({ fromHistory: true })
    else show(p, { push: false })
  })

  // Deep link: /research?project=<slug>, /news?article=<slug>
  const initial = new window.URL(window.location.href).searchParams.get(PARAM)
  const start = projects.find((p) => p.slug === initial)
  if (start) show(start, { push: false })
}
