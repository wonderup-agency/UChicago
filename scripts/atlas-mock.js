// --------------------------------------------------
// atlas-mock
// --------------------------------------------------
// Generates src/data/atlas.json: FICTIONAL, seeded data for the Ecosystem
// Atlas until the lab delivers the real export. Same seed = same file.
//   node scripts/atlas-mock.js
// Replace this file's output with the real data keeping the same shape.
// --------------------------------------------------
import { writeFileSync } from 'node:fs'

let s = 20261117
const rand = () => {
  s = (s * 1664525 + 1013904223) >>> 0
  return s / 4294967296
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const r3 = (v) => Math.round(v * 1000) / 1000

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
const TREND_YEARS = Array.from({ length: 16 }, (_, i) => 2010 + i)

// Blocks match the CMS "Block" option field.
const blocks = [
  { id: 'capital', name: 'Capital measures' },
  { id: 'talent', name: 'Talent & Hiring measures' },
]

// key, name, block, unit, direction, level, [min, max], kind
const MEASURES = [
  ['vc-share-gdp', 'VC Investment as a Share of GDP', 'capital', '% of GDP', 'higher', 'country', [0.056, 1.6], 'rate'],
  ['vc-deals', 'VC deals', 'capital', 'n', 'higher', 'city', [40, 4200], 'count'],
  ['median-seed', 'Median seed round', 'capital', 'USD M', 'higher', 'city', [0.4, 6], 'rate'],
  ['exit-value', 'Exit value', 'capital', 'USD B', 'higher', 'city', [0.2, 90], 'count'],
  ['foreign-investor-share', 'Foreign investor share', 'capital', '%', 'higher', 'city', [4, 70], 'rate'],
  ['hiring-demand', 'Startup hiring demand', 'talent', 'postings per 1k workers', 'higher', 'city', [2, 48], 'rate'],
  ['specialist-density', 'Tech specialist density', 'talent', 'per 10k workers', 'higher', 'city', [20, 410], 'rate'],
  ['talent-inflow', 'International talent inflow', 'talent', 'per 1k workers', 'higher', 'country', [0.4, 18], 'rate'],
  ['talent-outflow', 'Talent outflow', 'talent', 'per 1k workers', 'lower', 'city', [0.6, 14], 'rate'],
  ['repeat-founders', 'Repeat founders', 'talent', '%', 'higher', 'city', [6, 45], 'rate'],
]

const PILLARS = [
  'Capital & Funding',
  'Public Support',
  'Narratives & Sentiment',
  'Startup Activity',
  'Talent',
  'Regulation & Institutions',
]

// id, name, country, iso (ISO 3166 numeric), region, lat, lng, strength 0-1
const ECOS = [
  ['sf-bay', 'San Francisco Bay', 'United States', '840', 'North America', 37.77, -122.42, 0.97],
  ['new-york', 'New York', 'United States', '840', 'North America', 40.71, -74.0, 0.9],
  ['london', 'London', 'United Kingdom', '826', 'Europe', 51.5, -0.12, 0.86],
  ['boston', 'Boston', 'United States', '840', 'North America', 42.36, -71.06, 0.84],
  ['tel-aviv', 'Tel Aviv', 'Israel', '376', 'Middle East', 32.08, 34.78, 0.83],
  ['shenzhen', 'Shenzhen', 'China', '156', 'Asia', 22.54, 114.06, 0.8],
  ['singapore', 'Singapore', 'Singapore', '702', 'Asia', 1.35, 103.82, 0.8],
  ['beijing', 'Beijing', 'China', '156', 'Asia', 39.9, 116.4, 0.79],
  ['stockholm', 'Stockholm', 'Sweden', '752', 'Europe', 59.33, 18.07, 0.75],
  ['paris', 'Paris', 'France', '250', 'Europe', 48.86, 2.35, 0.74],
  ['berlin', 'Berlin', 'Germany', '276', 'Europe', 52.52, 13.4, 0.72],
  ['bengaluru', 'Bengaluru', 'India', '356', 'Asia', 12.97, 77.59, 0.7],
  ['toronto', 'Toronto', 'Canada', '124', 'North America', 43.65, -79.38, 0.68],
  ['sao-paulo', 'São Paulo', 'Brazil', '076', 'Latin America', -23.55, -46.63, 0.6],
  ['jakarta', 'Jakarta', 'Indonesia', '360', 'Asia', -6.2, 106.85, 0.55],
  ['nairobi', 'Nairobi', 'Kenya', '404', 'Africa', -1.29, 36.82, 0.48],
]

const ecosystems = ECOS.map(([id, name, country, iso, region, lat, lng]) => ({
  id,
  name,
  country,
  iso,
  region,
  lat,
  lng,
}))

// Value on the measure's own scale from a 0-1 strength
function toRaw(m, t) {
  const [, , , , dir, , [a, b], kind] = m
  let x = clamp(t, 0, 1)
  if (kind === 'count') x = Math.pow(x, 1.8)
  if (dir === 'lower') x = 1 - x
  const v = a + x * (b - a)
  return m[3] === 'n' ? Math.round(v) : r3(v)
}

const values = {}
MEASURES.forEach((m) => {
  values[m[0]] = {}
  ECOS.forEach((e) => {
    const end = clamp(e[7] + (rand() - 0.5) * 0.3, 0.05, 1)
    const growth = -0.04 + rand() * 0.22
    const row = {}
    YEARS.forEach((y, i) => {
      const k = i / (YEARS.length - 1)
      row[y] = toRaw(m, end - growth * (1 - k) + (rand() - 0.5) * 0.04 * (1 - k))
    })
    values[m[0]][e[0]] = row
  })
})

// Pillar scores for the profile (0-100), 2026 only
const pillars = {}
ECOS.forEach((e) => {
  pillars[e[0]] = PILLARS.map(() =>
    Math.round(clamp(e[7] * 100 + (rand() - 0.5) * 24, 20, 99))
  )
})

// Filter multipliers applied by the JS on top of the base value
const options = {
  coverage: [
    ['core', 'Core ecosystems'],
    ['countries', 'Countries'],
  ],
  industry: [
    ['all', 'All industries'],
    ['ai', 'AI & software'],
    ['fintech', 'Fintech'],
    ['health', 'Health & bio'],
    ['climate', 'Climate & energy'],
  ],
  flow: [
    ['all', 'All flows'],
    ['domestic', 'Domestic'],
    ['inbound', 'Inbound (foreign)'],
    ['outbound', 'Outbound'],
  ],
  level: [
    ['all', 'All stages'],
    ['seed', 'Seed'],
    ['early', 'Early stage'],
    ['growth', 'Growth'],
  ],
}
const factors = {}
ECOS.forEach((e) => {
  const f = {}
  ;['industry', 'flow', 'level'].forEach((k) => {
    f[k] = {}
    options[k].forEach(([id]) => {
      f[k][id] = id === 'all' ? 1 : r3(0.35 + rand() * 0.9)
    })
  })
  factors[e[0]] = f
})

// Country trend lines for the Trend figure tab (country-level series)
const TREND_COUNTRIES = [
  'United States', 'Israel', 'Singapore', 'United Kingdom', 'India', 'Sweden',
  'Canada', 'France', 'China', 'United Arab Emirates', 'Germany', 'Australia',
  'Brazil', 'Japan', 'South Korea', 'Indonesia', 'Kenya', 'Spain',
]
const trend = {}
MEASURES.forEach((m) => {
  const series = {}
  TREND_COUNTRIES.forEach((c, ci) => {
    const base = clamp(0.85 - ci * 0.045 + (rand() - 0.5) * 0.1, 0.05, 1)
    let t = base * 0.45
    series[c] = TREND_YEARS.map((y) => {
      const boom = y === 2021 ? 0.35 : y === 2022 ? 0.12 : 0
      t = clamp(t + (base - t) * 0.12 + (rand() - 0.45) * 0.05, 0.02, 1)
      return toRaw(m, clamp(t + boom * base, 0, 1))
    })
  })
  trend[m[0]] = { years: TREND_YEARS, series }
})

const data = {
  meta: {
    mock: true,
    note: 'Fictional seeded data for development. Replace with the lab export.',
    dataAsOf: '2026-06-30',
    years: YEARS,
  },
  blocks,
  measures: MEASURES.map(([key, name, block, unit, direction, level, range, kind]) => ({
    key,
    name,
    block,
    unit,
    direction,
    level,
    range,
    kind,
  })),
  pillars: PILLARS,
  ecosystems,
  options,
  values,
  pillarScores: pillars,
  factors,
  trend,
}

writeFileSync('src/data/atlas.json', JSON.stringify(data))
console.log('atlas.json written', JSON.stringify(data).length, 'bytes')
