// Shared helpers for the Home micro-interactions.

export const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Data files are emitted to dist/data/ next to the bundle, so they resolve
// from the chunk URL both on jsDelivr and on the local dev server.
export const dataUrl = (file) =>
  new window.URL(`./data/${file}`, import.meta.url).href

export async function loadJson(file) {
  const res = await fetch(dataUrl(file))
  if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`)
  return res.json()
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

// Animates the number inside `el` from 0 to the value it already shows,
// keeping its format (thousands separators, % suffix).
export function countUp(el, duration = 1100) {
  const raw = el.dataset.countTo || el.textContent.trim()
  el.dataset.countTo = raw
  const match = raw.match(/^([^\d]*)([\d,.]+)(.*)$/)
  if (!match) return
  const [, prefix, num, suffix] = match
  const target = parseFloat(num.replace(/,/g, ''))
  const decimals = (num.split('.')[1] || '').length
  const format = (v) =>
    prefix +
    v.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) +
    suffix
  if (reducedMotion() || !Number.isFinite(target)) {
    el.textContent = raw
    return
  }
  const t0 = performance.now()
  const step = (now) => {
    const p = Math.min(1, (now - t0) / duration)
    el.textContent = format(target * easeOutCubic(p))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
