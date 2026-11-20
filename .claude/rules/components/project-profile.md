# project-profile

**File**: `src/components/project-profile.js` + `src/styles/project-profile.css` (also imports `people-profile.css` for the shared `person-modal_*` shell states)
**Webflow attribute**: `data-component="project-profile"` on the `.person-modal` dialog of the Research page (`/research`) and the News page (`/news`, with `data-param="article"`)

## Purpose

One detail panel filled from CMS cards: projects on Research, articles on News (`data-param` sets the URL param, default `project`). Same shell as the People profile (rail with close / next / prev, panel, overlay), different content.

## Webflow setup

- Panel root: `.person-modal[data-component="project-profile"][role=dialog][aria-labelledby="project-modal-name"]`
- Shell hooks (shared with people-profile): `[data-profile-close]`, `[data-profile-next]`, `[data-profile-prev]`, `[data-profile-panel]`
- Panel content hooks: `[data-panel-tag]`, `[data-panel-status]`, `[data-panel-name]` (h2 #project-modal-name), `[data-panel-team]` > `[data-panel-avatars]` + `[data-panel-authors]`, `[data-panel-lead]`, `[data-panel-body]`, `[data-panel-milestones-wrap]` > `[data-panel-milestones]` (`.project-panel_timeline`), `[data-panel-cta-wrap]` > Button component with Attribute Name `data-panel-cta`
- Each Collection item (Projects, sorted by Order):
  - `article.project-card.cc-wide[data-project-card]` with `[data-project-tag]`, `[data-project-status]`, `[data-project-name]`, `[data-project-summary]` and a Button (cc-link, Attribute Name `data-project-open`)
  - `.project-data[data-project-data]` (display none) with bound attributes `data-slug`, `data-lead`, `data-cta-label`, `data-cta-link`, `data-external`; Rich Text `[data-project-body]` and `[data-project-milestones]`; nested list of Regions (items `[data-region]` = slug) and of Team (items `[data-team-member]` with `data-name`, `data-order` + photo `<img>`)
- The two nested lists must use the multi-reference fields as source ("Regions" and "Team" of the current Project). The MCP can't set that; it's set by hand in the Designer.

## News setup

- Panel: same hooks, plus `[data-panel-tag-wrap]` / `[data-panel-status-wrap]` (hidden when empty) and a second Button with Attribute Name `data-panel-cta-2` (Secondary ↗).
- Recent list items: `article.list-row[data-project-card]` (`.list-row_num` empty, numbered by `list-row.css`; title `.list-row_title`) + `.project-data[data-project-data]` with `data-slug`, `data-lead`, `data-tag` (related project tag), `data-status` (Type), `data-date`, `data-cta-label/link`, `data-cta2-label/link`, body rich text and the Authors list as `[data-team-member]` (`data-name`, `data-order`, `data-role`, img). The Authors list source is set by hand.
- Featured card: `article.news-featured[data-open-slug=<slug>]` opens the same panel; its Button (`data-featured-link`, Read the article →) gets `?article=<slug>`; `[data-featured-author]` (`-img`, `-name`, `-role`) shows the first author.
- `[data-date-format="month"]` anywhere on the page → "Month YYYY". Panel status reads "Type · Month YYYY".

## Behavior

- **Init**: reads every card + its data block, moves the dialog to `<body>`, wires the card click (whole card) and the Read more link (`href=?project=<slug>`, sr-only label "Read more about <name>").
- Opens on click or `?project=<slug>` (pushState on open, replaceState while navigating, back closes). Esc / overlay / close button close; focus is trapped and returns to the trigger.
- Prev/next walk only visible cards (items `research-filter` hid are skipped).
- Fill: tag + status, name, up to 3 avatars (+N chip) and "By A, B and C" (team sorted by People Order), lead (falls back to Summary), body rich text, milestones (hidden when empty), CTA button (label from CTA label, URL from CTA link or External link; external URLs open in a new tab; hidden when either is missing).
- **Resize**: Not used
- **Breakpoint**: Not used

## JS-only classes (add to Prevent delete in Webflow)

`is-open`, `is-visible`, `is-profile-open` (shared with people-profile). Avatars use repo CSS only (`project-avatar`, `is-more`).

## Dependencies

`../utils/motion.js` (`reducedMotion`), `../utils/date.js` (`formatDates`, `monthYear`), `../styles/list-row.css` (row numbering + hover).
