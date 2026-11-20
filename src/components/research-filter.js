// --------------------------------------------------
// research-filter
// --------------------------------------------------
// Region filter for the Research page.
//   [data-component="research-filter"]  wrapper around filters + card list
//   [data-filter]                       filter buttons; value = region slug,
//                                       "all" (or empty) shows everything
//   [data-project-card]                 card inside each Collection item
//   [data-region]                       region slugs inside the item's hidden
//                                       [data-project-data] block
// Hides non-matching Collection items (project-profile skips hidden ones in
// prev/next) and keeps ?region=<slug> in the URL.
// --------------------------------------------------
import '../styles/research-filter.css'

const PARAM = 'region'

export default function (elements) {
  elements.forEach((root) => {
    const buttons = [...root.querySelectorAll('[data-filter]')]
    const items = [...root.querySelectorAll('[data-project-card]')].map(
      (card) => {
        const item = card.closest('.w-dyn-item') || card.parentElement
        const regions = [...item.querySelectorAll('[data-region]')]
          .map((r) => r.getAttribute('data-region'))
          .filter(Boolean)
        return { item, regions }
      }
    )
    if (!buttons.length || !items.length) return

    const empty = root.querySelector('[data-filter-empty]')
    const valueOf = (btn) => btn.getAttribute('data-filter') || 'all'

    // Hide filters for regions no project uses (keeps the CMS list honest).
    const used = new Set(items.flatMap((i) => i.regions))
    buttons.forEach((btn) => {
      const v = valueOf(btn)
      if (v !== 'all' && !used.has(v)) {
        const li = btn.closest('[data-filter-item]') || btn
        li.hidden = true
      }
    })

    const apply = (value, { updateUrl = true } = {}) => {
      let shown = 0
      items.forEach(({ item, regions }) => {
        const match = value === 'all' || regions.includes(value)
        item.hidden = !match
        if (match) shown += 1
      })
      buttons.forEach((btn) =>
        btn.setAttribute('aria-pressed', String(valueOf(btn) === value))
      )
      if (empty) empty.hidden = shown > 0
      if (updateUrl) {
        const url = new window.URL(window.location.href)
        if (value === 'all') url.searchParams.delete(PARAM)
        else url.searchParams.set(PARAM, value)
        window.history.replaceState(window.history.state, '', url)
      }
    }

    buttons.forEach((btn) => {
      btn.type = 'button'
      btn.addEventListener('click', () => apply(valueOf(btn)))
    })

    const initial = new window.URL(window.location.href).searchParams.get(PARAM)
    const valid = buttons.some((b) => valueOf(b) === initial)
    apply(valid ? initial : 'all', { updateUrl: false })
  })
}
