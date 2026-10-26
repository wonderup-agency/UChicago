// --------------------------------------------------
// nav-scroll
// --------------------------------------------------
// The Nav (.nav) is fixed in Webflow. On scroll the hello bar slides up and
// out of view (the nav is translated by the banner's height) while the pill
// stays pinned at the top and switches to a compact state (.is-scrolled).
// --------------------------------------------------
import '../styles/nav-scroll.css'

const COMPACT_AFTER = 80

export default function (elements) {
  const nav = elements[0]
  if (!nav) return
  const banner = nav.querySelector('.nav-hello')

  let bannerHeight = 0
  const measure = () => {
    bannerHeight = banner ? banner.offsetHeight : 0
  }

  let ticking = false
  const update = () => {
    ticking = false
    const y = Math.max(0, window.scrollY)
    nav.style.setProperty('--nav-shift', `${-Math.min(y, bannerHeight)}px`)
    nav.classList.toggle('is-scrolled', y > COMPACT_AFTER)
  }

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    },
    { passive: true }
  )

  measure()
  update()

  return {
    resize() {
      measure()
      update()
    },
  }
}
