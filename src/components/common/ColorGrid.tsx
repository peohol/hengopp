import { useId } from 'react'
import { OBJECT_PALETTE, PALETTE_HUE_COUNT, isPaletteColor } from '@/models/palette'

type Props = {
  label: string
  value: string
  onChange: (hex: string) => void
  testId?: string
}

/**
 * The object palette as a hue × brightness grid of radio buttons. Native radios
 * give us keyboard navigation and selection semantics for free; the visible
 * swatch is the label.
 */
export function ColorGrid({ label, value, onChange, testId }: Props) {
  const id = useId()
  const selected = value.trim().toLowerCase()

  return (
    <div className="field">
      <span className="field__label" id={`${id}-label`}>
        {label}
      </span>
      <div
        className="color-grid"
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        data-testid={testId}
        style={{ gridTemplateColumns: `repeat(${PALETTE_HUE_COUNT}, minmax(0, 1fr))` }}
      >
        {OBJECT_PALETTE.map((hex) => (
          <label
            key={hex}
            className={`color-grid__cell${hex === selected ? ' is-selected' : ''}`}
            style={{ background: hex }}
            title={hex}
            data-color={hex}
          >
            <input
              type="radio"
              name={id}
              value={hex}
              checked={hex === selected}
              onChange={() => onChange(hex)}
            />
            <span className="visually-hidden">{hex}</span>
          </label>
        ))}
      </div>
      {isPaletteColor(selected) ? null : (
        <span className="hint" data-testid={testId ? `${testId}-custom` : undefined}>
          Egendefinert farge {selected} – velg en rute for å bytte til paletten.
        </span>
      )}
    </div>
  )
}
