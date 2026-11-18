# particle-field

`src/components/particle-field.js` + `src/styles/particle-field.css`. Data: `src/data/particles.json` (served from `dist/data/`).

Webflow: `data-component="particle-field"` on the fixed `.particle-field` host. Shapes are anchored with `data-particles-state="hero|flow|research|dust|team|off"` (+ `data-dir="1|-1"` on flows).

## How it works

One fixed WebGL canvas (Three.js) behind the page, in two parts:

1. **Traveler** (every anchor up to and including the research graphics): ONE particle set that morphs between states as you scroll, with a spring and 22% holds (original behavior).
   - Hero: loop ring → world → africa → south america → europe.
   - Our mission: the particles spread while travelling.
   - Research: the same particles form the region graphic of the active tab and morph on tab change (`research:change`). After research they stay on the graphic and scroll away with it.
   - A river placed before research (older layout) is also part of the traveler.
2. **Layers** (every anchor after research: rivers, team): independent shapes anchored to their element. When the element is 15% inside the viewport, every particle fades in at its own random moment (`uReveal` 0 → 1 over ~1.4s, per-particle seed); it fades out the same way (~0.8s) once the element leaves. `dust`/`off` anchors are ignored here.
   - There is no background dust layer: Figma only has particles in the hero, research graphic, rivers and the Team card.

## Hero readability

`particle-field.css` adds a soft white radial glow behind `.hero_content` (`::before`, `--_color---neutral--white` solid to 55%, opacity .96, `inset: -24% -20% 0%`, centered on the title and subtitle). `.hero_content` gets `position: relative` + `isolation: isolate` so the glow sits above the canvas and below the text. The hero secondary button (`.hero_btns` + secondary variant) gets a solid white background so particles never show through it; its hover tint is mixed on white so it stays opaque.

Reduced motion: static shapes, no loop. No WebGL / software GPU: no canvas. DPR max 2, paused when the tab is hidden.

## Lifecycle

No hooks returned; listens to `resize`, `pointermove`, `visibilitychange` and `research:change` itself.
