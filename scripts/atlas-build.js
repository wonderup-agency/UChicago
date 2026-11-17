// --------------------------------------------------
// atlas-build
// --------------------------------------------------
// Builds src/data/atlas.json for the Ecosystem Atlas from the lab's export:
// the `window.ATLAS = {...}` object embedded in their platform prototype
// (or a plain JSON file with the same object).
//   node scripts/atlas-build.js [input]
//   default input: prototype/ecosystem-platform/index.html
//
// The lab object repeats every entity, note and text per measure (~2.8 MB).
// This writes a compact version: entities and notes are listed once and
// referenced by index, values are rounded to 4 significant digits, and
// country entries get a beacon position (centroid of their largest polygon,
// or a fixed point for countries too small for the 110m map).
// --------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs'
import { geoArea, geoCentroid } from 'd3-geo'
import { feature } from 'topojson-client'
import pc from 'picocolors'

const input = process.argv[2] || 'prototype/ecosystem-platform/index.html'
const OUT = 'src/data/atlas.json'
const WORLD = JSON.parse(readFileSync('src/data/atlas-world.json', 'utf8'))

// World Bank economy names -> world-atlas names (only the mismatches)
const ALIAS = {
  'United States': 'United States of America',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Central African Republic': 'Central African Rep.',
  'Congo, Dem. Rep.': 'Dem. Rep. Congo',
  'Congo, Rep.': 'Congo',
  "Cote d'Ivoire": "Côte d'Ivoire",
  'Dominican Republic': 'Dominican Rep.',
  'Egypt, Arab Rep.': 'Egypt',
  Eswatini: 'eSwatini',
  'Gambia, The': 'Gambia',
  'Iran, Islamic Rep.': 'Iran',
  'Kyrgyz Republic': 'Kyrgyzstan',
  'Lao PDR': 'Laos',
  'North Macedonia': 'Macedonia',
  'Russian Federation': 'Russia',
  'South Sudan': 'S. Sudan',
  'Syrian Arab Republic': 'Syria',
  Turkiye: 'Turkey',
  'Venezuela, RB': 'Venezuela',
  'Viet Nam': 'Vietnam',
  'West Bank and Gaza': 'Palestine',
  'Yemen, Rep.': 'Yemen',
  'Solomon Islands': 'Solomon Is.',
  'Korea, Rep.': 'South Korea',
  'Slovak Republic': 'Slovakia',
  'Bahamas, The': 'Bahamas',
  'Brunei Darussalam': 'Brunei',
  'Somalia, Fed. Rep.': 'Somalia',
  'Equatorial Guinea': 'Eq. Guinea',
  'Puerto Rico (US)': 'Puerto Rico',
}
// World Bank economy names -> display names (the rest are already readable)
const DISPLAY = {
  'Egypt, Arab Rep.': 'Egypt',
  'Korea, Rep.': 'South Korea',
  'Iran, Islamic Rep.': 'Iran',
  'Russian Federation': 'Russia',
  'Viet Nam': 'Vietnam',
  'Slovak Republic': 'Slovakia',
  'Kyrgyz Republic': 'Kyrgyzstan',
  'Lao PDR': 'Laos',
  'Venezuela, RB': 'Venezuela',
  'Yemen, Rep.': 'Yemen',
  'Gambia, The': 'The Gambia',
  'Bahamas, The': 'The Bahamas',
  'Congo, Dem. Rep.': 'DR Congo',
  'Congo, Rep.': 'Republic of the Congo',
  'Brunei Darussalam': 'Brunei',
  'Somalia, Fed. Rep.': 'Somalia',
  'Micronesia, Fed. Sts.': 'Micronesia',
  'Syrian Arab Republic': 'Syria',
  'Puerto Rico (US)': 'Puerto Rico',
  'Sint Maarten (Dutch part)': 'Sint Maarten',
  'Virgin Islands (U.S.)': 'U.S. Virgin Islands',
  'West Bank and Gaza': 'West Bank and Gaza',
}
const display = (n) => DISPLAY[n] || n

// Countries with no polygon in the 110m map: [lat, lng]
const POINTS = {
  Singapore: [1.35, 103.82],
  'Hong Kong': [22.32, 114.17],
  Macau: [22.2, 113.55],
  Bahrain: [26.07, 50.55],
  Malta: [35.9, 14.45],
  Mauritius: [-20.25, 57.55],
  Seychelles: [-4.62, 55.45],
  Maldives: [4.17, 73.51],
  'Cabo Verde': [15.0, -23.6],
  Liechtenstein: [47.16, 9.55],
  Monaco: [43.74, 7.42],
  Andorra: [42.51, 1.52],
  'San Marino': [43.94, 12.46],
  Barbados: [13.19, -59.54],
  'Antigua and Barbuda': [17.08, -61.8],
  Grenada: [12.12, -61.68],
  'St. Lucia': [13.91, -60.98],
  Curacao: [12.17, -68.98],
  Aruba: [12.52, -69.97],
}

function readAtlas(file) {
  const text = readFileSync(file, 'utf8')
  const i = text.indexOf('window.ATLAS')
  const start = text.indexOf('{', i >= 0 ? i : 0)
  // raw_decode: walk to the matching closing brace (strings may hold braces)
  let depth = 0
  let inStr = false
  for (let k = start; k < text.length; k++) {
    const c = text[k]
    if (inStr) {
      if (c === '\\') k++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0)
      return JSON.parse(text.slice(start, k + 1))
  }
  throw new Error('window.ATLAS object not found')
}

const sig = (v) => (v == null ? null : Number(Number(v).toPrecision(4)))
const blockId = (pillar) => (/talent/i.test(pillar) ? 'talent' : 'capital')

const atlas = readAtlas(input)
const countries = feature(WORLD, WORLD.objects.countries).features
const byName = new Map(countries.map((f) => [f.properties.name, f]))
// Centroid of the largest polygon (keeps the US beacon out of Canada)
function anchor(f) {
  const polys =
    f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
      : [f.geometry]
  const big = polys.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a))
  const [lng, lat] = geoCentroid(big)
  return [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100]
}

const notes = []
const noteIdx = (t) => {
  if (!t) return -1
  let i = notes.indexOf(t)
  if (i < 0) i = notes.push(t) - 1
  return i
}
const entities = []
const entIdx = new Map()
const unplaced = new Set()
function entity(e) {
  if (entIdx.has(e.id)) return entIdx.get(e.id)
  const f = byName.get(ALIAS[e.country] || e.country)
  let lat = e.lat
  let lng = e.lon
  if (lat == null || lng == null) {
    const p = e.isCity ? null : f ? anchor(f) : POINTS[e.country]
    ;[lat, lng] = p || [null, null]
    if (!p) unplaced.add(e.name)
  }
  entIdx.set(e.id, entities.length)
  entities.push({
    id: e.id,
    name: e.isCity ? e.name : display(e.name),
    country: display(e.country),
    region: e.region || '',
    city: e.isCity ? 1 : 0,
    metro: e.isMetro ? 1 : 0,
    lat,
    lng,
    iso: f ? String(f.id) : null,
  })
  return entIdx.get(e.id)
}

let minYear = Infinity
let maxYear = -Infinity
const values = {}
const measures = atlas.measures.map(({ measure: m, ecosystems }) => {
  const key = m.code
  values[key] = ecosystems
    .filter((e) => e.series && e.series.length)
    .map((e) => [
      entity(e),
      e.core ? 1 : 0,
      noteIdx(e.note),
      e.series.map((s) => {
        minYear = Math.min(minYear, s.year)
        maxYear = Math.max(maxYear, s.year)
        const row = [s.year, sig(s.value), s.n ?? null]
        const extra = {}
        if (s.inds)
          extra.inds = s.inds.map((x) => (x ? [x[0], sig(x[1])] : null))
        else if (s.top) extra.top = s.top
        if (s.vals) extra.vals = s.vals.map(sig)
        if (s.cnts) extra.cnts = s.cnts
        if (Object.keys(extra).length) row.push(extra)
        return row
      }),
    ])
  return {
    key,
    name: m.name,
    block: blockId(m.pillar),
    section: m.section || '',
    theme: m.theme || '',
    themeRank: m.themeRank ?? 0,
    unit: m.unit || '',
    direction: m.higherIsBetter === false ? 'lower' : 'higher',
    cityLevel: !!m.cityLevel,
    industryRanks: !!m.industryRanks,
    kind: /^companies$/.test(m.unit) ? 'count' : 'rate',
    fmt: m.fmt || 'number',
    variants: m.variants
      ? m.variants.map((v) => ({
          label: v.label,
          unit: v.unit || m.unit,
          direction:
            (v.higherIsBetter ?? m.higherIsBetter) === false
              ? 'lower'
              : 'higher',
          countLabel: v.countLabel || '',
        }))
      : null,
    definition: m.definition || '',
    construction: m.construction || '',
    caveat: m.caveat || '',
    source: m.source || '',
    reference: m.reference || '',
  }
})

const blocks = [
  ['capital', 'Capital measures'],
  ['talent', 'Talent and Hiring'],
]
  .filter(([id]) => measures.some((m) => m.block === id))
  .map(([id, fallback]) => ({
    id,
    name:
      atlas.measures.find(({ measure }) => blockId(measure.pillar) === id)
        ?.measure.pillar || fallback,
  }))

const out = {
  meta: {
    product: atlas.product || '',
    input,
    years: [minYear, maxYear],
  },
  blocks,
  notes,
  entities,
  measures,
  values,
}
const json = JSON.stringify(out)
writeFileSync(OUT, json)
console.log(
  pc.green(`✓ ${OUT}`),
  pc.dim(
    `${measures.length} measures · ${entities.length} entities · ${(json.length / 1024).toFixed(0)} KB`
  )
)
if (unplaced.size)
  console.log(
    pc.yellow(`  ${unplaced.size} countries without a map position`),
    pc.dim('(listed in rankings only)')
  )
