# news-article

**File**: `src/components/news-article.js` + `src/styles/news-article.css`
**Webflow attribute**: `data-component="news-article"` on `article.news-article` of the News Template page (`/news/<slug>`)

## Purpose

Tidies the CMS article page where bindings fall short. Everything else (title, tags, lead, body, authors, buttons) is bound in Webflow.

## Webflow setup

- `[data-date-format="month"]` (bound to Date) → "Month YYYY".
- Two Button components with Attribute Name `data-article-cta` (Primary ↗ bound to Primary link label/link, Secondary ↗ bound to Secondary link label/link).
- `[data-article-optional]` on the related-project tag wrapper and the lead paragraph.
- `[data-article-byline]` on `.news-article_byline` ("By" + Authors list `.news-article_authors` > `.news-article_author`). The list source must be the item's **Authors** field (set by hand in the Designer; the MCP can't).

## Behavior

- **Init**: formats dates; hides buttons with an empty label or URL (external URLs open in a new tab); hides empty optional parts and the byline when there are no authors. CSS adds the commas/"and" between authors.
- **Resize**: Not used
- **Breakpoint**: Not used

## Dependencies

`../utils/date.js` (`formatDates`).
