type Option<T extends string> = { value: T; label: string; title?: string }

type Props<T extends string> = {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  hideLabel?: boolean
  testId?: string
}

/** Small segmented control. Selection is conveyed by text weight + outline, not colour alone. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  hideLabel,
  testId,
}: Props<T>) {
  return (
    <div className="field">
      <span className={hideLabel ? 'visually-hidden' : 'field__label'} id={`${testId ?? label}-label`}>
        {label}
      </span>
      <div className="seg" role="group" aria-label={label} data-testid={testId}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            title={opt.title ?? opt.label}
            disabled={disabled}
            data-testid={testId ? `${testId}-${opt.value}` : undefined}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
