// --------------------------------------------------
// date helpers
// --------------------------------------------------
// Webflow prints CMS dates in the format set on the binding
// (e.g. "November 20, 2026" or "2026-11-20"). These helpers turn them into
// the "Month YYYY" label the Figma uses (e.g. "July 2026").
// --------------------------------------------------

const MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "2026-07-14" | "July 14, 2026" → "July 2026" ('' when it can't parse). */
export function monthYear(value) {
  if (!value) return ''
  const t = Date.parse(value)
  return Number.isNaN(t) ? '' : MONTH.format(new Date(t))
}

/** Rewrites every [data-date-format="month"] inside root to "Month YYYY". */
export function formatDates(root = document) {
  root.querySelectorAll('[data-date-format="month"]').forEach((el) => {
    const label = monthYear(el.dataset.date || el.textContent.trim())
    if (label) el.textContent = label
  })
}
