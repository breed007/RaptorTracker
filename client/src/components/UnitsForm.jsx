import React from 'react'

export const PRESETS = [
  { key: 'us', label: 'US', units: { distance: 'mi', volume: 'gal', economy: 'mpg', pressure: 'psi' } },
  { key: 'uk', label: 'UK', units: { distance: 'mi', volume: 'l', economy: 'mpg_imp', pressure: 'psi' } },
  { key: 'metric', label: 'Metric', units: { distance: 'km', volume: 'l', economy: 'l100km', pressure: 'kpa' } },
]

const FIELDS = [
  { key: 'distance', label: 'Distance', options: [['mi', 'Miles'], ['km', 'Kilometers']] },
  { key: 'volume', label: 'Fuel volume', options: [['gal', 'US gallons'], ['l', 'Liters']] },
  { key: 'economy', label: 'Fuel economy', options: [['mpg', 'mpg (US)'], ['mpg_imp', 'mpg (UK)'], ['l100km', 'L/100 km'], ['kml', 'km/L']] },
  { key: 'pressure', label: 'Tire pressure', options: [['psi', 'psi'], ['kpa', 'kPa'], ['bar', 'bar']] },
]

const COMMON_CURRENCIES = ['USD', 'CAD', 'MXN', 'GBP', 'EUR', 'AUD', 'NZD', 'ZAR', 'AED', 'SAR', 'CHF', 'SEK', 'NOK', 'JPY']

export const presetFor = (u) =>
  PRESETS.find(p => Object.entries(p.units).every(([k, v]) => u[k] === v))?.key || 'custom'

/** Units and currency pickers, shared by first-run setup and Settings. */
export default function UnitsForm({ value, onChange, idPrefix = 'units' }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const preset = presetFor(value)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Unit presets">
        {PRESETS.map(p => (
          <button
            key={p.key} type="button" aria-pressed={preset === p.key}
            onClick={() => onChange({ ...value, ...p.units })}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              preset === p.key
                ? 'bg-raptor-accent text-white border-raptor-accent'
                : 'border-raptor-border text-raptor-secondary hover:text-raptor-primary'}`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && <span className="px-2 py-1.5 text-sm text-raptor-muted">Custom</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map(f => (
          <div key={f.key}>
            <label className="label" htmlFor={`${idPrefix}-${f.key}`}>{f.label}</label>
            <select id={`${idPrefix}-${f.key}`} value={value[f.key]} onChange={e => set(f.key, e.target.value)} className="input-field">
              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="label" htmlFor={`${idPrefix}-currency`}>Currency</label>
          <input
            id={`${idPrefix}-currency`} list={`${idPrefix}-currency-list`}
            value={value.currency} maxLength={3} spellCheck={false}
            onChange={e => set('currency', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            className="input-field font-mono uppercase w-28"
          />
          <datalist id={`${idPrefix}-currency-list`}>
            {COMMON_CURRENCIES.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>
    </div>
  )
}
