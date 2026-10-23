// --------------------------------------------------
// survey
// --------------------------------------------------
// Five-question benchmark teaser. Each .survey_step holds a question and
// option buttons; picking one advances to the next step (fade swap), fills
// the progress bar and finally shows the "done" step with its real CTA link.
// --------------------------------------------------
import { reducedMotion } from '../utils/motion.js'
import '../styles/survey.css'

export default function (elements) {
  elements.forEach((root) => {
    const steps = [...root.querySelectorAll('.survey_step')]
    const bar = root.querySelector('[data-survey-bar]')
    const count = root.querySelector('[data-survey-count]')
    const total = steps.filter((s) => s.dataset.surveyStep !== 'done').length
    if (!steps.length || !total) return

    let current = Math.max(
      0,
      steps.findIndex((s) => s.classList.contains('cc-active'))
    )
    const swapMs = reducedMotion() ? 0 : 280

    const paint = () => {
      const shown = Math.min(current + 1, total)
      if (bar) bar.style.transform = `scaleX(${shown / total})`
      if (count) count.textContent = `${shown} / ${total}`
    }

    const goTo = (i) => {
      const from = steps[current]
      const to = steps[i]
      if (!to) return
      from.classList.add('is-leaving')
      setTimeout(() => {
        from.classList.remove('cc-active', 'is-leaving')
        to.classList.add('cc-active')
        current = i
        paint()
        const first = to.querySelector('.button')
        if (first && root.contains(document.activeElement)) first.focus()
      }, swapMs)
    }

    steps.forEach((step, i) => {
      if (step.dataset.surveyStep === 'done') return
      const options = [...step.querySelectorAll('.survey_options .button')]
      options.forEach((opt) => {
        opt.setAttribute('role', 'button')
        opt.setAttribute(
          'aria-pressed',
          String(opt.classList.contains('cc-active'))
        )
        opt.addEventListener('click', (e) => {
          e.preventDefault()
          options.forEach((o) => {
            const on = o === opt
            o.classList.toggle('cc-active', on)
            o.setAttribute('aria-pressed', String(on))
          })
          setTimeout(() => goTo(i + 1), reducedMotion() ? 0 : 380)
        })
      })
    })

    paint()
  })
}
