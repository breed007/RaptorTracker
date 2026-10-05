// Units of measure on the client. Values arrive in whatever units the owner
// stores (the server converts everything when they switch), so this only
// labels and formats — except fuel economy, which is derived from stored
// distance ÷ volume and shown in the chosen economy unit.

export const DEFAULT_UNITS = { distance: 'mi', volume: 'gal', economy: 'mpg', pressure: 'psi', currency: 'USD' }

const MI_PER_KM = 1 / 1.609344
const GAL_PER_L = 1 / 3.785411784

const ECON_LABEL = { mpg: 'mpg', mpg_imp: 'mpg', l100km: 'L/100 km', kml: 'km/L' }
const PRESSURE_LABEL = { psi: 'psi', kpa: 'kPa', bar: 'bar' }

export function makeUnits(raw = DEFAULT_UNITS) {
  const u = { ...DEFAULT_UNITS, ...(raw || {}) }
  const km = u.distance === 'km'
  const liters = u.volume === 'l'

  const moneyFmt = (decimals) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: u.currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    } catch (_) {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    }
  }
  const money2 = moneyFmt(2)
  const money0 = moneyFmt(0)
  const money3 = moneyFmt(3)
  const symbol = (money0.formatToParts(0).find(p => p.type === 'currency') || {}).value || '$'

  // Stored distance-per-volume -> US mpg -> chosen unit.
  const toMpgUs = (dpv) => dpv * (km ? MI_PER_KM : 1) / (liters ? GAL_PER_L : 1)
  const fromMpgUs = (mpg) => {
    switch (u.economy) {
      case 'mpg_imp': return mpg * 1.200949925
      case 'l100km': return 235.214583 / mpg
      case 'kml': return mpg * 0.425143707
      default: return mpg
    }
  }
  const num = (n, digits = 0) => Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })

  return {
    raw: u,
    dist: km ? 'km' : 'mi',
    distLong: km ? 'kilometers' : 'miles',
    distOne: km ? 'kilometer' : 'mile',
    distTitle: km ? 'Kilometers' : 'Miles',
    distOneTitle: km ? 'Kilometer' : 'Mile',
    vol: liters ? 'L' : 'gal',
    volLong: liters ? 'liters' : 'gallons',
    econ: ECON_LABEL[u.economy] || 'mpg',
    econName: u.economy === 'mpg_imp' ? 'mpg (UK)' : (ECON_LABEL[u.economy] || 'mpg'),
    // L/100 km is consumption: a smaller number is better.
    lowerIsBetter: u.economy === 'l100km',
    pressure: PRESSURE_LABEL[u.pressure] || 'psi',
    currency: u.currency,
    symbol,
    perVol: `${symbol}/${liters ? 'L' : 'gal'}`,
    perDist: `/${km ? 'km' : 'mi'}`,

    money: (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : money2.format(Number(n))),
    money0: (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : money0.format(Number(n))),
    money3: (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : money3.format(Number(n))),
    fmtDist: (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${num(Math.round(Number(n)))} ${km ? 'km' : 'mi'}`),
    fmtVol: (n, digits = 1) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${num(n, digits)} ${liters ? 'L' : 'gal'}`),
    /** A pressure as a bare number, rounded for the unit (bar keeps two decimals). */
    pressureNum: (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : num(n, u.pressure === 'bar' ? 2 : 0)),
    fmtPressure: (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${num(n, u.pressure === 'bar' ? 2 : 0)} ${PRESSURE_LABEL[u.pressure] || 'psi'}`),

    /** Fuel economy from stored distance÷volume, in the chosen unit (null if unknown). */
    economy: (dpv) => (dpv > 0 ? fromMpgUs(toMpgUs(dpv)) : null),
    /** Stored distance÷volume as US mpg — the one scale for 'better/worse', whatever is displayed. */
    toMpgUs: (dpv) => (dpv > 0 ? toMpgUs(dpv) : null),
    /** EPA figures are published in US mpg. */
    economyFromMpg: (mpg) => (mpg > 0 ? fromMpgUs(mpg) : null),
    fmtEcon: (v) => (v == null ? '—' : `${num(v, 1)} ${ECON_LABEL[u.economy] || 'mpg'}`),
  }
}

// The same units for plain helper functions outside components (a page's
// module-level money() formatter, say). AppContext keeps this in step with the
// owner's settings; components should still prefer useUnits().
let current = makeUnits(DEFAULT_UNITS)
export const currentUnits = () => current
export function setCurrentUnits(u) { current = u }
