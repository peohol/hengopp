import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '@/components/icons/Icon'
import { Tooltip } from './Tooltip'

type PopoverProps = {
  icon: IconName
  label: string
  hint?: string
  showLabel?: boolean
  align?: 'left' | 'right'
  disabled?: boolean
  active?: boolean
  title?: string
  children: (close: () => void) => ReactNode
  testId?: string
}

const GAP = 6
const MARGIN = 8

/**
 * Button + popover panel. The panel is portalled to the body and positioned
 * with fixed coordinates so it is never clipped by the scrolling toolbar.
 * Opening a popover never touches the document, so it never creates history.
 */
export function Popover({
  icon,
  label,
  hint,
  showLabel,
  align = 'left',
  disabled,
  active,
  title,
  children,
  testId,
}: PopoverProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const update = () => {
      const anchor = buttonRef.current?.getBoundingClientRect()
      if (!anchor) return
      const width = panelRef.current?.offsetWidth ?? 260
      const preferred = align === 'right' ? anchor.right - width : anchor.left
      const left = Math.max(MARGIN, Math.min(window.innerWidth - width - MARGIN, preferred))

      // The panel is fixed, so the page can never scroll it into view: it must
      // always fit the viewport on its own. Flip above the anchor when there is
      // more room there, and cap the height to whatever that side really has.
      const spaceBelow = Math.max(0, window.innerHeight - anchor.bottom - GAP - MARGIN)
      const spaceAbove = Math.max(0, anchor.top - GAP - MARGIN)
      const needed = panelRef.current?.scrollHeight ?? 0
      const above = needed > spaceBelow && spaceAbove > spaceBelow
      const maxHeight = above ? spaceAbove : spaceBelow
      const top = above
        ? Math.max(MARGIN, anchor.top - GAP - Math.min(needed || maxHeight, maxHeight))
        : anchor.bottom + GAP
      setPosition({ top, left, maxHeight })
    }
    update()
    // A second pass once the panel has its real width.
    const raf = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
    )
    focusable?.focus()
  }, [open])

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="popover"
            id={id}
            ref={panelRef}
            role="dialog"
            aria-label={title ?? label}
            style={{
              position: 'fixed',
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              maxHeight: position?.maxHeight,
              overflowY: 'auto',
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            {title ? <p className="popover__title">{title}</p> : null}
            {children(close)}
          </div>,
          document.body,
        )
      : null

  return (
    <div className="popover-anchor">
      <Tooltip label={hint ? `${label} · ${hint}` : label}>
        <button
          ref={buttonRef}
          type="button"
          className={`btn${showLabel ? '' : ' btn--icon'}${active ? ' is-active' : ''}`}
          aria-label={showLabel ? undefined : label}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? id : undefined}
          disabled={disabled}
          data-testid={testId}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={icon} />
          {showLabel ? <span>{label}</span> : null}
          <Icon name="chevronDown" size={12} />
        </button>
      </Tooltip>
      {panel}
    </div>
  )
}
