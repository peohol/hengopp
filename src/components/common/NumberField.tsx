import { useEffect, useId, useRef, useState } from 'react'
import type { Unit } from '@/models/project'
import { UNIT_LABEL, formatNumber, formatPlain, parseLengthToMm, parseNumberInput, roundMm } from '@/utils/units'

type LengthFieldProps = {
  label: string
  valueMm: number
  unit: Unit
  stepMm: number
  onCommit: (valueMm: number) => void
  /** Called when the user starts editing — used to open a transaction. */
  onEditStart?: () => void
  /** Live preview while the typed value is valid. */
  onPreview?: (valueMm: number) => void
  /** Called when the user aborts with Escape. */
  onCancel?: () => void
  positiveOnly?: boolean
  disabled?: boolean
  widthPx?: number
  testId?: string
  hideLabel?: boolean
}

/**
 * Length input in the project's display unit.
 * Live-previews valid values, commits on Enter or blur, reverts on Escape.
 * One completed edit produces exactly one history action.
 */
export function LengthField({
  label,
  valueMm,
  unit,
  stepMm,
  onCommit,
  onEditStart,
  onPreview,
  onCancel,
  positiveOnly,
  disabled,
  widthPx = 78,
  testId,
  hideLabel,
}: LengthFieldProps) {
  const id = useId()
  const errorId = `${id}-err`
  const [text, setText] = useState(() => formatNumber(valueMm, unit))
  const [error, setError] = useState<string | null>(null)
  const focusedRef = useRef(false)
  const editingRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) {
      setText(formatNumber(valueMm, unit))
      setError(null)
    }
  }, [valueMm, unit])

  const beginEdit = () => {
    if (editingRef.current) return
    editingRef.current = true
    onEditStart?.()
  }

  const finishEdit = (commit: boolean) => {
    if (!editingRef.current) {
      if (!commit) setText(formatNumber(valueMm, unit))
      return
    }
    editingRef.current = false
    if (!commit) {
      onCancel?.()
      setText(formatNumber(valueMm, unit))
      setError(null)
      return
    }
    const parsed = parseLengthToMm(text, unit)
    if (!parsed.ok || (positiveOnly && parsed.value <= 0)) {
      onCancel?.()
      setText(formatNumber(valueMm, unit))
      setError(null)
      return
    }
    onCommit(roundMm(parsed.value))
    setError(null)
  }

  const handleChange = (next: string) => {
    setText(next)
    const parsed = parseLengthToMm(next, unit)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    if (positiveOnly && parsed.value <= 0) {
      setError('Må være større enn 0')
      return
    }
    setError(null)
    beginEdit()
    onPreview?.(roundMm(parsed.value))
  }

  const nudge = (direction: 1 | -1) => {
    const next = roundMm(valueMm + direction * stepMm)
    if (positiveOnly && next <= 0) return
    onCommit(next)
  }

  return (
    <div className="field">
      <label className={hideLabel ? 'visually-hidden' : 'field__label'} htmlFor={id}>
        {label}
      </label>
      <div className={`field__row${error ? ' is-invalid' : ''}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          style={{ width: widthPx }}
          value={text}
          disabled={disabled}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => {
            focusedRef.current = true
          }}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            focusedRef.current = false
            finishEdit(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              finishEdit(true)
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              finishEdit(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <span className="field__suffix">{UNIT_LABEL[unit]}</span>
        <span className="field__step">
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Øk ${label}`}
            disabled={disabled}
            onClick={() => nudge(1)}
          >
            ▲
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Reduser ${label}`}
            disabled={disabled}
            onClick={() => nudge(-1)}
          >
            ▼
          </button>
        </span>
      </div>
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}

type PlainFieldProps = {
  label: string
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  widthPx?: number
  testId?: string
  hideLabel?: boolean
}

/** Unitless numeric input (grid cell counts). Accepts decimals and commas. */
export function PlainNumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 0.5,
  disabled,
  widthPx = 72,
  testId,
  hideLabel,
}: PlainFieldProps) {
  const id = useId()
  const errorId = `${id}-err`
  const [text, setText] = useState(() => formatPlain(value))
  const [error, setError] = useState<string | null>(null)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setText(formatPlain(value))
  }, [value])

  const validate = (raw: string): number | null => {
    const parsed = parseNumberInput(raw)
    if (!parsed.ok) {
      setError(parsed.error)
      return null
    }
    if (min !== undefined && parsed.value < min) {
      setError(`Må være minst ${formatPlain(min)}`)
      return null
    }
    if (max !== undefined && parsed.value > max) {
      setError(`Må være høyst ${formatPlain(max)}`)
      return null
    }
    setError(null)
    return parsed.value
  }

  const commit = () => {
    const parsed = validate(text)
    if (parsed === null) {
      setText(formatPlain(value))
      setError(null)
      return
    }
    onCommit(parsed)
  }

  return (
    <div className="field">
      <label className={hideLabel ? 'visually-hidden' : 'field__label'} htmlFor={id}>
        {label}
      </label>
      <div className={`field__row${error ? ' is-invalid' : ''}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          style={{ width: widthPx }}
          value={text}
          disabled={disabled}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => {
            focusedRef.current = true
          }}
          onChange={(e) => {
            setText(e.target.value)
            validate(e.target.value)
          }}
          onBlur={() => {
            focusedRef.current = false
            commit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setText(formatPlain(value))
              setError(null)
            }
          }}
        />
        <span className="field__step">
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Øk ${label}`}
            disabled={disabled}
            onClick={() => onCommit(clamp(value + step, min, max))}
          >
            ▲
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Reduser ${label}`}
            disabled={disabled}
            onClick={() => onCommit(clamp(value - step, min, max))}
          >
            ▼
          </button>
        </span>
      </div>
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}

function clamp(value: number, min?: number, max?: number): number {
  let v = value
  if (min !== undefined) v = Math.max(min, v)
  if (max !== undefined) v = Math.min(max, v)
  return Math.round(v * 1e6) / 1e6
}
