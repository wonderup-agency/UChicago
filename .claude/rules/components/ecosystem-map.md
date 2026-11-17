# ecosystem-map

`src/components/ecosystem-map.js` + `src/styles/ecosystem-map.css`. Data: `src/data/ecosystem-map.json` (served from `dist/data/`).

Webflow: `data-component="ecosystem-map"` on the Digital Maps section. Hooks: `[data-map-canvas]` (SVG target), `[data-map-metric]` (metric A / B toggle), `[data-map-tip]` (tooltip).

## How it works

- Draws the world dot map and one marker per tracked ecosystem, colored and sized by score tier (brand color tokens).
- Metric toggle swaps the scored metric (A: Ecosystem Vitality Index, B: Startup Activity) and animates marker size and color.
- Tooltip on hover/focus shows city, metric and value; each marker also carries an `aria-label` with the value.
- Mobile (`max-width: 767px`): zoomed regions (Americas, Europe & Africa, Asia, World) instead of the full map.

## Labels

Figma (Feedback 3): only the city name is drawn next to each marker. `LABEL_SIDE` picks the side per city (a/b/l/r) so names never collide; `placeLabel` puts the name where the value used to sit. The value element (`.map_city-value`) still exists but is hidden in CSS; values live in the tooltip and `aria-label`.

Reduced motion: no marker transitions.
