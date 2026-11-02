// --------------------------------------------------
// people-profile
// --------------------------------------------------
// One profile panel for the People page, filled from the CMS cards.
//   [data-component="people-profile"]   panel root (dialog)
//   [data-person-card]                  card link inside each Collection item
//   [data-person-data]                  hidden sibling with lead, bio, links,
//                                       and a nested list of [data-project]
// Opens on card click or ?person=<slug>, prev/next across every card in page
// order, Esc / overlay closes, focus is trapped while open.
// --------------------------------------------------
import { reducedMotion } from '../utils/motion.js'
import '../styles/people-profile.css'

// DEBUG people-profile: remove before deploy
console.log('[people-profile] module loaded')

const PARAM = 'person'
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

const text = (el) => (el ? el.textContent.trim() : '')

function readPeople() {
  return [...document.querySelectorAll('[data-person-card]')]
    .map((card) => {
      const data = card.parentElement.querySelector('[data-person-data]')
      if (!data) return null
      const img = card.querySelector('img')
      const bio = data.querySelector('[data-person-bio]')
      const projects = [...data.querySelectorAll('[data-project]')]
        .map((p) => ({
          name: p.dataset.name || '',
          slug: p.dataset.slug || '',
          tag: p.dataset.tag || '',
          summary: p.dataset.summary || '',
          order: parseFloat(p.dataset.order) || 0,
        }))
        .filter((p) => p.name)
        .sort((a, b) => a.order - b.order)
      return {
        card,
        slug: data.dataset.slug || '',
        name: text(card.querySelector('h3')),
        role: text(card.querySelector('.eyebrow')),
        img: img ? img.currentSrc || img.src : '',
        lead: data.dataset.lead || '',
        bio:
          bio && !bio.classList.contains('w-dyn-bind-empty')
            ? bio.innerHTML
            : '',
        links: {
          booth: data.dataset.booth || '',
          website: data.dataset.website || '',
          linkedin: data.dataset.linkedin || '',
        },
        projects,
      }
    })
    .filter((p) => p && p.slug)
}

export default function (elements) {
  const root = elements[0]
  const people = readPeople()
  // DEBUG people-profile: remove before deploy
  console.log('[people-profile] init', {
    root: !!root,
    cards: document.querySelectorAll('[data-person-card]').length,
    people: people.length,
    first: people[0],
  })
  if (!root || !people.length) {
    console.warn('[people-profile] stopped: missing panel root or people')
    return
  }

  // The panel must sit above every stacking context on the page.
  document.body.appendChild(root)

  const $ = (sel) => root.querySelector(sel)
  const panel = $('[data-profile-panel]')
  const nameEl = $('[data-profile-name]')
  const roleEl = $('[data-profile-role]')
  const imgEl = $('[data-profile-img]')
  const leadEl = $('[data-profile-lead]')
  const bioEl = $('[data-profile-bio]')
  const shareBtn = $('[data-profile-share]')
  const projectsEl = $('[data-profile-projects]')
  const divider = $('[data-profile-projects-divider]')
  const track = $('[data-profile-track]')
  const trackPrev = $('[data-profile-track-prev]')
  const trackNext = $('[data-profile-track-next]')
  const template = $('[data-profile-project-template]')
  const linkEls = [...root.querySelectorAll('[data-profile-link]')]
  if (template) template.remove()

  root.querySelectorAll('button').forEach((b) => (b.type = 'button'))
  bioEl?.classList.add('rich-text')

  let current = -1
  let lastFocus = null
  let pushed = false

  // ── fill ─────────────────────────────────────────────────────────
  const fill = (p) => {
    nameEl.textContent = p.name
    roleEl.textContent = p.role
    imgEl.src = p.img
    imgEl.alt = p.name
    leadEl.textContent = p.lead
    leadEl.hidden = !p.lead
    bioEl.innerHTML = p.bio
    bioEl.hidden = !p.bio

    linkEls.forEach((a) => {
      const url = p.links[a.getAttribute('data-profile-link')]
      a.hidden = !url
      a.style.display = url ? '' : 'none'
      if (url) {
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener'
      }
    })

    track.replaceChildren()
    if (template) {
      p.projects.forEach((proj) => {
        const card = template.cloneNode(true)
        card.removeAttribute('data-profile-project-template')
        card.querySelector('[data-project-tag]').textContent = proj.tag
        card.querySelector('[data-project-title]').textContent = proj.name
        card.querySelector('[data-project-summary]').textContent = proj.summary
        const link = card.querySelector('[data-project-link]')
        if (link) {
          link.href = `/research/${proj.slug}`
          link.setAttribute('aria-label', `Read more about ${proj.name}`)
        }
        track.appendChild(card)
      })
    }
    const hasProjects = p.projects.length > 0
    projectsEl.hidden = !hasProjects
    divider.hidden = !hasProjects
    track.scrollLeft = 0
    updateTrack()
    panel.scrollTop = 0
  }

  // ── projects slider ──────────────────────────────────────────────
  const step = () => {
    const card = track.firstElementChild
    if (!card) return track.clientWidth
    const gap = parseFloat(window.getComputedStyle(track).columnGap) || 0
    return card.getBoundingClientRect().width + gap
  }
  const updateTrack = () => {
    const max = track.scrollWidth - track.clientWidth - 2
    trackPrev.disabled = track.scrollLeft <= 2
    trackNext.disabled = track.scrollLeft >= max
    const nav = trackPrev.parentElement
    if (nav) nav.hidden = max <= 0
  }
  const behavior = () => (reducedMotion() ? 'auto' : 'smooth')
  trackPrev.addEventListener('click', () =>
    track.scrollBy({ left: -step(), behavior: behavior() })
  )
  trackNext.addEventListener('click', () =>
    track.scrollBy({ left: step(), behavior: behavior() })
  )
  track.addEventListener('scroll', updateTrack, { passive: true })

  // ── url ──────────────────────────────────────────────────────────
  const urlFor = (slug) => {
    const url = new window.URL(window.location.href)
    if (slug) url.searchParams.set(PARAM, slug)
    else url.searchParams.delete(PARAM)
    return url
  }

  // ── open / close ─────────────────────────────────────────────────
  const show = (i, { push = true } = {}) => {
    const n = people.length
    const idx = ((i % n) + n) % n
    const p = people[idx]
    const wasOpen = current !== -1
    current = idx
    console.log(
      '[people-profile] show',
      idx,
      p.slug,
      p.projects.length,
      'projects'
    )
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
      window.history.pushState({ person: p.slug }, '', url)
      pushed = true
    } else {
      window.history.replaceState({ person: p.slug }, '', url)
    }
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
  people.forEach((p, i) => {
    p.card.href = urlFor(p.slug).toString()
    p.card.setAttribute('aria-haspopup', 'dialog')
    p.card.addEventListener('click', (e) => {
      console.log('[people-profile] card click', p.slug)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
      e.preventDefault()
      show(i)
    })
  })

  root
    .querySelectorAll('[data-profile-close]')
    .forEach((el) => el.addEventListener('click', () => hide()))
  $('[data-profile-next]')?.addEventListener('click', () => show(current + 1))
  $('[data-profile-prev]')?.addEventListener('click', () => show(current - 1))

  shareBtn?.addEventListener('click', async () => {
    const p = people[current]
    if (!p) return
    const url = urlFor(p.slug).toString()
    try {
      if (window.navigator.share) {
        await window.navigator.share({ title: p.name, url })
        return
      }
      await window.navigator.clipboard.writeText(url)
      shareBtn.setAttribute('aria-label', 'Link copied')
      shareBtn.classList.add('is-copied')
      window.setTimeout(() => {
        shareBtn.setAttribute('aria-label', 'Share profile')
        shareBtn.classList.remove('is-copied')
      }, 1800)
    } catch {
      // Share sheet dismissed or clipboard blocked: nothing to do.
    }
  })

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
    const i = people.findIndex((p) => p.slug === slug)
    if (i === -1) hide({ fromHistory: true })
    else show(i, { push: false })
  })

  // Deep link: /people?person=<slug>
  const initial = new window.URL(window.location.href).searchParams.get(PARAM)
  const start = people.findIndex((p) => p.slug === initial)
  if (start !== -1) show(start, { push: false })

  return {
    resize() {
      if (current !== -1) updateTrack()
    },
  }
}
