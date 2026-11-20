# particle-field

`src/components/particle-field.js` + `src/styles/particle-field.css`. Data: `src/data/particles.json` (served from `dist/data/`).

Webflow: `data-component="particle-field"` on the fixed `.particle-field` host. Shapes are anchored with `data-particles-state="hero|flow|research|dust|team|arc|off"` (+ `data-dir="1|-1"` on flows).

## How it works

One fixed WebGL canvas (Three.js) behind the page, in two parts:

1. **Traveler** (every anchor up to and including the research graphics): ONE particle set that morphs between states as you scroll, with a spring and 22% holds (original behavior).
   - Hero: loop ring → world → africa → south america → europe.
   - Our mission: the particles spread while travelling.
   - Research: the same particles form the region graphic of the active tab and morph on tab change (`research:change`). After research they stay on the graphic and scroll away with it.
   - A river placed before research (older layout) is also part of the traveler.
2. **Layers** (every anchor after research: rivers, team): independent shapes anchored to their element. When the element is 15% inside the viewport, every particle fades in at its own random moment (`uReveal` 0 → 1 over ~1.4s, per-particle seed); it fades out the same way (~0.8s) once the element leaves. `dust`/`off` anchors are ignored here.
   - Team: the river bend is clipped in the fragment shader to the `.home-card` that contains the anchor (rounded rect via `uClip` + `uClipR`, CSS px), so it reads as `overflow: hidden`. The avatars (`.team_bubble`) float gently via `cards.css`.
   - There is no background dust layer: Figma only has particles in the hero, research graphic, rivers and the Team card.

## Other pages

- Research (`/research`): its own `.particle-field` host and an `arc` anchor (`.particle-anchor[data-particles-state="arc"]`, absolute at the top of `.page-wrapper`, 53.3rem tall). The arc is the Figma "Masked Hero asset" (secondary hero tier, still a placeholder per the designer): 1,875 dots from the Union vector, stored in `particles.json` → `arc` (`n`, `w` 991, `h` 853, `b`) in frame px. It is always a layer (never part of the traveler): right-aligned, scale `min(1.25, vw/1440)` (×1.6 on mobile), clipped to its 991×853 frame via `uClip`, fades in like the other layers and breathes gently (`MOT` 0.6). The union lost per-dot opacity, so opacity is derived from dot size. To swap the final asset: re-export the node as SVG and rebuild the `arc` entry (circle subpaths → x, y, r, op).

## Hero readability

`particle-field.css` adds a soft white radial glow behind `.hero_content` (`::before`, `--_color---neutral--white` solid to 55%, opacity .96, `inset: -24% -20% 0%`, centered on the title and subtitle). `.hero_content` gets `position: relative` + `isolation: isolate` so the glow sits above the canvas and below the text. The hero secondary button (`.hero_btns` + secondary variant) gets a solid white background so particles never show through it; its hover tint is mixed on white so it stays opaque.

Reduced motion: static shapes, no loop. No WebGL / software GPU: no canvas. DPR max 2, paused when the tab is hidden.

## Lifecycle

No hooks returned; listens to `resize`, `pointermove`, `visibilitychange` and `research:change` itself.
