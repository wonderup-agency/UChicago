// --------------------------------------------------
// Component Registry
// --------------------------------------------------
// Each entry maps a data-component attribute to a lazy import.
// Components only load when their selector exists on the page.
//
// 2 ways to add a component:
//
// 1. Ask Claude  → "create a component called calculator"
// 2. Terminal    → npm run create-component -- calculator
//
// Both scaffold the file and add an entry here automatically.
// --------------------------------------------------

export default [
  {
    selector: "[data-component='nav-scroll']",
    importFn: () => import('./components/nav-scroll.js'),
  },
  {
    selector: "[data-component='particle-field']",
    importFn: () => import('./components/particle-field.js'),
  },
  {
    selector: "[data-component='research-tabs']",
    importFn: () => import('./components/research-tabs.js'),
  },
  {
    selector: "[data-component='survey']",
    importFn: () => import('./components/survey.js'),
  },
  {
    selector: "[data-component='ecosystem-map']",
    importFn: () => import('./components/ecosystem-map.js'),
  },
  {
    selector: "[data-component='news-reveal']",
    importFn: () => import('./components/news-reveal.js'),
  },
  {
    selector: "[data-component='footer-word']",
    importFn: () => import('./components/footer-word.js'),
  },
  {
    // Country report cards: selector is the attribute, not data-component
    selector: '[data-dot-icon]',
    importFn: () => import('./components/dot-icon.js'),
  },
]
