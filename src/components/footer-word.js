// --------------------------------------------------
// footer-word
// --------------------------------------------------
// Splits the big footer wordmark into letters so each one can hop on hover.
// The element is aria-hidden in Webflow (decorative), so screen readers skip it.
// --------------------------------------------------
import '../styles/footer-word.css'

export default function (elements) {
  elements.forEach((el) => {
    const text = el.textContent.trim()
    el.textContent = ''
    ;[...text].forEach((ch) => {
      const span = document.createElement('span')
      span.className = 'footer_word-char'
      span.textContent = ch === ' ' ? ' ' : ch
      el.append(span)
    })
  })
}
