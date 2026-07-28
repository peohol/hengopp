type Option<T extends string> = { value: T; label: string; title?: string }

type Props<T extends string> = {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  hideLabel?: boolean
  /** Stack the options vertically — reads like a radio group and fits long labels. */
  stacked?: boolean
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
  stacked,
  testId,
}: Props<T>) {
  return (
    <div className={`field${stacked ? ' field--block' : ''}`}>
      <span className={hideLabel ? 'visually-hidden' : 'field__label'} id={`${testId ?? label}-label`}>
        {label}
      </span>
      <div
        className={`seg${stacked ? ' seg--stacked' : ''}`}
        role="group"
        aria-label={label}
        data-testid={testId}
      >
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
            {stacked ? <span className="seg__dot" aria-hidden="true" /> : null}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
