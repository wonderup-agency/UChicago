// --------------------------------------------------
// dropdown
// --------------------------------------------------
// Turns a native <select> into a custom listbox dropdown (WAI-ARIA
// "select-only combobox" pattern) while keeping the <select> as the source
// of truth: options are read from it, and choosing an option sets its value
// and dispatches "change", so existing listeners keep working.
//
//   const dd = enhanceSelect(selectEl)
//   dd.refresh()   call after rewriting the <select> options or disabled state
//
// The trigger copies the select's classes (so the Webflow look carries over)
// and adds .atlas_dd-btn. Styles: src/styles/dropdown.css.
// --------------------------------------------------
import '../styles/dropdown.css'

let uid = 0

export function enhanceSelect(select) {
  const id = `dd-${++uid}`
  const label = select.closest('label')
  const labelText = label && label.querySelector('span, div, p')
  if (labelText && !labelText.id) labelText.id = `${id}-label`

  const wrap = document.createElement('div')
  wrap.className = 'atlas_dd'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `${select.className} atlas_dd-btn`
  btn.id = `${id}-btn`
  btn.setAttribute('role', 'combobox')
  btn.setAttribute('aria-haspopup', 'listbox')
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('aria-controls', `${id}-list`)
  const ariaLabel = select.getAttribute('aria-label')
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel)
  else if (labelText)
    btn.setAttribute('aria-labelledby', `${labelText.id} ${btn.id}`)
  const value = document.createElement('span')
  value.className = 'atlas_dd-value'
  btn.appendChild(value)

  const list = document.createElement('ul')
  list.className = 'atlas_dd-list'
  list.id = `${id}-list`
  list.setAttribute('role', 'listbox')
  list.tabIndex = -1
  list.hidden = true

  select.after(wrap)
  wrap.append(btn, list)
  select.classList.add('atlas_dd-native')
  select.tabIndex = -1
  select.setAttribute('aria-hidden', 'true')
  // Clicking the visible label should open our trigger, not the hidden select
  label?.addEventListener('click', (e) => {
    if (wrap.contains(e.target)) return
    e.preventDefault()
    btn.focus()
  })

  let items = []
  let active = -1

  function refresh() {
    items = [...select.options].map((o, i) => {
      const li = document.createElement('li')
      li.className = 'atlas_dd-option'
      li.id = `${id}-opt-${i}`
      li.setAttribute('role', 'option')
      li.dataset.value = o.value
      li.textContent = o.textContent
      return li
    })
    list.replaceChildren(...items)
    const sel = select.selectedIndex
    items.forEach((li, i) =>
      li.setAttribute('aria-selected', String(i === sel))
    )
    value.textContent = select.options[sel]?.textContent || ''
    btn.disabled = select.disabled
    btn.title = select.title || ''
  }

  function setActive(i) {
    if (!items.length) return
    active = (i + items.length) % items.length
    items.forEach((li, k) => li.classList.toggle('is-active', k === active))
    list.setAttribute('aria-activedescendant', items[active].id)
    items[active].scrollIntoView({ block: 'nearest' })
  }

  function open() {
    if (btn.disabled || !list.hidden) return
    list.hidden = false
    wrap.classList.add('is-open')
    btn.setAttribute('aria-expanded', 'true')
    setActive(Math.max(0, select.selectedIndex))
    list.focus()
    document.addEventListener('pointerdown', outside, true)
  }

  function close(focusBtn = true) {
    if (list.hidden) return
    list.hidden = true
    wrap.classList.remove('is-open')
    btn.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outside, true)
    if (focusBtn) btn.focus()
  }

  function outside(e) {
    if (!wrap.contains(e.target)) close(false)
  }

  function choose(i) {
    const li = items[i]
    close()
    if (!li || li.dataset.value === select.value) return
    select.value = li.dataset.value
    refresh()
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  }

  btn.addEventListener('click', () => (list.hidden ? open() : close()))
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      open()
    }
  })
  list.addEventListener('keydown', (e) => {
    const k = e.key
    if (k === 'ArrowDown') setActive(active + 1)
    else if (k === 'ArrowUp') setActive(active - 1)
    else if (k === 'Home') setActive(0)
    else if (k === 'End') setActive(items.length - 1)
    else if (k === 'Enter' || k === ' ') choose(active)
    else if (k === 'Escape') close()
    else if (k === 'Tab') return close(false)
    else if (k.length === 1) {
      // type-ahead: jump to the next option starting with that letter
      const c = k.toLowerCase()
      const n = items.length
      for (let s = 1; s <= n; s++) {
        const i = (active + s) % n
        if (items[i].textContent.trim().toLowerCase().startsWith(c)) {
          setActive(i)
          break
        }
      }
    } else return
    e.preventDefault()
  })
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('.atlas_dd-option')
    if (li) setActive(items.indexOf(li))
  })
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.atlas_dd-option')
    if (li) choose(items.indexOf(li))
  })

  refresh()
  return { refresh, close }
}
