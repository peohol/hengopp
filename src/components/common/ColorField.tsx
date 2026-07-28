import { useEffect, useId, useState } from 'react'
import { isValidHex, normaliseHex } from '@/utils/colors'

type Props = {
  label: string
  value: string
  onChange: (hex: string) => void
  disabled?: boolean
  testId?: string
  hideLabel?: boolean
}

/** Colour swatch + hex input. Both stay in sync and validate the same way. */
export function ColorField({ label, value, onChange, disabled, testId, hideLabel }: Props) {
  const id = useId()
  const errorId = `${id}-err`
  const [text, setText] = useState(value)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(value)
    setError(null)
  }, [value])

  const commitText = (raw: string) => {
    setText(raw)
    const hex = normaliseHex(raw)
    if (!hex) {
      setError('Bruk en hex-farge, for eksempel #c9d7e6')
      return
    }
    setError(null)
    onChange(hex)
  }

  return (
    <div className="field">
      <label className={hideLabel ? 'visually-hidden' : 'field__label'} htmlFor={id}>
        {label}
      </label>
      <div className="row" style={{ gap: 6 }}>
        <span
          className="swatch"
          style={{ background: isValidHex(value) ? value : '#ffffff' }}
          aria-hidden="true"
        >
          <input
            type="color"
            value={isValidHex(value) ? value : '#ffffff'}
            disabled={disabled}
            tabIndex={-1}
            aria-label={`${label} – fargevelger`}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
        <div className={`field__row${error ? ' is-invalid' : ''}`}>
          <input
            id={id}
            type="text"
            autoComplete="off"
            spellCheck={false}
            style={{ width: 92 }}
            value={text}
            disabled={disabled}
            data-testid={testId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => commitText(e.target.value)}
            onBlur={() => {
              if (error) {
                setText(value)
                setError(null)
              }
            }}
          />
        </div>
      </div>
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
