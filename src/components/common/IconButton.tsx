import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from '@/components/icons/Icon'
import { Tooltip } from './Tooltip'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName
  /** Accessible name; also used as the tooltip text. */
  label: string
  /** Extra tooltip detail, e.g. the keyboard shortcut. */
  hint?: string
  showLabel?: boolean
  variant?: 'default' | 'ghost' | 'primary' | 'danger'
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { icon, label, hint, showLabel, variant = 'default', active, className, ...rest },
  ref,
) {
  const classes = [
    'btn',
    showLabel ? '' : 'btn--icon',
    variant === 'ghost' ? 'btn--ghost' : '',
    variant === 'primary' ? 'btn--primary' : '',
    variant === 'danger' ? 'btn--danger' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const button = (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-label={showLabel ? undefined : label}
      aria-pressed={active === undefined ? undefined : active}
      {...rest}
    >
      <Icon name={icon} />
      {showLabel ? <span>{label}</span> : null}
    </button>
  )

  return <Tooltip label={hint ? `${label} · ${hint}` : label}>{button}</Tooltip>
})
