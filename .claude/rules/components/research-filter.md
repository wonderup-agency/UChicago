# research-filter

**File**: `src/components/research-filter.js` + `src/styles/research-filter.css`
**Webflow attribute**: `data-component="research-filter"` on `.research_layout` (Research page, wraps the filters and the Projects list)

## Purpose

Region filter for the Research page cards (All / Global / Africa / Latin America / Asia).

## Webflow setup

- `.research_filters[role=group]`: a static `button.research_filter[data-filter="all"]` + a Collection List of Regions (sorted by Order) whose items hold `button.research_filter[data-filter=<region slug>]`. Each button sits in `.research_filter-item[data-filter-item]`.
- Cards: `[data-project-card]` with `[data-region]` slugs in the item's hidden data block (nested Regions list, source = the Project's Regions field).
- Row meta `[data-project-regions]` is filled with the region names (`data-region-name` on each `[data-region]`); stays "Global" when none.
- Optional `[data-filter-empty]` element, shown when no card matches.

## Behavior

- **Init**: reads card regions, hides filter buttons for regions no project uses, applies `?region=<slug>` (or All).
- Click: sets `aria-pressed` on the buttons, sets `hidden` on non-matching Collection items, updates `?region=` with replaceState (All removes it).
- CSS: active / hover opacity 1, active filter in primary text color, arrow on the active filter (desktop), underline on tablet and below. Row hover lives in `list-row.css` (project-profile).
- **Resize**: Not used
- **Breakpoint**: Not used

## Dependencies

None.
