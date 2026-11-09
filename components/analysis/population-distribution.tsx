import { motion, useReducedMotion } from 'motion/react'
import { TextMorph } from 'torph/react'
import populations from '@/lib/analysis-v2/population-2025.json'
import regional from '@/lib/analysis-v2/population-regions-2025.json'

type Population = { name: string; shares: number[]; population: number[][] }
const countries: Record<string, Population> = populations
const regions: Record<string, Population> = regional.regions
const countryRegions: Record<string, string> = regional.countryRegions
const timeZones: Record<string, string> = regional.timeZones

export function countryFromTimeZone(timeZone: string) {
  return Object.hasOwn(timeZones, timeZone) ? timeZones[timeZone] : null
}

export const ageBands = ['Prefer not to say', 'Under 18', '18–24', '25–34', '35–49', '50+'] as const
export const skipEthnicity = 'Prefer not to say'

const ethnicityTables: Record<string, { name: string; year: number; source: string; groups: Record<string, number> }> = {
  US: {
    name: 'United States', year: 2020,
    source: 'https://www2.census.gov/geo/maps/DC2020/Profiles20/2020_State_Profile_United_States.pdf',
    groups: {
      'Asian alone': 6, 'Black or African American alone': 12.4, 'Hispanic or Latino (any race)': 18.7,
      'American Indian or Alaska Native alone': 1.1, 'Native Hawaiian or Pacific Islander alone': .2,
      'White alone': 61.6, 'Two or more races': 10.2, 'Some other race alone': 8.4,
    },
  },
  CA: {
    name: 'Canada', year: 2021,
    source: 'https://www150.statcan.gc.ca/n1/pub/82-570-x/2023001/section4-eng.htm',
    groups: {
      'South Asian': 7.1, Chinese: 4.7, Black: 4.3, Filipino: 2.6, 'Latin American': 1.6, Arab: 1.9,
      'Southeast Asian': 1.1, 'West Asian': 1, Korean: .6, Japanese: .3, Indigenous: 5, 'Multiple racialized groups': .9,
    },
  },
  GB: {
    name: 'England and Wales', year: 2021,
    source: 'https://www.ons.gov.uk/peoplepopulationandcommunity/culturalidentity/ethnicity/bulletins/ethnicgroupenglandandwales/census2021',
    groups: { Asian: 9.3, Black: 4, 'Mixed or multiple ethnic groups': 2.9, White: 81.7, 'Other ethnic group': 2.1 },
  },
}

export function ethnicityOptions(country: string | null) {
  const groups = ethnicityReference(country)?.groups
  return [skipEthnicity, ...(groups ? Object.keys(groups) : [
    'Asian', 'Black', 'Hispanic or Latino', 'Indigenous', 'Middle Eastern or North African',
    'Pacific Islander', 'White', 'Mixed or multiple backgrounds',
  ]), 'Another background']
}

export function formatEthnicityLabel(value: string) {
  return value.replace(/ alone$/, '')
}

function ethnicityReference(country: string | null) {
  return country && Object.hasOwn(ethnicityTables, country) ? ethnicityTables[country] : null
}

function populationCountryName(name: string) {
  return name.replace('United States of America', 'United States')
    .replace('United Kingdom of Great Britain and Northern Ireland', 'United Kingdom')
}
export function populationRegion(country: string | null) {
  const code = country && /^[A-Z]{2}$/.test(country) ? country : ''
  const local = countries[code]
  const area = countryRegions[code]
  const reference = regions[area] ?? regions['Northern America']
  const population = local ?? reference
  return { ...population, name: populationCountryName(population.name), scope: local ? 'country' : 'region', region: area ?? reference.name }
}

const populationSource = 'https://population.un.org/wpp/'
const columns = Array.from({ length: 20 }, (_, index) => index)
const ease = [.22, 1, .36, 1] as const
const formatShare = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function PopulationDistribution({ country, gender, ageBand, background, mode }: {
  country: string | null
  gender: 'male' | 'female' | 'other' | null
  ageBand?: string
  background: string
  mode: 'profile' | 'age' | 'ethnicity'
}) {
  const reduce = useReducedMotion()
  const region = populationRegion(country)
  const ageIndex = ageBands.findIndex(band => band === ageBand)
  const ethnicity = mode === 'ethnicity' ? ethnicityReference(country) : undefined
  const name = ethnicity?.name ?? region.name
  // Age is the comparable series when a census ethnicity breakdown is absent.
  const showAgeReference = mode === 'ethnicity' && (!ethnicity || (background !== skipEthnicity && !Object.hasOwn(ethnicity.groups, background)))
  const share = showAgeReference ? region.shares[3] : mode === 'ethnicity' ? (background === skipEthnicity ? 100 : ethnicity?.groups[background] ?? null)
    : mode === 'age' ? (ageIndex > 0 ? region.shares[ageIndex + 1] : 100)
    : gender === 'female' ? region.shares[1] : gender === 'male' ? region.shares[0] : 100
  const label = showAgeReference ? 'Age distribution · Ages 18–24' : mode === 'ethnicity' ? background === skipEthnicity ? 'Ethnic background' : formatEthnicityLabel(background)
    : mode === 'age' ? ageIndex > 0 ? (ageIndex === 1 ? ageBand! : `Ages ${ageBand}`) : 'All ages'
    : gender === 'male' ? 'Male population' : gender === 'female' ? 'Female population' : gender === 'other' ? 'All genders' : 'Total population'
  const rows = mode === 'ethnicity' ? 11 : mode === 'profile' ? 9 : 7
  const activeCount = share ? Math.max(1, Math.round(share * rows * columns.length / 100)) : 0
  const source = showAgeReference ? populationSource : ethnicity?.source ?? populationSource
  const caption = share === null ? 'No comparable estimate' : 'of the population'
  const rowHeight = 24

  return <div className="desktop-population" data-population-step={mode}>
    <div className="desktop-population-heading">
      <span>{showAgeReference ? region.name : name}{region.scope === 'region' ? ' reference' : ''} · {showAgeReference ? 2025 : ethnicity?.year ?? 2025}</span>
      <strong><TextMorph>{label}</TextMorph></strong>
    </div>
    <svg className="desktop-population-grid" viewBox="0 0 540 264" aria-hidden="true">
      {Array.from({ length: 11 }, (_, row) => {
        const shown = row < rows
        return <motion.g key={row} className="desktop-population-row" data-visible={shown}
          initial={false} animate={{ opacity: shown ? 1 : 0, y: shown ? (11 - rows) * rowHeight / 2 : 10 }}
          transition={{ duration: reduce ? 0 : .48, ease, delay: reduce || shown ? 0 : (10 - row) * .024 }}>
          {columns.map(column => {
            const active = row * columns.length + column < activeCount
            return <motion.rect key={column} x={column * 27 + 2} y={row * rowHeight + 4}
              width="20" height="15" rx="4" initial={false} animate={{ fill: active ? '#171716' : '#e9e9eb' }}
              transition={{ duration: reduce ? 0 : .3, delay: reduce ? 0 : (column + row) * .005 }} />
          })}
        </motion.g>
      })}
    </svg>
    <div className="desktop-population-footer">
      <div className="desktop-population-readout" aria-live="polite" aria-atomic="true">
        <strong>{share === null ? '—' : `${mode === 'ethnicity' && share !== 100 ? '≈' : ''}${formatShare.format(share)}%`}</strong><span>{caption}</span>
      </div>
      <a href={source} title="Demographic context only. These figures do not affect your report." target="_blank" rel="noreferrer">
        {mode === 'ethnicity' ? 'About this population data' : 'Who you are competing with'}
      </a>
    </div>
  </div>
}
